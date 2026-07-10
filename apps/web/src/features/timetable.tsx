'use client';

/* Timetable grid + builder shared across roles. */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from '@/components/ui';
import { useSubjects } from './pickers';

export interface Slot {
  id: string;
  sectionId: string;
  dayOfWeek: number;
  periodNo: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  subject: { id: string; name: string; code: string };
  section?: { id: string; name: string; class: { name: string } };
  teacherStaffId?: string | null;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TimetableGrid({ slots, showSection, onCellClick }: {
  slots: Slot[];
  showSection?: boolean;
  onCellClick?: (day: number, period: number, existing?: Slot) => void;
}) {
  if (slots.length === 0 && !onCellClick) return <EmptyState title="No timetable yet" />;
  const days = Array.from(new Set(slots.map((s) => s.dayOfWeek))).sort();
  const shownDays = days.length ? days : [1, 2, 3, 4, 5];
  const periods = Array.from(new Set(slots.map((s) => s.periodNo))).sort((a, b) => a - b);
  const shownPeriods = periods.length ? periods : [1, 2, 3, 4, 5, 6, 7, 8];
  const byKey = new Map<string, Slot>(slots.map((s) => [`${s.dayOfWeek}-${s.periodNo}`, s] as const));
  const timeFor = (p: number) => {
    const s = slots.find((x) => x.periodNo === p);
    return s ? `${s.startTime}–${s.endTime}` : '';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-20 p-1 text-left text-slate-400">Period</th>
            {shownDays.map((d) => (
              <th key={d} className="p-1 text-center font-semibold">{DAYS[d - 1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shownPeriods.map((p) => (
            <tr key={p}>
              <td className="p-1 align-top">
                <span className="font-semibold">P{p}</span>
                <span className="block text-[10px] text-slate-400">{timeFor(p)}</span>
              </td>
              {shownDays.map((d) => {
                const slot = byKey.get(`${d}-${p}`);
                return (
                  <td key={d} className="p-0">
                    <button
                      disabled={!onCellClick}
                      onClick={() => onCellClick?.(d, p, slot)}
                      className={`block h-full w-full rounded-lg border p-1.5 text-left transition-colors ${
                        slot
                          ? 'border-brand-200 bg-brand-50 hover:border-brand-400 dark:border-brand-900 dark:bg-brand-900/20'
                          : 'border-dashed border-slate-200 dark:border-slate-800'
                      } ${onCellClick ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {slot ? (
                        <>
                          <span className="block font-semibold text-brand-700 dark:text-brand-200">{slot.subject.code}</span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {showSection && slot.section ? `${slot.section.class.name}-${slot.section.name}` : slot.subject.name}
                          </span>
                          {slot.room && <span className="block text-[10px] text-slate-400">{slot.room}</span>}
                        </>
                      ) : (
                        <span className="block py-2 text-center text-slate-300 dark:text-slate-700">—</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** admin/VP timetable builder for a section */
export function TimetableBuilder({ sectionId }: { sectionId: string }) {
  const qc = useQueryClient();
  const { data: slots, isLoading } = useQuery({
    queryKey: ['timetable', sectionId],
    queryFn: () => api<Slot[]>(`/timetable/section/${sectionId}`),
    enabled: !!sectionId,
  });
  const { data: subjects } = useSubjects();
  const [editing, setEditing] = useState<null | { day: number; period: number; existing?: Slot }>(null);
  const [subjectId, setSubjectId] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('08:45');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api('/timetable/slots', {
        method: 'POST',
        body: {
          sectionId, subjectId, dayOfWeek: editing!.day, periodNo: editing!.period,
          startTime, endTime, room: room || undefined,
        },
      }),
    onSuccess: () => { setEditing(null); setError(''); qc.invalidateQueries({ queryKey: ['timetable', sectionId] }); },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/timetable/slots/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ['timetable', sectionId] }); },
  });

  if (!sectionId) return <EmptyState title="Pick a section to edit its timetable" />;
  if (isLoading) return <Spinner />;

  return (
    <Card className="p-3">
      <TimetableGrid
        slots={slots ?? []}
        onCellClick={(day, period, existing) => {
          setEditing({ day, period, existing });
          setSubjectId(existing?.subject.id ?? '');
          setStartTime(existing?.startTime ?? ['08:00', '08:45', '09:30', '10:35', '11:20', '12:50', '13:35', '14:20'][period - 1] ?? '08:00');
          setEndTime(existing?.endTime ?? ['08:45', '09:30', '10:15', '11:20', '12:05', '13:35', '14:20', '15:05'][period - 1] ?? '08:45');
          setRoom(existing?.room ?? '');
          setError('');
        }}
      />
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${DAYS[(editing?.day ?? 1) - 1]} · Period ${editing?.period}`}
      >
        <div className="space-y-3">
          <Field label="Subject">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select…</option>
              {subjects?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
            <Field label="End"><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
          </div>
          <Field label="Room"><Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="R-101" /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-between">
            {editing?.existing ? (
              <Button variant="danger" size="sm" onClick={() => remove.mutate(editing.existing!.id)}>Clear slot</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={!subjectId} loading={save.isPending}>Save</Button>
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/** my own weekly schedule (teacher/student/parent) */
export function MySchedule() {
  const { data, isLoading } = useQuery({ queryKey: ['timetable-me'], queryFn: () => api<Slot[]>('/timetable/me') });
  if (isLoading) return <Spinner />;
  return (
    <Card className="p-3">
      <TimetableGrid slots={data ?? []} showSection />
    </Card>
  );
}
