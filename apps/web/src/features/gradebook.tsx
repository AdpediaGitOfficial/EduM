'use client';

/* Gradebook: exams manager, marks entry, ranking, student report card. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal,
  Select, Spinner, StatCard,
} from '@/components/ui';
import { Bars, MultiLine } from '@/components/charts';
import { ExamPicker, SectionPicker, SubjectPicker, useExams } from './pickers';

// ── Exams manager (admin/progress hub) ──
export function ExamsManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: exams, isLoading } = useExams();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'internal', startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => api('/exams', { method: 'POST', body: form }),
    onSuccess: () => { setOpen(false); setError(''); qc.invalidateQueries({ queryKey: ['exams'] }); },
    onError: (e: Error) => setError(e.message),
  });
  const publish = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      api(`/exams/${id}`, { method: 'PATCH', body: { published } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  });

  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader
        title="Exams"
        actions={canManage && (
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New exam</Button>
        )}
      />
      {(exams ?? []).length === 0 ? (
        <EmptyState title="No exams yet" />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {exams!.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 dark:border-slate-800/50">
                <td className="px-4 py-2.5 font-medium">{e.name}</td>
                <td className="px-4 py-2.5"><Badge tone="brand">{e.type}</Badge></td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(e.startDate)}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={e.published ? 'ok' : 'warn'}>{e.published ? 'published' : 'draft'}</Badge>
                </td>
                {canManage && (
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="secondary" onClick={() => publish.mutate({ id: e.id, published: !e.published })}>
                      {e.published ? 'Unpublish' : 'Publish'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New exam">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {['internal', 'external', 'quiz', 'midterm', 'final'].map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required /></Field>
            <Field label="End"><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required /></Field>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ── Section ranking + marks entry ──
interface RankedStudent {
  id: string; rollNo: number | null; admissionNo: string;
  user: { firstName: string; lastName: string };
  total: number; max: number; pct: number; gpa: number; rank: number;
}

export function SectionResults({ canEnterMarks }: { canEnterMarks: boolean }) {
  const qc = useQueryClient();
  const [examId, setExamId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['section-results', examId, sectionId],
    queryFn: () => api<{ students: RankedStudent[]; results: { studentId: string; subjectId: string; score: string; grade: string | null }[]; subjects: { id: string; name: string }[] }>(
      `/exams/${examId}/results?sectionId=${sectionId}`,
    ),
    enabled: !!examId && !!sectionId,
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/exams/${examId}/results`, {
        method: 'POST',
        body: {
          subjectId, sectionId,
          entries: Object.entries(scores)
            .filter(([, v]) => v !== '')
            .map(([studentId, v]) => ({ studentId, score: Number(v) })),
        },
      }),
    onSuccess: () => {
      setEntryOpen(false); setError(''); setScores({});
      qc.invalidateQueries({ queryKey: ['section-results', examId, sectionId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const existingFor = useMemo(() => {
    const map = new Map<string, number>();
    if (subjectId && data) {
      for (const r of data.results) {
        if (r.subjectId === subjectId) map.set(r.studentId, Number(r.score));
      }
    }
    return map;
  }, [data, subjectId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ExamPicker value={examId} onChange={setExamId} />
        <SectionPicker value={sectionId} onChange={setSectionId} />
        <div className="flex-1" />
        {canEnterMarks && examId && sectionId && (
          <Button onClick={() => { setEntryOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Enter marks</Button>
        )}
      </div>
      {!examId || !sectionId ? (
        <EmptyState title="Pick an exam and section" />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <CardHeader title="Ranking" subtitle="Total across all subjects" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-2">Rank</th>
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">%</th>
                    <th className="px-4 py-2 text-right">GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.students.map((s) => (
                    <tr key={s.id} className="border-t border-slate-50 dark:border-slate-800/50">
                      <td className="px-4 py-2">
                        <Badge tone={s.rank <= 3 ? 'ok' : 'neutral'}>#{s.rank}</Badge>
                      </td>
                      <td className="px-4 py-2 font-medium">{s.user.firstName} {s.user.lastName}</td>
                      <td className="px-4 py-2 text-right">{s.total}/{s.max}</td>
                      <td className="px-4 py-2 text-right font-semibold">{s.pct}%</td>
                      <td className="px-4 py-2 text-right">{s.gpa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Class performance comparison" subtitle="Percentage by student" />
            <div className="p-3">
              <Bars
                data={(data?.students ?? []).map((s) => ({ name: `${s.user.firstName} ${s.user.lastName.charAt(0)}`, pct: s.pct }))}
                xKey="name" yKey="pct" unit="%" height={260}
              />
            </div>
          </Card>
        </>
      )}

      <Modal open={entryOpen} onClose={() => setEntryOpen(false)} title="Enter marks" wide>
        <div className="space-y-3">
          <Field label="Subject">
            <SubjectPicker value={subjectId} onChange={(v) => { setSubjectId(v); setScores({}); }} />
          </Field>
          {subjectId && (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full text-sm">
                <tbody>
                  {data?.students.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="px-3 py-1.5">{s.user.firstName} {s.user.lastName}</td>
                      <td className="w-28 px-3 py-1.5">
                        <Input
                          type="number" min={0} max={100}
                          placeholder={existingFor.has(s.id) ? String(existingFor.get(s.id)) : '—'}
                          value={scores[s.id] ?? ''}
                          onChange={(e) => setScores((m) => ({ ...m, [s.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEntryOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!subjectId} loading={save.isPending}>Save marks</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Student gradebook / report card ──
interface StudentGradebookData {
  student: { id: string; section: { name: string; class: { name: string } } | null; user?: { firstName: string; lastName: string } };
  exams: { examId: string; examName: string; rows: { subject: string; score: number; maxScore: number; grade: string | null }[]; total: number; max: number; pct: number; gpa: number; grade: string }[];
  rank: number | null;
  sectionSize: number | null;
}

export function StudentGradebook({ studentId, reportCard }: { studentId: string; reportCard?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gradebook', studentId],
    queryFn: () => api<StudentGradebookData>(`/gradebook/student/${studentId}`),
    enabled: !!studentId,
  });

  if (isLoading) return <Spinner />;
  if (!data || data.exams.length === 0) return <EmptyState title="No published results yet" />;

  const latest = data.exams[data.exams.length - 1];
  const trendData = data.exams.map((e) => ({ exam: e.examName, pct: e.pct, gpa: e.gpa * 10 }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Latest %" value={`${latest.pct}%`} tone={latest.pct >= 75 ? 'ok' : latest.pct >= 50 ? 'warn' : 'danger'} sub={latest.examName} />
        <StatCard label="GPA" value={latest.gpa} tone="brand" sub="scale of 10" />
        <StatCard label="Grade" value={latest.grade} />
        <StatCard label="Class rank" value={data.rank ? `#${data.rank}` : '—'} sub={data.sectionSize ? `of ${data.sectionSize}` : undefined} />
      </div>

      <Card>
        <CardHeader title="Performance trend" subtitle="Across published exams" />
        <div className="p-3">
          <MultiLine
            data={trendData}
            xKey="exam"
            series={[
              { key: 'pct', label: 'Percentage', color: '#2563eb' },
              { key: 'gpa', label: 'GPA ×10', color: '#16a34a' },
            ]}
          />
        </div>
      </Card>

      {[...data.exams].reverse().map((e) => (
        <Card key={e.examId}>
          <CardHeader
            title={e.examName}
            subtitle={`${e.total}/${e.max} · ${e.pct}% · GPA ${e.gpa} · Grade ${e.grade}`}
            actions={reportCard && (
              <Button size="sm" variant="secondary" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            )}
          />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-50 dark:border-slate-800/50">
                  <td className="px-4 py-2">{r.subject}</td>
                  <td className="px-4 py-2 text-right">{r.score}/{r.maxScore}</td>
                  <td className="px-4 py-2 text-right"><Badge tone={r.grade?.startsWith('A') ? 'ok' : r.grade === 'F' ? 'danger' : 'neutral'}>{r.grade}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
