'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Play } from 'lucide-react';
import { api, apiDownload } from '@/lib/api';
import { fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Field, Input, Modal, PageHeader, Select, StatusBadge, Tabs,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface PayrollRow {
  id: string;
  month: string;
  baseSalary: string;
  allowances: string;
  deductions: string;
  netSalary: string;
  status: string;
  staff: { employeeNo: string; department: string | null; user: { firstName: string; lastName: string } };
}

interface LeaveRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  staff: { employeeNo: string; user: { firstName: string; lastName: string } };
}

function PayrollTab() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [genOpen, setGenOpen] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [editRow, setEditRow] = useState<PayrollRow | null>(null);
  const [editForm, setEditForm] = useState({ allowances: '', deductions: '', status: '' });
  const [error, setError] = useState('');

  const refresh = () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); };

  const generate = useMutation({
    mutationFn: () => api('/payroll/generate', { method: 'POST', body: { month } }),
    onSuccess: () => { setGenOpen(false); refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const update = useMutation({
    mutationFn: () => api(`/payroll/${editRow!.id}`, {
      method: 'PATCH',
      body: {
        ...(editForm.allowances !== '' ? { allowances: Number(editForm.allowances) } : {}),
        ...(editForm.deductions !== '' ? { deductions: Number(editForm.deductions) } : {}),
        ...(editForm.status ? { status: editForm.status } : {}),
      },
    }),
    onSuccess: () => { setEditRow(null); setError(''); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setGenOpen(true); setError(''); }}><Play className="h-4 w-4" /> Generate month</Button>
      </div>
      <DataTable<PayrollRow>
        endpoint="/payroll"
        refreshKey={refreshKey}
        filters={[{ key: 'status', label: 'Status', options: ['draft', 'processed', 'paid'].map((s) => ({ value: s, label: s })) }]}
        columns={[
          { key: 'month', header: 'Month', render: (r) => <span className="font-mono text-xs">{r.month}</span> },
          { key: 'staff', header: 'Employee', render: (r) => (
            <div>
              <p className="font-medium">{r.staff.user.firstName} {r.staff.user.lastName}</p>
              <p className="text-xs text-slate-400">{r.staff.employeeNo} · {r.staff.department ?? ''}</p>
            </div>
          ) },
          { key: 'baseSalary', header: 'Base', render: (r) => fmtMoney(r.baseSalary) },
          { key: 'allowances', header: 'Allowances', render: (r) => <span className="text-ok-600">+{fmtMoney(r.allowances)}</span> },
          { key: 'deductions', header: 'Deductions', render: (r) => <span className="text-danger-600">-{fmtMoney(r.deductions)}</span> },
          { key: 'netSalary', header: 'Net', render: (r) => <span className="font-semibold">{fmtMoney(r.netSalary)}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        actions={(r) => (
          <>
            <Button size="sm" variant="ghost" title="Payslip PDF" onClick={() => apiDownload(`/payroll/${r.id}/payslip`, `payslip-${r.month}.pdf`)}>
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              setEditRow(r);
              setEditForm({ allowances: String(r.allowances), deductions: String(r.deductions), status: r.status });
            }}>Edit</Button>
          </>
        )}
      />

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate payroll">
        <div className="space-y-3">
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <p className="text-xs text-slate-400">Creates draft payslips for every active staff member from their base salary (10% allowances, 8% deductions default — adjust per row afterwards). Already-generated rows are skipped.</p>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button onClick={() => generate.mutate()} loading={generate.isPending}>Generate</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={`${editRow?.staff.user.firstName} — ${editRow?.month}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Allowances (₹)"><Input type="number" value={editForm.allowances} onChange={(e) => setEditForm((f) => ({ ...f, allowances: e.target.value }))} /></Field>
            <Field label="Deductions (₹)"><Input type="number" value={editForm.deductions} onChange={(e) => setEditForm((f) => ({ ...f, deductions: e.target.value }))} /></Field>
          </div>
          <Field label="Status">
            <Select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
              {['draft', 'processed', 'paid'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={() => update.mutate()} loading={update.isPending}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LeaveTab() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      api(`/leave/${id}/decide`, { method: 'PATCH', body: { decision } }),
    onSuccess: () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <DataTable<LeaveRow>
      endpoint="/leave"
      refreshKey={refreshKey}
      filters={[{ key: 'status', label: 'Status', options: ['pending', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: s })) }]}
      columns={[
        { key: 'staff', header: 'Employee', render: (l) => `${l.staff.user.firstName} ${l.staff.user.lastName}` },
        { key: 'type', header: 'Type', render: (l) => <Badge>{l.type}</Badge> },
        { key: 'startDate', header: 'From', render: (l) => l.startDate.slice(0, 10) },
        { key: 'endDate', header: 'To', render: (l) => l.endDate.slice(0, 10) },
        { key: 'reason', header: 'Reason', render: (l) => l.reason ?? '—' },
        { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
      ]}
      actions={(l) => l.status === 'pending' ? (
        <>
          <Button size="sm" variant="success" onClick={() => decide.mutate({ id: l.id, decision: 'approved' })}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => decide.mutate({ id: l.id, decision: 'rejected' })}>Reject</Button>
        </>
      ) : null}
    />
  );
}

export default function AdminPayrollPage() {
  const [tab, setTab] = useState('payroll');
  return (
    <div>
      <PageHeader title="Payroll & Leave" subtitle="Salary processing, payslips and leave approvals" />
      <Tabs
        tabs={[{ key: 'payroll', label: 'Payroll' }, { key: 'leave', label: 'Leave requests' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'payroll' && <PayrollTab />}
      {tab === 'leave' && <LeaveTab />}
    </div>
  );
}
