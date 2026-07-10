'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, StatusBadge, Tabs,
} from '@/components/ui';
import { HomeworkManager } from '@/features/homework';
import { ExamsManager } from '@/features/gradebook';
import { SectionPicker, useExams } from '@/features/pickers';
import { StudentOverview } from '@/features/student-overview';

function RubricsTab() {
  const qc = useQueryClient();
  const { data: exams } = useExams();
  const [examId, setExamId] = useState('');
  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: () => api<{ id: string; name: string; subjects: { id: string; maxScore: number; subject: { name: string }; rubrics: { id: string; criteria: string; maxScore: number }[] }[] }>(`/exams/${examId}`),
    enabled: !!examId,
  });
  const [addFor, setAddFor] = useState<string | null>(null);
  const [criteria, setCriteria] = useState('');
  const [maxScore, setMaxScore] = useState(20);
  const add = useMutation({
    mutationFn: () => api(`/exam-subjects/${addFor}/rubrics`, { method: 'POST', body: { criteria, maxScore: Number(maxScore) } }),
    onSuccess: () => { setAddFor(null); setCriteria(''); qc.invalidateQueries({ queryKey: ['exam-detail', examId] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/rubrics/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exam-detail', examId] }),
  });

  return (
    <div className="space-y-4">
      <Select value={examId} onChange={(e) => setExamId(e.target.value)} className="w-auto min-w-44">
        <option value="">Select exam…</option>
        {exams?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>
      {!examId ? (
        <EmptyState title="Pick an exam to manage assessment rubrics" />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {exam?.subjects.map((es) => (
            <Card key={es.id}>
              <CardHeader
                title={es.subject.name}
                subtitle={`Max score ${es.maxScore}`}
                actions={<Button size="sm" variant="secondary" onClick={() => setAddFor(es.id)}><Plus className="h-3.5 w-3.5" /></Button>}
              />
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {es.rubrics.length === 0 && <p className="p-3 text-xs text-slate-400">No rubric criteria</p>}
                {es.rubrics.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>{r.criteria}</span>
                    <span className="flex items-center gap-2">
                      <Badge>{r.maxScore} pts</Badge>
                      <button onClick={() => remove.mutate(r.id)} className="rounded p-0.5 text-slate-300 hover:text-danger-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!addFor} onClose={() => setAddFor(null)} title="Add rubric criterion">
        <div className="space-y-3">
          <Field label="Criteria"><Input value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Concept understanding" /></Field>
          <Field label="Max score"><Input type="number" value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddFor(null)}>Cancel</Button>
            <Button onClick={() => add.mutate()} disabled={!criteria} loading={add.isPending}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BehaviorTab() {
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const { data: students } = useQuery({
    queryKey: ['section-students', sectionId],
    queryFn: () => api<Paged<{ id: string; user: { firstName: string; lastName: string } }>>(`/students?sectionId=${sectionId}&pageSize=100`),
    enabled: !!sectionId,
  });
  const { data: notes, isLoading } = useQuery({
    queryKey: ['behavior', studentId],
    queryFn: () => api<{ id: string; category: string; description: string; createdAt: string; teacher: { user: { firstName: string; lastName: string } } }[]>(`/behavior-notes/${studentId}`),
    enabled: !!studentId,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SectionPicker value={sectionId} onChange={(v) => { setSectionId(v); setStudentId(''); }} />
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="min-w-44" disabled={!sectionId}>
          <option value="">Select student…</option>
          {students?.items.map((s) => <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName}</option>)}
        </Select>
      </div>
      {!studentId ? (
        <EmptyState title="Pick a student to review behavior notes" />
      ) : isLoading ? (
        <Spinner />
      ) : (notes ?? []).length === 0 ? (
        <EmptyState title="No behavior notes" />
      ) : (
        <div className="space-y-2">
          {notes!.map((n) => (
            <Card key={n.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="text-sm">{n.description}</p>
                <p className="text-xs text-slate-400">{n.teacher.user.firstName} {n.teacher.user.lastName} · {fmtDate(n.createdAt)}</p>
              </div>
              <StatusBadge status={n.category} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomesTab() {
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const { data: students } = useQuery({
    queryKey: ['section-students', sectionId],
    queryFn: () => api<Paged<{ id: string; user: { firstName: string; lastName: string } }>>(`/students?sectionId=${sectionId}&pageSize=100`),
    enabled: !!sectionId,
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SectionPicker value={sectionId} onChange={(v) => { setSectionId(v); setStudentId(''); }} />
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="min-w-44" disabled={!sectionId}>
          <option value="">Select student…</option>
          {students?.items.map((s) => <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName}</option>)}
        </Select>
      </div>
      {studentId ? <StudentOverview studentId={studentId} /> : <EmptyState title="Pick a student to see learning outcomes, skills and academic timeline" />}
    </div>
  );
}

export default function AdminProgressHub() {
  const [tab, setTab] = useState('assignments');
  return (
    <div>
      <PageHeader title="Progress Hub" subtitle="Assignments, exams, rubrics, behavior and learning outcomes" />
      <Tabs
        tabs={[
          { key: 'assignments', label: 'Assignments' },
          { key: 'exams', label: 'Exams' },
          { key: 'rubrics', label: 'Rubrics' },
          { key: 'behavior', label: 'Behavior' },
          { key: 'outcomes', label: 'Learning outcomes' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'assignments' && <HomeworkManager title="All homework & assignments" canCreate={false} />}
      {tab === 'exams' && <ExamsManager canManage />}
      {tab === 'rubrics' && <RubricsTab />}
      {tab === 'behavior' && <BehaviorTab />}
      {tab === 'outcomes' && <OutcomesTab />}
    </div>
  );
}
