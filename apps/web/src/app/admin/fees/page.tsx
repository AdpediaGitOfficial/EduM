'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader,
  Select, Spinner, StatusBadge, Tabs,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { Donut, TrendLine } from '@/components/charts';
import { useClasses, SectionPicker } from '@/features/pickers';

interface Structure {
  id: string; name: string; category: string; amount: string; active: boolean;
  class: { id: string; name: string } | null;
}
interface InvoiceRow {
  id: string; invoiceNo: string; status: string; dueDate: string;
  totalAmount: string; discount: string; lateFee: string;
  paidAmount: number; dueAmount: number;
  student: { admissionNo: string; user: { firstName: string; lastName: string }; section: { name: string; class: { name: string } } | null };
}

const CATEGORIES = ['annual', 'monthly', 'transport', 'library', 'hostel', 'exam', 'other'];

function StructuresTab() {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data, isLoading } = useQuery({ queryKey: ['fee-structures'], queryFn: () => api<Structure[]>('/fees/structures') });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'annual', amount: '', classId: '' });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api('/fees/structures', {
      method: 'POST',
      body: { name: form.name, category: form.category, amount: Number(form.amount), classId: form.classId || undefined },
    }),
    onSuccess: () => { setOpen(false); setError(''); qc.invalidateQueries({ queryKey: ['fee-structures'] }); },
    onError: (e: Error) => setError(e.message),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/fees/structures/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-structures'] }),
  });

  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader
        title="Fee structures"
        subtitle="Categories: annual / monthly / transport / library / hostel"
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add structure</Button>}
      />
      <table className="w-full text-sm">
        <tbody>
          {(data ?? []).map((s) => (
            <tr key={s.id} className={`border-b border-slate-50 dark:border-slate-800/50 ${!s.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2 font-medium">{s.name}</td>
              <td className="px-4 py-2"><Badge tone="brand">{s.category}</Badge></td>
              <td className="px-4 py-2">{s.class?.name ?? 'All classes'}</td>
              <td className="px-4 py-2 text-right font-semibold">{fmtMoney(s.amount)}</td>
              <td className="px-4 py-2 text-right">
                {s.active ? (
                  <Button size="sm" variant="ghost" onClick={() => deactivate.mutate(s.id)}>Deactivate</Button>
                ) : <Badge>inactive</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add fee structure">
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Grade 6 Annual Tuition" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)"><Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
          </div>
          <Field label="Class (optional)">
            <Select value={form.classId} onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}>
              <option value="">All classes</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.name || !form.amount} loading={create.isPending}>Create</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function InvoicesTab() {
  const qc = useQueryClient();
  const { data: structures } = useQuery({ queryKey: ['fee-structures'], queryFn: () => api<Structure[]>('/fees/structures') });
  const { data: classes } = useClasses();
  const [refreshKey, setRefreshKey] = useState(0);
  const [genOpen, setGenOpen] = useState(false);
  const [editRow, setEditRow] = useState<InvoiceRow | null>(null);
  const [editForm, setEditForm] = useState({ discount: '', lateFee: '', dueDate: '' });
  const [gen, setGen] = useState({ classId: '', sectionId: '', feeStructureIds: [] as string[], dueDate: '', installments: 1, discount: '' });
  const [error, setError] = useState('');

  const generate = useMutation({
    mutationFn: () => api('/fees/generate', {
      method: 'POST',
      body: {
        classId: gen.classId || undefined,
        sectionId: gen.sectionId || undefined,
        feeStructureIds: gen.feeStructureIds,
        dueDate: gen.dueDate,
        installments: Number(gen.installments),
        discount: gen.discount ? Number(gen.discount) : undefined,
      },
    }),
    onSuccess: () => { setGenOpen(false); setError(''); setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
    onError: (e: Error) => setError(e.message),
  });

  const updateInvoice = useMutation({
    mutationFn: () => api(`/fees/invoices/${editRow!.id}`, {
      method: 'PATCH',
      body: {
        ...(editForm.discount !== '' ? { discount: Number(editForm.discount) } : {}),
        ...(editForm.lateFee !== '' ? { lateFee: Number(editForm.lateFee) } : {}),
        ...(editForm.dueDate ? { dueDate: editForm.dueDate } : {}),
      },
    }),
    onSuccess: () => { setEditRow(null); setError(''); setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setGenOpen(true); setError(''); }}><FileText className="h-4 w-4" /> Generate invoices</Button>
      </div>
      <DataTable<InvoiceRow>
        endpoint="/fees/invoices"
        refreshKey={refreshKey}
        searchPlaceholder="Search invoice no or student…"
        filters={[
          { key: 'status', label: 'Status', options: ['issued', 'partial', 'paid', 'overdue', 'cancelled'].map((s) => ({ value: s, label: s })) },
          ...(classes ? [{ key: 'classId', label: 'Class', options: classes.map((c) => ({ value: c.id, label: c.name })) }] : []),
        ]}
        columns={[
          { key: 'invoiceNo', header: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.invoiceNo}</span> },
          { key: 'student', header: 'Student', render: (r) => (
            <div>
              <p className="font-medium">{r.student.user.firstName} {r.student.user.lastName}</p>
              <p className="text-xs text-slate-400">{r.student.section ? `${r.student.section.class.name}-${r.student.section.name}` : ''}</p>
            </div>
          ) },
          { key: 'totalAmount', header: 'Total', render: (r) => fmtMoney(Number(r.totalAmount) - Number(r.discount) + Number(r.lateFee)) },
          { key: 'paidAmount', header: 'Paid', render: (r) => <span className="text-ok-600">{fmtMoney(r.paidAmount)}</span> },
          { key: 'dueAmount', header: 'Due', render: (r) => r.dueAmount > 0 ? <span className="font-semibold text-danger-600">{fmtMoney(r.dueAmount)}</span> : '—' },
          { key: 'dueDate', header: 'Due date', render: (r) => fmtDate(r.dueDate) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        actions={(r) => (
          <Button size="sm" variant="ghost" onClick={() => {
            setEditRow(r);
            setEditForm({ discount: String(r.discount), lateFee: String(r.lateFee), dueDate: r.dueDate.slice(0, 10) });
          }}>Adjust</Button>
        )}
      />

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate invoices" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Class (all students in it)">
              <Select value={gen.classId} onChange={(e) => setGen((g) => ({ ...g, classId: e.target.value, sectionId: '' }))}>
                <option value="">—</option>
                {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="…or a single section">
              <SectionPicker value={gen.sectionId} onChange={(v) => setGen((g) => ({ ...g, sectionId: v, classId: '' }))} allowAll />
            </Field>
          </div>
          <Field label="Fee structures to include">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {structures?.filter((s) => s.active).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={gen.feeStructureIds.includes(s.id)}
                    onChange={(e) => setGen((g) => ({
                      ...g,
                      feeStructureIds: e.target.checked
                        ? [...g.feeStructureIds, s.id]
                        : g.feeStructureIds.filter((x) => x !== s.id),
                    }))}
                  />
                  {s.name} — {fmtMoney(s.amount)} {s.class ? `(${s.class.name})` : ''}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Due date *"><Input type="date" value={gen.dueDate} onChange={(e) => setGen((g) => ({ ...g, dueDate: e.target.value }))} /></Field>
            <Field label="Installments">
              <Select value={String(gen.installments)} onChange={(e) => setGen((g) => ({ ...g, installments: Number(e.target.value) }))}>
                {[1, 2, 3, 4, 6, 12].map((n) => <option key={n} value={n}>{n === 1 ? 'One-time' : `${n} installments`}</option>)}
              </Select>
            </Field>
            <Field label="Discount/scholarship (₹)"><Input type="number" value={gen.discount} onChange={(e) => setGen((g) => ({ ...g, discount: e.target.value }))} /></Field>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button
              onClick={() => generate.mutate()}
              disabled={gen.feeStructureIds.length === 0 || !gen.dueDate}
              loading={generate.isPending}
            >
              Generate
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={`Adjust ${editRow?.invoiceNo}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount / scholarship (₹)"><Input type="number" value={editForm.discount} onChange={(e) => setEditForm((f) => ({ ...f, discount: e.target.value }))} /></Field>
            <Field label="Late fee (₹)"><Input type="number" value={editForm.lateFee} onChange={(e) => setEditForm((f) => ({ ...f, lateFee: e.target.value }))} /></Field>
          </div>
          <Field label="Due date"><Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={() => updateInvoice.mutate()} loading={updateInvoice.isPending}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FeeAnalyticsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['fee-analytics'],
    queryFn: () => api<{ invoiced: number; collected: number; outstanding: number; collectionRate: number; byStatus: Record<string, number>; byMethod: Record<string, number>; trend: { month: string; amount: number }[] }>('/fees/analytics'),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs uppercase text-slate-400">Invoiced</p><p className="text-xl font-bold">{fmtMoney(data.invoiced)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-slate-400">Collected</p><p className="text-xl font-bold text-ok-600">{fmtMoney(data.collected)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-slate-400">Outstanding</p><p className="text-xl font-bold text-danger-600">{fmtMoney(data.outstanding)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-slate-400">Collection rate</p><p className="text-xl font-bold text-brand-600">{data.collectionRate}%</p></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Monthly collections" /><div className="p-3"><TrendLine data={data.trend} xKey="month" yKey="amount" /></div></Card>
        <Card><CardHeader title="Invoice status" /><div className="p-3"><Donut data={Object.entries(data.byStatus).map(([name, value]) => ({ name, value }))} /></div></Card>
      </div>
    </div>
  );
}

export default function AdminFeesPage() {
  const [tab, setTab] = useState('invoices');
  return (
    <div>
      <PageHeader title="Fees" subtitle="Structures, invoice generation, discounts, installments & analytics" />
      <Tabs
        tabs={[
          { key: 'invoices', label: 'Invoices' },
          { key: 'structures', label: 'Structures & categories' },
          { key: 'analytics', label: 'Analytics' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'analytics' && <FeeAnalyticsTab />}
    </div>
  );
}
