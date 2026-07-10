'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/data-table';
import { Badge, Button, Field, Input, Modal, PageHeader, Select, StatusBadge } from '@/components/ui';
import { useSections, sectionLabel } from '@/features/pickers';

interface StudentRow {
  id: string;
  admissionNo: string;
  rollNo: number | null;
  status: string;
  user: { firstName: string; lastName: string; email: string };
  section: { id: string; name: string; class: { name: string } } | null;
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: sections } = useSections();
  const [refreshKey, setRefreshKey] = useState(0);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [result, setResult] = useState<{ tempPassword?: string; guardianTempPassword?: string } | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', sectionId: '', dob: '', gender: '',
    bloodGroup: '', address: '', guardianEmail: '', guardianFirstName: '', guardianLastName: '', guardianRelation: 'father',
  });

  const admit = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      return api<{ tempPassword?: string; guardianTempPassword?: string }>('/students', { method: 'POST', body });
    },
    onSuccess: (d) => {
      setAdmitOpen(false); setError('');
      setResult(d);
      setRefreshKey((k) => k + 1);
      qc.invalidateQueries();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Admissions, profiles, promotion and alumni"
        actions={<Button onClick={() => { setAdmitOpen(true); setError(''); }}><Plus className="h-4 w-4" /> New admission</Button>}
      />
      <DataTable<StudentRow>
        endpoint="/students"
        refreshKey={refreshKey}
        searchPlaceholder="Search name or admission no…"
        filters={[
          ...(sections ? [{
            key: 'sectionId', label: 'Section',
            options: sections.map((s) => ({ value: s.id, label: sectionLabel(s) })),
          }] : []),
          { key: 'status', label: 'Status', options: ['active', 'promoted', 'transferred', 'alumni', 'withdrawn'].map((s) => ({ value: s, label: s })) },
        ]}
        columns={[
          { key: 'admissionNo', header: 'Admission #', render: (r) => <span className="font-mono text-xs">{r.admissionNo}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.user.firstName} {r.user.lastName}</span> },
          { key: 'section', header: 'Class', render: (r) => r.section ? <Badge tone="brand">{r.section.class.name}-{r.section.name}</Badge> : '—' },
          { key: 'rollNo', header: 'Roll', render: (r) => r.rollNo ?? '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        onRowClick={(r) => router.push(`/admin/students/${r.id}`)}
      />

      <Modal open={admitOpen} onClose={() => setAdmitOpen(false)} title="New student admission" wide>
        <form onSubmit={(e) => { e.preventDefault(); admit.mutate(); }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name *"><Input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required /></Field>
          <Field label="Last name *"><Input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required /></Field>
          <Field label="Student email *"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
          <Field label="Section">
            <Select value={form.sectionId} onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}>
              <option value="">Assign later…</option>
              {sections?.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
            </Select>
          </Field>
          <Field label="Date of birth"><Input type="date" value={form.dob} onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} /></Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Blood group"><Input value={form.bloodGroup} onChange={(e) => setForm((f) => ({ ...f, bloodGroup: e.target.value }))} placeholder="O+" /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
          <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Guardian (optional — creates/links a parent account)</p>
          </div>
          <Field label="Guardian email"><Input type="email" value={form.guardianEmail} onChange={(e) => setForm((f) => ({ ...f, guardianEmail: e.target.value }))} /></Field>
          <Field label="Relation">
            <Select value={form.guardianRelation} onChange={(e) => setForm((f) => ({ ...f, guardianRelation: e.target.value }))}>
              {['father', 'mother', 'guardian'].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Guardian first name"><Input value={form.guardianFirstName} onChange={(e) => setForm((f) => ({ ...f, guardianFirstName: e.target.value }))} /></Field>
          <Field label="Guardian last name"><Input value={form.guardianLastName} onChange={(e) => setForm((f) => ({ ...f, guardianLastName: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setAdmitOpen(false)}>Cancel</Button>
            <Button type="submit" loading={admit.isPending}>Admit student</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!result} onClose={() => setResult(null)} title="Admission complete">
        <div className="space-y-3 text-sm">
          {result?.tempPassword && (
            <div>
              <p className="mb-1">Student temporary password:</p>
              <p className="rounded-lg bg-slate-100 p-2 text-center font-mono dark:bg-slate-800">{result.tempPassword}</p>
            </div>
          )}
          {result?.guardianTempPassword && (
            <div>
              <p className="mb-1">Guardian temporary password:</p>
              <p className="rounded-lg bg-slate-100 p-2 text-center font-mono dark:bg-slate-800">{result.guardianTempPassword}</p>
            </div>
          )}
          <div className="flex justify-end"><Button onClick={() => setResult(null)}>Done</Button></div>
        </div>
      </Modal>
    </div>
  );
}
