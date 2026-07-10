'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Undo2 } from 'lucide-react';
import { api, apiDownload, Paged } from '@/lib/api';
import { fmtDateTime, fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Field, Input, Modal, PageHeader, Select, StatusBadge,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface PaymentRow {
  id: string;
  receiptNo: string;
  amount: string;
  method: string;
  status: string;
  reference: string | null;
  paidAt: string;
  invoice: { invoiceNo: string; student: { id: string; admissionNo: string; user: { firstName: string; lastName: string } } };
}

interface InvoiceLite {
  id: string; invoiceNo: string; dueAmount: number;
  student: { user: { firstName: string; lastName: string } };
}

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [recordOpen, setRecordOpen] = useState(false);
  const [refundRow, setRefundRow] = useState<PaymentRow | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [form, setForm] = useState({ invoiceId: '', amount: '', method: 'cash', reference: '' });
  const [error, setError] = useState('');

  const { data: openInvoices } = useQuery({
    queryKey: ['open-invoices', invoiceSearch],
    queryFn: () => api<Paged<InvoiceLite>>(`/fees/invoices?pageSize=20&search=${encodeURIComponent(invoiceSearch)}`),
    enabled: recordOpen,
  });

  const record = useMutation({
    mutationFn: () => api('/payments', {
      method: 'POST',
      body: { invoiceId: form.invoiceId, amount: Number(form.amount), method: form.method, reference: form.reference || undefined },
    }),
    onSuccess: () => { setRecordOpen(false); setError(''); setForm({ invoiceId: '', amount: '', method: 'cash', reference: '' }); setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
    onError: (e: Error) => setError(e.message),
  });

  const refund = useMutation({
    mutationFn: () => api(`/payments/${refundRow!.id}/refund`, { method: 'POST', body: {} }),
    onSuccess: () => { setRefundRow(null); setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Transactions, receipts and refunds"
        actions={<Button onClick={() => { setRecordOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Record payment</Button>}
      />
      <DataTable<PaymentRow>
        endpoint="/payments"
        refreshKey={refreshKey}
        searchPlaceholder="Search receipt no…"
        filters={[
          { key: 'method', label: 'Method', options: ['cash', 'card', 'upi', 'bank_transfer', 'online_gateway', 'cheque'].map((m) => ({ value: m, label: m.replace('_', ' ') })) },
          { key: 'status', label: 'Status', options: ['success', 'pending', 'failed', 'refunded'].map((s) => ({ value: s, label: s })) },
        ]}
        columns={[
          { key: 'receiptNo', header: 'Receipt', render: (p) => <span className="font-mono text-xs">{p.receiptNo}</span> },
          { key: 'student', header: 'Student', render: (p) => `${p.invoice.student.user.firstName} ${p.invoice.student.user.lastName}` },
          { key: 'invoice', header: 'Invoice', render: (p) => <span className="text-xs text-slate-400">{p.invoice.invoiceNo}</span> },
          { key: 'method', header: 'Method', render: (p) => <Badge>{p.method.replace('_', ' ')}</Badge> },
          { key: 'amount', header: 'Amount', render: (p) => <span className="font-semibold">{fmtMoney(p.amount)}</span> },
          { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
          { key: 'paidAt', header: 'Date', render: (p) => <span className="text-xs text-slate-400">{fmtDateTime(p.paidAt)}</span> },
        ]}
        actions={(p) => (
          <>
            <Button size="sm" variant="ghost" title="Receipt PDF" onClick={() => apiDownload(`/payments/${p.id}/receipt`, `${p.receiptNo}.pdf`)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            {p.status === 'success' && (
              <Button size="sm" variant="ghost" title="Refund" onClick={() => setRefundRow(p)}>
                <Undo2 className="h-3.5 w-3.5 text-danger-500" />
              </Button>
            )}
          </>
        )}
      />

      <Modal open={recordOpen} onClose={() => setRecordOpen(false)} title="Record offline payment">
        <div className="space-y-3">
          <Field label="Find invoice (search student/invoice no)">
            <Input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="INV-2026-… or name" />
          </Field>
          <Field label="Invoice">
            <Select value={form.invoiceId} onChange={(e) => setForm((f) => ({ ...f, invoiceId: e.target.value }))}>
              <option value="">Select…</option>
              {openInvoices?.items.filter((i) => i.dueAmount > 0).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoiceNo} — {i.student.user.firstName} {i.student.user.lastName} (due {fmtMoney(i.dueAmount)})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)"><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
            <Field label="Method">
              <Select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
                {['cash', 'card', 'upi', 'bank_transfer', 'cheque'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Reference (txn id / cheque no)"><Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRecordOpen(false)}>Cancel</Button>
            <Button onClick={() => record.mutate()} disabled={!form.invoiceId || !form.amount} loading={record.isPending}>Record</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!refundRow} onClose={() => setRefundRow(null)} title="Refund payment">
        <p className="mb-4 text-sm">
          Refund <span className="font-bold">{fmtMoney(refundRow?.amount)}</span> from receipt {refundRow?.receiptNo}?
          A refund record will be created and the invoice status recalculated.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRefundRow(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => refund.mutate()} loading={refund.isPending}>Refund</Button>
        </div>
      </Modal>
    </div>
  );
}
