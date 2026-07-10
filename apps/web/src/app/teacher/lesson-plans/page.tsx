'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select,
  Spinner, StatusBadge, Textarea,
} from '@/components/ui';

interface Task {
  id: string;
  title: string;
  detail: string | null;
  dueDate: string | null;
  status: string;
}

export default function LessonPlansPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', detail: '', dueDate: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => api<Task[]>('/staff-monitoring/my-tasks'),
  });
  const create = useMutation({
    mutationFn: () => api('/staff-monitoring/my-tasks', { method: 'POST', body: { ...form, dueDate: form.dueDate || undefined } }),
    onSuccess: () => { setOpen(false); setForm({ title: '', detail: '', dueDate: '' }); qc.invalidateQueries({ queryKey: ['my-tasks'] }); },
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/staff-monitoring/my-tasks/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-tasks'] }),
  });

  return (
    <div>
      <PageHeader
        title="Lesson Plans & Tasks"
        subtitle="Your personal planning checklist"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New plan</Button>}
      />
      {isLoading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No lesson plans yet" hint="Plan your week: chapters, labs, assessments…" />
      ) : (
        <div className="space-y-2">
          {data!.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{t.title}</p>
                {t.detail && <p className="text-sm text-slate-500">{t.detail}</p>}
                {t.dueDate && <p className="text-xs text-slate-400">Planned for {fmtDate(t.dueDate)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                <Select
                  className="w-auto"
                  value={t.status}
                  onChange={(e) => update.mutate({ id: t.id, status: e.target.value })}
                >
                  {['todo', 'in_progress', 'done', 'cancelled'].map((s) => (
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>
                  ))}
                </Select>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New lesson plan">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <Field label="Title *"><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="e.g. Ch 4: Fractions — intro + worksheet" /></Field>
          <Field label="Details"><Textarea rows={3} value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} /></Field>
          <Field label="Planned date"><Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
