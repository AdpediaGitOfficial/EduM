'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { Button, Field, Input, Modal, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface Leave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
  approvedBy: { user: { firstName: string; lastName: string } } | null;
}

export default function LeaveRequestsPage() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api('/leave', { method: 'POST', body: form }),
    onSuccess: () => {
      setOpen(false); setError('');
      setForm({ type: 'casual', startDate: '', endDate: '', reason: '' });
      setRefreshKey((k) => k + 1);
      qc.invalidateQueries();
    },
    onError: (e: Error) => setError(e.message),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/leave/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
  });

  return (
    <div>
      <PageHeader
        title="Leave Requests"
        subtitle="Apply for leave and track approvals"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Apply</Button>}
      />
      <DataTable<Leave>
        endpoint="/leave"
        refreshKey={refreshKey}
        filters={[{ key: 'status', label: 'Status', options: ['pending', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: s })) }]}
        columns={[
          { key: 'type', header: 'Type', render: (l) => <span className="font-medium capitalize">{l.type}</span> },
          { key: 'startDate', header: 'From', render: (l) => fmtDate(l.startDate) },
          { key: 'endDate', header: 'To', render: (l) => fmtDate(l.endDate) },
          { key: 'reason', header: 'Reason', render: (l) => l.reason ?? '—' },
          { key: 'status', header: 'Status', render: (l) => <StatusBadge status={l.status} /> },
          { key: 'approvedBy', header: 'Decided by', render: (l) => l.approvedBy ? `${l.approvedBy.user.firstName} ${l.approvedBy.user.lastName}` : '—' },
        ]}
        actions={(l) => l.status === 'pending' ? (
          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(l.id)}>Cancel</Button>
        ) : null}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for leave">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {['casual', 'sick', 'earned', 'maternity', 'unpaid'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From *"><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required /></Field>
            <Field label="To *"><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required /></Field>
          </div>
          <Field label="Reason"><Textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Submit</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
