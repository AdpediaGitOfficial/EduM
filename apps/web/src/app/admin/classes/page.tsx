'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader,
  Select, Spinner, Tabs,
} from '@/components/ui';
import { useClasses, useSubjects, useSections, SectionPicker } from '@/features/pickers';
import { TimetableBuilder } from '@/features/timetable';
import { useQuery } from '@tanstack/react-query';
import { Paged } from '@/lib/api';

function ClassesTab() {
  const qc = useQueryClient();
  const { data: classes, isLoading } = useClasses();
  const { data: staff } = useQuery({
    queryKey: ['staff-picker'],
    queryFn: () => api<Paged<{ id: string; user: { firstName: string; lastName: string } }>>('/staff?pageSize=100&role=teacher'),
  });
  const [classOpen, setClassOpen] = useState(false);
  const [classForm, setClassForm] = useState({ name: '', level: 6 });
  const [sectionOpen, setSectionOpen] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState({ name: '', room: '', classTeacherId: '', capacity: 30 });
  const [error, setError] = useState('');

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['classes'] }); qc.invalidateQueries({ queryKey: ['sections'] }); };

  const createClass = useMutation({
    mutationFn: () => api('/classes', { method: 'POST', body: { ...classForm, level: Number(classForm.level) } }),
    onSuccess: () => { setClassOpen(false); setError(''); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const deleteClass = useMutation({
    mutationFn: (id: string) => api(`/classes/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });
  const createSection = useMutation({
    mutationFn: () => api(`/classes/${sectionOpen}/sections`, {
      method: 'POST',
      body: { ...sectionForm, classTeacherId: sectionForm.classTeacherId || undefined, capacity: Number(sectionForm.capacity) },
    }),
    onSuccess: () => { setSectionOpen(null); setError(''); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const deleteSection = useMutation({
    mutationFn: (id: string) => api(`/sections/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
    onError: (e: Error) => alert(e.message),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setClassOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Add grade</Button>
      </div>
      {(classes ?? []).map((c) => (
        <Card key={c.id}>
          <CardHeader
            title={c.name}
            subtitle={`Level ${c.level}`}
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setSectionOpen(c.id); setError(''); }}>
                  <Plus className="h-3.5 w-3.5" /> Section
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteClass.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                </Button>
              </div>
            }
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.sections.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{c.name}-{s.name}</p>
                  <button onClick={() => deleteSection.mutate(s.id)} className="rounded p-0.5 text-slate-300 hover:text-danger-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-400">Room {s.room ?? '—'} · {s._count?.students ?? 0}/{s.capacity} students</p>
                <p className="mt-1 text-xs">
                  <span className="text-slate-400">Class teacher:</span>{' '}
                  {s.classTeacher ? `${s.classTeacher.user.firstName} ${s.classTeacher.user.lastName}` : <Badge tone="warn">unassigned</Badge>}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Modal open={classOpen} onClose={() => setClassOpen(false)} title="Add grade">
        <div className="space-y-3">
          <Field label="Name (e.g. Grade 9)"><Input value={classForm.name} onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Level (numeric)"><Input type="number" value={classForm.level} onChange={(e) => setClassForm((f) => ({ ...f, level: Number(e.target.value) }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setClassOpen(false)}>Cancel</Button>
            <Button onClick={() => createClass.mutate()} loading={createClass.isPending}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!sectionOpen} onClose={() => setSectionOpen(null)} title="Add section">
        <div className="space-y-3">
          <Field label="Name (e.g. A)"><Input value={sectionForm.name} onChange={(e) => setSectionForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Room"><Input value={sectionForm.room} onChange={(e) => setSectionForm((f) => ({ ...f, room: e.target.value }))} /></Field>
          <Field label="Class teacher">
            <Select value={sectionForm.classTeacherId} onChange={(e) => setSectionForm((f) => ({ ...f, classTeacherId: e.target.value }))}>
              <option value="">Assign later…</option>
              {staff?.items.map((t) => <option key={t.id} value={t.id}>{t.user.firstName} {t.user.lastName}</option>)}
            </Select>
          </Field>
          <Field label="Capacity"><Input type="number" value={sectionForm.capacity} onChange={(e) => setSectionForm((f) => ({ ...f, capacity: Number(e.target.value) }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSectionOpen(null)}>Cancel</Button>
            <Button onClick={() => createSection.mutate()} loading={createSection.isPending}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SubjectsTab() {
  const qc = useQueryClient();
  const { data: subjects, isLoading } = useSubjects();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', isElective: false });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api('/subjects', { method: 'POST', body: form }),
    onSuccess: () => { setOpen(false); setError(''); qc.invalidateQueries({ queryKey: ['subjects'] }); },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/subjects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subjects'] }),
    onError: (e: Error) => alert(e.message),
  });

  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Subjects" actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add subject</Button>} />
      <table className="w-full text-sm">
        <tbody>
          {(subjects ?? []).map((s) => (
            <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50">
              <td className="px-4 py-2 font-medium">{s.name}</td>
              <td className="px-4 py-2 font-mono text-xs">{s.code}</td>
              <td className="px-4 py-2">{s.isElective && <Badge tone="warn">elective</Badge>}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => remove.mutate(s.id)} className="rounded p-1 text-slate-300 hover:text-danger-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add subject">
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="MAT" /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.isElective} onChange={(e) => setForm((f) => ({ ...f, isElective: e.target.checked }))} />
            Elective subject
          </label>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending}>Create</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function TimetableTab() {
  const [sectionId, setSectionId] = useState('');
  return (
    <div className="space-y-3">
      <SectionPicker value={sectionId} onChange={setSectionId} />
      <TimetableBuilder sectionId={sectionId} />
    </div>
  );
}

export default function AdminClassesPage() {
  const [tab, setTab] = useState('classes');
  return (
    <div>
      <PageHeader title="Classes & Academics" subtitle="Grades, sections, subjects and the timetable builder" />
      <Tabs
        tabs={[
          { key: 'classes', label: 'Grades & sections' },
          { key: 'subjects', label: 'Subjects' },
          { key: 'timetable', label: 'Timetable builder' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'classes' && <ClassesTab />}
      {tab === 'subjects' && <SubjectsTab />}
      {tab === 'timetable' && <TimetableTab />}
    </div>
  );
}
