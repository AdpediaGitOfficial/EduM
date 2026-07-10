'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Button, Card, EmptyState, Field, Modal, PageHeader, Select, Spinner,
  StatusBadge, Textarea,
} from '@/components/ui';
import { SectionPicker } from '@/features/pickers';

interface StudentLite { id: string; user: { firstName: string; lastName: string } }
interface Note {
  id: string; category: string; description: string; createdAt: string;
  teacher: { user: { firstName: string; lastName: string } };
}

export default function BehaviorNotesPage() {
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('positive');
  const [description, setDescription] = useState('');

  const { data: students } = useQuery({
    queryKey: ['section-students', sectionId],
    queryFn: () => api<Paged<StudentLite>>(`/students?sectionId=${sectionId}&pageSize=100`),
    enabled: !!sectionId,
  });
  const notes = useQuery({
    queryKey: ['behavior', studentId],
    queryFn: () => api<Note[]>(`/behavior-notes/${studentId}`),
    enabled: !!studentId,
  });
  const create = useMutation({
    mutationFn: () => api('/behavior-notes', { method: 'POST', body: { studentId, category, description } }),
    onSuccess: () => { setOpen(false); setDescription(''); qc.invalidateQueries({ queryKey: ['behavior', studentId] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/behavior-notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['behavior', studentId] }),
  });

  return (
    <div>
      <PageHeader
        title="Behavior Notes"
        subtitle="Positive and negative behavior tracking"
        actions={
          <div className="flex gap-2">
            <SectionPicker value={sectionId} onChange={(v) => { setSectionId(v); setStudentId(''); }} />
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="min-w-44" disabled={!sectionId}>
              <option value="">Select student…</option>
              {students?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName}</option>
              ))}
            </Select>
            {studentId && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add note</Button>}
          </div>
        }
      />
      {!studentId ? (
        <EmptyState title="Pick a student to view their behavior notes" />
      ) : notes.isLoading ? (
        <Spinner />
      ) : (notes.data ?? []).length === 0 ? (
        <EmptyState title="No behavior notes yet" />
      ) : (
        <div className="space-y-2">
          {notes.data!.map((n) => (
            <Card key={n.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-sm">{n.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {n.teacher.user.firstName} {n.teacher.user.lastName} · {fmtDate(n.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={n.category} />
                <button onClick={() => remove.mutate(n.id)} className="rounded p-1 text-slate-300 hover:text-danger-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add behavior note">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
            </Select>
          </Field>
          <Field label="Description">
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
