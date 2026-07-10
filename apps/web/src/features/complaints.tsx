'use client';

/* Complaints: raise + track (teacher/parent) and resolution workflow (admin). */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Field, Input, Modal, PageHeader, Select, Spinner,
  StatusBadge, Textarea,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface Complaint {
  id: string;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  resolution: string | null;
  createdAt: string;
  raisedBy: { firstName: string; lastName: string; role: string };
  assignedTo: { firstName: string; lastName: string } | null;
}

export function ComplaintsPage({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [manage, setManage] = useState<Complaint | null>(null);
  const [form, setForm] = useState({ category: 'other', subject: '', description: '', priority: 'medium' });
  const [resolution, setResolution] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [error, setError] = useState('');

  const refresh = () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); };

  const create = useMutation({
    mutationFn: () => api('/complaints', { method: 'POST', body: form }),
    onSuccess: () => {
      setCreateOpen(false); setError('');
      setForm({ category: 'other', subject: '', description: '', priority: 'medium' });
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: () =>
      api(`/complaints/${manage!.id}`, {
        method: 'PATCH',
        body: {
          ...(newStatus ? { status: newStatus } : {}),
          ...(resolution ? { resolution } : {}),
        },
      }),
    onSuccess: () => { setManage(null); setError(''); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  const escalate = useMutation({
    mutationFn: (id: string) => api(`/complaints/${id}/escalate`, { method: 'POST' }),
    onSuccess: () => refresh(),
    onError: (e: Error) => alert(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Complaints"
        subtitle={canManage ? 'Resolution workflow & escalations' : 'Raise and track your complaints'}
        actions={
          <Button onClick={() => { setCreateOpen(true); setError(''); }}>
            <Plus className="h-4 w-4" /> Raise complaint
          </Button>
        }
      />
      <DataTable<Complaint>
        endpoint="/complaints"
        refreshKey={refreshKey}
        searchPlaceholder="Search subject…"
        filters={[
          { key: 'status', label: 'Status', options: ['open', 'in_review', 'escalated', 'resolved', 'closed'].map((s) => ({ value: s, label: s.replace('_', ' ') })) },
          { key: 'priority', label: 'Priority', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: p })) },
          { key: 'category', label: 'Category', options: ['academic', 'transport', 'fees', 'facility', 'staff', 'other'].map((c) => ({ value: c, label: c })) },
        ]}
        columns={[
          { key: 'subject', header: 'Subject', render: (r) => (
            <div>
              <p className="font-medium">{r.subject}</p>
              <p className="text-xs text-slate-400">{r.category} · {fmtDate(r.createdAt)}</p>
            </div>
          ) },
          { key: 'raisedBy', header: 'Raised by', render: (r) => `${r.raisedBy.firstName} ${r.raisedBy.lastName}` },
          { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority} /> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        actions={(row) => (
          <>
            {canManage ? (
              <Button size="sm" variant="secondary" onClick={() => { setManage(row); setResolution(row.resolution ?? ''); setNewStatus(row.status); }}>
                Manage
              </Button>
            ) : (
              row.status !== 'resolved' && row.status !== 'closed' && row.status !== 'escalated' && (
                <Button size="sm" variant="secondary" onClick={() => escalate.mutate(row.id)} title="Escalate (after 48h unresolved)">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Escalate
                </Button>
              )
            )}
          </>
        )}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Raise a complaint">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {['academic', 'transport', 'fees', 'facility', 'staff', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Subject *"><Input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required /></Field>
          <Field label="Description *"><Textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Submit</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!manage} onClose={() => setManage(null)} title={`Manage — ${manage?.subject}`}>
        {manage && (
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">{manage.description}</p>
            <p className="text-xs text-slate-400">
              Raised by {manage.raisedBy.firstName} {manage.raisedBy.lastName} ({manage.raisedBy.role}) on {fmtDate(manage.createdAt)}
            </p>
            <Field label="Status">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {['open', 'in_review', 'escalated', 'resolved', 'closed'].map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </Select>
            </Field>
            <Field label="Resolution notes">
              <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="How was this resolved?" />
            </Field>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setManage(null)}>Cancel</Button>
              <Button onClick={() => update.mutate()} loading={update.isPending}>Update</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { Spinner, Badge };
