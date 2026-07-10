'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Link2, Award } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, Modal,
  PageHeader, Select, Spinner, StatusBadge, Tabs, Textarea,
} from '@/components/ui';
import { useSections, sectionLabel } from '@/features/pickers';
import { StudentOverview } from '@/features/student-overview';
import { StudentAttendance } from '@/features/attendance';
import { StudentGradebook } from '@/features/gradebook';

interface StudentDetail {
  id: string;
  admissionNo: string;
  rollNo: number | null;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  address: string | null;
  admissionDate: string;
  status: string;
  hostel: boolean;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  section: { id: string; name: string; class: { name: string } } | null;
  guardians: { id: string; relation: string; isPrimary: boolean; user: { id: string; firstName: string; lastName: string; email: string; phone: string | null } }[];
  medical: { allergies: string | null; conditions: string | null; medications: string | null; emergencyName: string | null; emergencyPhone: string | null; notes: string | null } | null;
  certificates: { id: string; type: string; serialNo: string; issuedAt: string }[];
  routeStop: { name: string; route: { name: string } } | null;
}

export default function AdminStudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: sections } = useSections();
  const [tab, setTab] = useState('profile');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [alumniConfirm, setAlumniConfirm] = useState(false);
  const [toSectionId, setToSectionId] = useState('');
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [gForm, setGForm] = useState({ email: '', firstName: '', lastName: '', relation: 'guardian' });
  const [certOpen, setCertOpen] = useState(false);
  const [certType, setCertType] = useState('bonafide');
  const [medicalEdit, setMedicalEdit] = useState(false);
  const [medForm, setMedForm] = useState({ allergies: '', conditions: '', medications: '', emergencyName: '', emergencyPhone: '', notes: '' });
  const [error, setError] = useState('');

  const { data: s, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () => api<StudentDetail>(`/students/${id}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['student', id] });

  const promote = useMutation({
    mutationFn: () => api(`/students/${id}/promote`, { method: 'POST', body: { toSectionId } }),
    onSuccess: () => { setPromoteOpen(false); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const markAlumni = useMutation({
    mutationFn: () => api(`/students/${id}/alumni`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const linkGuardian = useMutation({
    mutationFn: () => api(`/students/${id}/guardians`, { method: 'POST', body: gForm }),
    onSuccess: () => { setGuardianOpen(false); setError(''); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const unlinkGuardian = useMutation({
    mutationFn: (gid: string) => api(`/students/${id}/guardians/${gid}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const issueCert = useMutation({
    mutationFn: () => api(`/students/${id}/certificates`, { method: 'POST', body: { type: certType } }),
    onSuccess: () => { setCertOpen(false); invalidate(); },
  });
  const saveMedical = useMutation({
    mutationFn: () => api(`/students/${id}/medical`, { method: 'PATCH', body: medForm }),
    onSuccess: () => { setMedicalEdit(false); invalidate(); },
  });

  if (isLoading || !s) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={`${s.user.firstName} ${s.user.lastName}`}
        subtitle={`${s.admissionNo} · ${s.section ? `${s.section.class.name}-${s.section.name}` : 'Unassigned'} · roll ${s.rollNo ?? '—'}`}
        actions={
          <>
            <StatusBadge status={s.status} />
            <Button variant="secondary" size="sm" onClick={() => setPromoteOpen(true)}>
              <GraduationCap className="h-4 w-4" /> Promote / move
            </Button>
            {s.status !== 'alumni' && (
              <Button variant="secondary" size="sm" onClick={() => setAlumniConfirm(true)}>Mark alumni</Button>
            )}
          </>
        }
      />
      <Tabs
        tabs={[
          { key: 'profile', label: 'Profile' },
          { key: 'overview', label: 'Progress' },
          { key: 'attendance', label: 'Attendance' },
          { key: 'gradebook', label: 'Gradebook' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Personal" />
            <div className="space-y-1.5 p-4 text-sm">
              <p><span className="text-slate-400">Email:</span> {s.user.email}</p>
              <p><span className="text-slate-400">DOB:</span> {fmtDate(s.dob)} · <span className="text-slate-400">Gender:</span> {s.gender ?? '—'} · <span className="text-slate-400">Blood:</span> {s.bloodGroup ?? '—'}</p>
              <p><span className="text-slate-400">Address:</span> {s.address ?? '—'}</p>
              <p><span className="text-slate-400">Admitted:</span> {fmtDate(s.admissionDate)}</p>
              <p><span className="text-slate-400">Transport:</span> {s.routeStop ? `${s.routeStop.route.name} · ${s.routeStop.name}` : 'None'} {s.hostel && <Badge tone="brand">Hostel</Badge>}</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Guardians"
              actions={<Button size="sm" variant="secondary" onClick={() => { setGuardianOpen(true); setError(''); }}><Link2 className="h-3.5 w-3.5" /> Link</Button>}
            />
            <div className="divide-y divide-slate-50 p-2 dark:divide-slate-800/50">
              {s.guardians.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-2 py-2 text-sm">
                  <div>
                    <p className="font-medium">{g.user.firstName} {g.user.lastName}</p>
                    <p className="text-xs text-slate-400">{g.user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={g.isPrimary ? 'brand' : 'neutral'}>{g.relation}{g.isPrimary ? ' · primary' : ''}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => unlinkGuardian.mutate(g.id)}>Unlink</Button>
                  </div>
                </div>
              ))}
              {s.guardians.length === 0 && <p className="p-2 text-sm text-slate-400">No guardians linked</p>}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Medical"
              actions={
                <Button size="sm" variant="secondary" onClick={() => {
                  setMedForm({
                    allergies: s.medical?.allergies ?? '', conditions: s.medical?.conditions ?? '',
                    medications: s.medical?.medications ?? '', emergencyName: s.medical?.emergencyName ?? '',
                    emergencyPhone: s.medical?.emergencyPhone ?? '', notes: s.medical?.notes ?? '',
                  });
                  setMedicalEdit(true);
                }}>Edit</Button>
              }
            />
            <div className="space-y-1.5 p-4 text-sm">
              <p><span className="text-slate-400">Allergies:</span> {s.medical?.allergies ?? 'None recorded'}</p>
              <p><span className="text-slate-400">Conditions:</span> {s.medical?.conditions ?? 'None recorded'}</p>
              <p><span className="text-slate-400">Medications:</span> {s.medical?.medications ?? '—'}</p>
              <p><span className="text-slate-400">Emergency:</span> {s.medical?.emergencyName ?? '—'} {s.medical?.emergencyPhone ? `(${s.medical.emergencyPhone})` : ''}</p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Certificates"
              actions={<Button size="sm" variant="secondary" onClick={() => setCertOpen(true)}><Award className="h-3.5 w-3.5" /> Issue</Button>}
            />
            <div className="divide-y divide-slate-50 p-2 dark:divide-slate-800/50">
              {s.certificates.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-2 py-2 text-sm">
                  <span className="font-medium capitalize">{c.type}</span>
                  <span className="text-xs text-slate-400">{c.serialNo} · {fmtDate(c.issuedAt)}</span>
                </div>
              ))}
              {s.certificates.length === 0 && <p className="p-2 text-sm text-slate-400">No certificates issued</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'overview' && <StudentOverview studentId={id} />}
      {tab === 'attendance' && <StudentAttendance studentId={id} />}
      {tab === 'gradebook' && <StudentGradebook studentId={id} />}

      <Modal open={promoteOpen} onClose={() => setPromoteOpen(false)} title="Promote / move student">
        <div className="space-y-3">
          <Field label="Target section">
            <Select value={toSectionId} onChange={(e) => setToSectionId(e.target.value)}>
              <option value="">Select…</option>
              {sections?.map((sec) => <option key={sec.id} value={sec.id}>{sectionLabel(sec)}</option>)}
            </Select>
          </Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPromoteOpen(false)}>Cancel</Button>
            <Button onClick={() => promote.mutate()} disabled={!toSectionId} loading={promote.isPending}>Move</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={alumniConfirm}
        onClose={() => setAlumniConfirm(false)}
        onConfirm={() => markAlumni.mutate()}
        title="Mark as alumni?"
        message="The student will be unassigned from their section and marked alumni."
        confirmLabel="Mark alumni"
      />

      <Modal open={guardianOpen} onClose={() => setGuardianOpen(false)} title="Link guardian">
        <div className="space-y-3">
          <Field label="Guardian email *"><Input type="email" value={gForm.email} onChange={(e) => setGForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input value={gForm.firstName} onChange={(e) => setGForm((f) => ({ ...f, firstName: e.target.value }))} /></Field>
            <Field label="Last name"><Input value={gForm.lastName} onChange={(e) => setGForm((f) => ({ ...f, lastName: e.target.value }))} /></Field>
          </div>
          <Field label="Relation">
            <Select value={gForm.relation} onChange={(e) => setGForm((f) => ({ ...f, relation: e.target.value }))}>
              {['father', 'mother', 'guardian'].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-slate-400">If no account exists for this email, a parent account is created and a temp password returned.</p>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGuardianOpen(false)}>Cancel</Button>
            <Button onClick={() => linkGuardian.mutate()} disabled={!gForm.email} loading={linkGuardian.isPending}>Link</Button>
          </div>
        </div>
      </Modal>

      <Modal open={certOpen} onClose={() => setCertOpen(false)} title="Issue certificate">
        <div className="space-y-3">
          <Field label="Type">
            <Select value={certType} onChange={(e) => setCertType(e.target.value)}>
              {['bonafide', 'transfer', 'character', 'achievement'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCertOpen(false)}>Cancel</Button>
            <Button onClick={() => issueCert.mutate()} loading={issueCert.isPending}>Issue</Button>
          </div>
        </div>
      </Modal>

      <Modal open={medicalEdit} onClose={() => setMedicalEdit(false)} title="Edit medical record" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Allergies"><Input value={medForm.allergies} onChange={(e) => setMedForm((f) => ({ ...f, allergies: e.target.value }))} /></Field>
          <Field label="Conditions"><Input value={medForm.conditions} onChange={(e) => setMedForm((f) => ({ ...f, conditions: e.target.value }))} /></Field>
          <Field label="Medications"><Input value={medForm.medications} onChange={(e) => setMedForm((f) => ({ ...f, medications: e.target.value }))} /></Field>
          <Field label="Emergency contact name"><Input value={medForm.emergencyName} onChange={(e) => setMedForm((f) => ({ ...f, emergencyName: e.target.value }))} /></Field>
          <Field label="Emergency phone"><Input value={medForm.emergencyPhone} onChange={(e) => setMedForm((f) => ({ ...f, emergencyPhone: e.target.value }))} /></Field>
          <div className="sm:col-span-2">
            <Field label="Notes"><Textarea rows={2} value={medForm.notes} onChange={(e) => setMedForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setMedicalEdit(false)}>Cancel</Button>
            <Button onClick={() => saveMedical.mutate()} loading={saveMedical.isPending}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
