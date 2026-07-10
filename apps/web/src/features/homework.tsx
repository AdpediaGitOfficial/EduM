'use client';

/* Homework/assignments: teacher management + grading, student buckets + submit. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ClipboardList, Eye, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, StatusBadge, Textarea,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { SectionPicker, SubjectPicker, useSections, useSubjects } from './pickers';

export interface HomeworkRow {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  assignedAt: string;
  maxScore: number;
  description?: string | null;
  subject: { id: string; name: string; code: string };
  section: { id: string; name: string; class: { id: string; name: string } };
  _count?: { submissions: number };
}

interface Submission {
  id: string;
  status: string;
  submittedAt: string | null;
  content: string | null;
  score: number | null;
  feedback: string | null;
  student: { id: string; rollNo: number | null; admissionNo: string; user: { firstName: string; lastName: string } };
}

function SubmissionsModal({ hw, onClose }: { hw: HomeworkRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['submissions', hw.id],
    queryFn: () => api<Submission[]>(`/homework/${hw.id}/submissions`),
  });
  const [grading, setGrading] = useState<Submission | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const grade = useMutation({
    mutationFn: () =>
      api(`/homework/submissions/${grading!.id}/grade`, {
        method: 'PATCH',
        body: { score: Number(score), feedback: feedback || undefined },
      }),
    onSuccess: () => { setGrading(null); qc.invalidateQueries({ queryKey: ['submissions', hw.id] }); },
  });

  return (
    <Modal open onClose={onClose} title={`Submissions — ${hw.title}`} wide>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-1.5">Student</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Submitted</th>
                <th className="px-2 py-1.5">Score</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-50 dark:border-slate-800/50">
                  <td className="px-2 py-1.5 font-medium">
                    {s.student.user.firstName} {s.student.user.lastName}
                  </td>
                  <td className="px-2 py-1.5"><StatusBadge status={s.status} /></td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{s.submittedAt ? fmtDate(s.submittedAt) : '—'}</td>
                  <td className="px-2 py-1.5">{s.score ?? '—'} / {hw.maxScore}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Button size="sm" variant="secondary" onClick={() => { setGrading(s); setScore(String(s.score ?? '')); setFeedback(s.feedback ?? ''); }}>
                      Grade
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {grading && (
        <Modal open onClose={() => setGrading(null)} title={`Grade — ${grading.student.user.firstName}`}>
          {grading.content && (
            <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">{grading.content}</p>
          )}
          <div className="space-y-3">
            <Field label={`Score (0–${hw.maxScore})`}>
              <Input type="number" min={0} max={hw.maxScore} value={score} onChange={(e) => setScore(e.target.value)} />
            </Field>
            <Field label="Feedback">
              <Textarea rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setGrading(null)}>Cancel</Button>
              <Button onClick={() => grade.mutate()} loading={grade.isPending} disabled={score === ''}>Save grade</Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/** Teacher/admin homework management list. typeFilter narrows to assignment/project pages. */
