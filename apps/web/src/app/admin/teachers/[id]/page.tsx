'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, Field, Modal, PageHeader, Select,
  Spinner, StatusBadge, Tabs, Textarea, Input,
} from '@/components/ui';
import { SectionPicker, SubjectPicker } from '@/features/pickers';

interface StaffDetail {
  id: string;
  employeeNo: string;
  department: string | null;
  designation: string | null;
  qualifications: string | null;
  joinDate: string | null;
  baseSalary: string;
  user: { firstName: string; lastName: string; email: string; phone: string | null; role: string; status: string; lastLoginAt: string | null };
  documents: { id: string; name: string; type: string; fileKey: string }[];
  teachingAssignments: { id: string; section: { id: string; name: string; class: { name: string } }; subject: { id: string; name: string; code: string } }[];
  classTeacherOf: { id: string; name: string; class: { name: string } }[];
  performanceReviews: { id: string; reviewPeriod: string; rating: number; notes: string | null; createdAt: string }[];
  tasks: { id: string; title: string; status: string; dueDate: string | null }[];
}

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [tab, setTab] = useState('profile');
  const [allocOpen, setAllocOpen] = useState(false);
  const [sectionId, setSectionId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [perfOpen, setPerfOpen] = useState(false);
  const [perf, setPerf] = useState({ reviewPeriod: '', rating: 4, notes: '' });
  const [error, setError] = useState('');

  const { data: s, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => api<StaffDetail>(`/staff/${id}`),
  });

  const addAssignment = useMutation({
    mutationFn: () => api(`/staff/${id}/assignments`, { method: 'POST', body: { sectionId, subjectId } }),
    onSuccess: () => { setAllocOpen(false); setError(''); qc.invalidateQueries({ queryKey: ['staff', id] }); },
    onError: (e: Error) => setError(e.message),
  });
  const removeAssignment = useMutation({
    mutationFn: (aid: string) => api(`/staff/${id}/assignments/${aid}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', id] }),
  });
  const addPerf = useMutation({
    mutationFn: () => api(`/staff/${id}/performance`, { method: 'POST', body: { ...perf, rating: Number(perf.rating) } }),
    onSuccess: () => { setPerfOpen(false); setError(''); qc.invalidateQueries({ queryKey: ['staff', id] }); },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !s) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={`${s.user.firstName} ${s.user.lastName}`}
        subtitle={`${s.employeeNo} · ${s.designation ?? s.user.role.replace('_', ' ')} · ${s.department ?? 'No department'}`}
      />
      <Tabs
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'allocation', label: 'Subject allocation' },
          { key: 'performance', label: 'Performance' },
          { key: 'documents', label: 'Documents' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-1.5 p-4 text-sm">
              <p><span className="text-slate-400">Email:</span> {s.user.email}</p>
              <p><span className="text-slate-400">Phone:</span> {s.user.phone ?? '—'}</p>
              <p><span className="text-slate-400">Qualifications:</span> {s.qualifications ?? '—'}</p>
              <p><span className="text-slate-400">Joined:</span> {fmtDate(s.joinDate)}</p>
              <p><span className="text-slate-400">Base salary:</span> {fmtMoney(s.baseSalary)}/month</p>
              <p><span className="text-slate-400">Status:</span> <StatusBadge status={s.user.status} /></p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Class teacher of" />
            <div className="p-4">
              {s.classTeacherOf.length === 0 ? (
                <p className="text-sm text-slate-400">Not a class teacher</p>
              ) : (
                s.classTeacherOf.map((c) => (
                  <Badge key={c.id} tone="brand" className="mr-2">{c.class.name}-{c.name}</Badge>
                ))
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Open tasks" />
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {s.tasks.length === 0 && <p className="p-4 text-sm text-slate-400">No tasks</p>}
              {s.tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'allocation' && (
        <Card>
          <CardHeader
            title="Teaching assignments"
            actions={<Button size="sm" onClick={() => { setAllocOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Assign</Button>}
          />
          <table className="w-full text-sm">
            <tbody>
              {s.teachingAssignments.map((a) => (
                <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="px-4 py-2 font-medium">{a.subject.name}</td>
                  <td className="px-4 py-2">{a.section.class.name}-{a.section.name}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeAssignment.mutate(a.id)} className="rounded p-1 text-slate-300 hover:text-danger-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {s.teachingAssignments.length === 0 && (
                <tr><td className="p-4 text-sm text-slate-400">No subjects assigned</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'performance' && (
        <Card>
          <CardHeader
            title="Performance reviews"
            actions={<Button size="sm" onClick={() => { setPerfOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Add review</Button>}
          />
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {s.performanceReviews.length === 0 && <p className="p-4 text-sm text-slate-400">No reviews yet</p>}
            {s.performanceReviews.map((r) => (
              <div key={r.id} className="flex items-start justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{r.reviewPeriod}</p>
                  {r.notes && <p className="text-sm text-slate-500">{r.notes}</p>}
                  <p className="text-xs text-slate-400">{fmtDate(r.createdAt)}</p>
                </div>
                <Badge tone={r.rating >= 4 ? 'ok' : r.rating >= 3 ? 'warn' : 'danger'}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader title="Documents" subtitle="Contracts, certificates, ID proofs" />
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {s.documents.length === 0 && <p className="p-4 text-sm text-slate-400">No documents uploaded</p>}
            {s.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">{d.name}</span>
                <Badge>{d.type}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={allocOpen} onClose={() => setAllocOpen(false)} title="Assign subject & section">
        <div className="space-y-3">
          <Field label="Section"><SectionPicker value={sectionId} onChange={setSectionId} /></Field>
          <Field label="Subject"><SubjectPicker value={subjectId} onChange={setSubjectId} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button onClick={() => addAssignment.mutate()} disabled={!sectionId || !subjectId} loading={addAssignment.isPending}>Assign</Button>
          </div>
        </div>
      </Modal>

      <Modal open={perfOpen} onClose={() => setPerfOpen(false)} title="Add performance review">
        <div className="space-y-3">
          <Field label="Review period (e.g. 2026-T1)">
            <Input value={perf.reviewPeriod} onChange={(e) => setPerf((p) => ({ ...p, reviewPeriod: e.target.value }))} />
          </Field>
          <Field label="Rating (1–5)">
            <Select value={String(perf.rating)} onChange={(e) => setPerf((p) => ({ ...p, rating: Number(e.target.value) }))}>
              {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={perf.notes} onChange={(e) => setPerf((p) => ({ ...p, notes: e.target.value }))} />
          </Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPerfOpen(false)}>Cancel</Button>
            <Button onClick={() => addPerf.mutate()} disabled={!perf.reviewPeriod} loading={addPerf.isPending}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