export function HomeworkManager({ typeFilter, title, canCreate = true }: { typeFilter?: string; title: string; canCreate?: boolean }) {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<HomeworkRow | null>(null);
  const [form, setForm] = useState({ sectionId: '', subjectId: '', type: typeFilter ?? 'homework', title: '', description: '', dueDate: '', maxScore: 10 });
  const [error, setError] = useState('');
  const { data: subjects } = useSubjects();

  const create = useMutation({
    mutationFn: () => api('/homework', { method: 'POST', body: { ...form, maxScore: Number(form.maxScore) } }),
    onSuccess: () => {
      setCreateOpen(false);
      setError('');
      setForm((f) => ({ ...f, title: '', description: '', dueDate: '' }));
      setRefreshKey((k) => k + 1);
      qc.invalidateQueries();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <PageHeader
        title={title}
        actions={canCreate && (
          <Button onClick={() => { setCreateOpen(true); setError(''); }}>
            <Plus className="h-4 w-4" /> New
          </Button>
        )}
      />
      <DataTable<HomeworkRow>
        endpoint="/homework"
        refreshKey={refreshKey}
        extraParams={typeFilter ? { type: typeFilter } : {}}
        searchPlaceholder="Search by title…"
        filters={[
          ...(typeFilter ? [] : [{
            key: 'type', label: 'Type',
            options: [
              { value: 'homework', label: 'Homework' },
              { value: 'assignment', label: 'Assignment' },
              { value: 'project', label: 'Project' },
            ],
          }]),
          ...(subjects ? [{
            key: 'subjectId', label: 'Subject',
            options: subjects.map((s) => ({ value: s.id, label: s.name })),
          }] : []),
        ]}
        columns={[
          { key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> },
          { key: 'subject', header: 'Subject', render: (r) => r.subject.name },
          { key: 'section', header: 'Section', render: (r) => `${r.section.class.name}-${r.section.name}` },
          { key: 'type', header: 'Type', render: (r) => <Badge tone="brand">{r.type}</Badge> },
          { key: 'dueDate', header: 'Due', render: (r) => fmtDate(r.dueDate) },
        ]}
        actions={(row) => (
          <Button size="sm" variant="secondary" onClick={() => setViewing(row)}>
            <Eye className="h-3.5 w-3.5" /> Submissions
          </Button>
        )}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New homework/assignment" wide>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Section *"><SectionPicker value={form.sectionId} onChange={(v) => setForm((f) => ({ ...f, sectionId: v }))} /></Field>
          <Field label="Subject *"><SubjectPicker value={form.subjectId} onChange={(v) => setForm((f) => ({ ...f, subjectId: v }))} /></Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} disabled={!!typeFilter}>
              <option value="homework">Homework</option>
              <option value="assignment">Assignment</option>
              <option value="project">Project</option>
            </Select>
          </Field>
          <Field label="Due date *"><Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} required /></Field>
          <Field label="Title *"><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></Field>
          <Field label="Max score"><Input type="number" min={1} value={form.maxScore} onChange={(e) => setForm((f) => ({ ...f, maxScore: Number(e.target.value) }))} /></Field>
          <div className="sm:col-span-2">
            <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          </div>
          {error && <p className="text-sm text-danger-600 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending} disabled={!form.sectionId || !form.subjectId}>Create</Button>
          </div>
        </form>
      </Modal>

      {viewing && <SubmissionsModal hw={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

interface StudentHwBuckets {
  today: StudentHwItem[];
  upcoming: StudentHwItem[];
  overdue: StudentHwItem[];
  recent: StudentHwItem[];
}
interface StudentHwItem {
  id: string;
  status: string;
  score: number | null;
  feedback: string | null;
  homework: { id: string; title: string; type: string; description: string | null; dueDate: string; maxScore: number; subject: { name: string; code: string } };
}

/** Student (or parent read-only) homework view with today/upcoming/overdue buckets. */
export function StudentHomeworkView({ studentId, canSubmit }: { studentId: string; canSubmit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['student-homework', studentId],
    queryFn: () => api<StudentHwBuckets>(`/homework/student/${studentId}`),
    enabled: !!studentId,
  });
  const [submitting, setSubmitting] = useState<StudentHwItem | null>(null);
  const [content, setContent] = useState('');
  const submit = useMutation({
    mutationFn: () => api(`/homework/${submitting!.homework.id}/submit`, { method: 'POST', body: { content } }),
    onSuccess: () => { setSubmitting(null); setContent(''); qc.invalidateQueries({ queryKey: ['student-homework', studentId] }); },
  });

  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState />;

  const Bucket = ({ label, items, tone }: { label: string; items: StudentHwItem[]; tone?: 'ok' | 'warn' | 'danger' }) => (
    <Card>
      <CardHeader title={label} actions={<Badge tone={tone}>{items.length}</Badge>} />
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-400">Nothing here</p>
      ) : (
        <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
          {items.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{s.homework.title}</p>
                <p className="text-xs text-slate-400">
                  {s.homework.subject.name} · due {fmtDate(s.homework.dueDate)}
                  {s.score != null && <> · scored {s.score}/{s.homework.maxScore}</>}
                </p>
                {s.feedback && <p className="text-xs italic text-slate-500">“{s.feedback}”</p>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={s.status} />
                {canSubmit && (s.status === 'pending' || s.status === 'missed') && (
                  <Button size="sm" onClick={() => setSubmitting(s)}>Submit</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Bucket label="Due today" items={data.today} tone="warn" />
        <Bucket label="Upcoming" items={data.upcoming} tone="ok" />
        <Bucket label="Overdue" items={data.overdue} tone="danger" />
      </div>
      <Card>
        <CardHeader title="Recent submissions" />
        {data.recent.length === 0 ? (
          <EmptyState title="No submissions yet" />
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {data.recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{s.homework.title}</p>
                  <p className="text-xs text-slate-400">{s.homework.subject.name}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {s.score != null && <span className="font-semibold">{s.score}/{s.homework.maxScore}</span>}
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!submitting} onClose={() => setSubmitting(null)} title={`Submit — ${submitting?.homework.title}`}>
        <div className="space-y-3">
          {submitting?.homework.description && (
            <p className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">{submitting.homework.description}</p>
          )}
          <Field label="Your answer / notes">
            <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type your submission…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSubmitting(null)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} loading={submit.isPending}>Submit work</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { ClipboardList };
