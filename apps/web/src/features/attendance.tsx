'use client';

/* Attendance: daily marking sheet, monthly grid, analytics, per-student view. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { QrCode, Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, todayStr } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input,
  Modal, Spinner, StatCard, StatusBadge,
} from '@/components/ui';
import { TrendLine, Bars } from '@/components/charts';
import { SectionPicker } from './pickers';

const MARK_STATUSES = ['present', 'absent', 'late', 'leave', 'half_day'] as const;

interface SheetRow {
  id: string;
  rollNo: number | null;
  admissionNo: string;
  user: { firstName: string; lastName: string };
  status: string | null;
  note: string | null;
  source: string | null;
}

export function AttendanceMarker() {
  const qc = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [captureOpen, setCaptureOpen] = useState<'qr' | 'rfid' | null>(null);
  const [captureValue, setCaptureValue] = useState('');
  const [captureMsg, setCaptureMsg] = useState('');

  const sheet = useQuery({
    queryKey: ['attendance-sheet', sectionId, date],
    queryFn: () => api<SheetRow[]>(`/attendance/sheet?sectionId=${sectionId}&date=${date}`),
    enabled: !!sectionId && !!date,
  });

  const effective = useMemo(() => {
    const m: Record<string, string> = {};
    for (const row of sheet.data ?? []) {
      m[row.id] = marks[row.id] ?? row.status ?? 'present';
    }
    return m;
  }, [sheet.data, marks]);

  const save = useMutation({
    mutationFn: () =>
      api('/attendance/mark', {
        method: 'POST',
        body: {
          sectionId, date,
          entries: (sheet.data ?? []).map((r) => ({ studentId: r.id, status: effective[r.id] })),
        },
      }),
    onSuccess: () => {
      setMarks({});
      qc.invalidateQueries({ queryKey: ['attendance-sheet', sectionId, date] });
    },
  });

  const capture = useMutation({
    mutationFn: () =>
      api(`/attendance/capture/${captureOpen}`, {
        method: 'POST',
        body: captureOpen === 'qr' ? { admissionNo: captureValue, date } : { cardId: captureValue },
      }),
    onSuccess: () => {
      setCaptureMsg(`Marked present: ${captureValue}`);
      setCaptureValue('');
      qc.invalidateQueries({ queryKey: ['attendance-sheet', sectionId, date] });
    },
    onError: (e: Error) => setCaptureMsg(e.message),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of Object.values(effective)) c[v] = (c[v] ?? 0) + 1;
    return c;
  }, [effective]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionPicker value={sectionId} onChange={setSectionId} />
        <Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => { setCaptureOpen('qr'); setCaptureMsg(''); }}>
          <QrCode className="h-4 w-4" /> QR capture
        </Button>
        <Button variant="secondary" size="sm" onClick={() => { setCaptureOpen('rfid'); setCaptureMsg(''); }}>
          <Radio className="h-4 w-4" /> RFID capture
        </Button>
      </div>

      {!sectionId ? (
        <EmptyState title="Pick a section to mark attendance" />
      ) : sheet.isLoading ? (
        <Spinner />
      ) : sheet.isError ? (
        <ErrorState message={(sheet.error as Error).message} onRetry={() => sheet.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            {MARK_STATUSES.map((s) => (
              <Badge key={s} tone={s === 'present' ? 'ok' : s === 'absent' ? 'danger' : 'warn'}>
                {s.replace('_', ' ')}: {counts[s] ?? 0}
              </Badge>
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="secondary" onClick={() => {
              const all: Record<string, string> = {};
              for (const r of sheet.data ?? []) all[r.id] = 'present';
              setMarks(all);
            }}>All present</Button>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
                    <th className="px-4 py-2">Roll</th>
                    <th className="px-4 py-2">Student</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(sheet.data ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="px-4 py-2 text-slate-500">{r.rollNo ?? '—'}</td>
                      <td className="px-4 py-2 font-medium">
                        {r.user.firstName} {r.user.lastName}
                        <span className="ml-1 text-xs text-slate-400">{r.admissionNo}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {MARK_STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => setMarks((m) => ({ ...m, [r.id]: s }))}
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[11px] capitalize transition-colors',
                                effective[r.id] === s
                                  ? s === 'present'
                                    ? 'bg-ok-600 text-white'
                                    : s === 'absent'
                                      ? 'bg-danger-600 text-white'
                                      : 'bg-warn-500 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400',
                              )}
                            >
                              {s.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">{r.source ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <Button onClick={() => save.mutate()} loading={save.isPending}>Save attendance</Button>
            </div>
          </Card>
        </>
      )}

      <Modal open={!!captureOpen} onClose={() => setCaptureOpen(null)} title={captureOpen === 'qr' ? 'QR capture' : 'RFID capture'}>
        <p className="mb-3 text-xs text-slate-500">
          Hardware-ready endpoint contract: {captureOpen === 'qr'
            ? 'scanners POST the admission number encoded in the student QR.'
            : 'readers POST the card id (provisioned as the admission number).'}
          {' '}Enter a value manually to simulate a scan.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); capture.mutate(); }} className="space-y-3">
          <Field label={captureOpen === 'qr' ? 'Admission number' : 'Card ID'}>
            <Input value={captureValue} onChange={(e) => setCaptureValue(e.target.value)} placeholder="ADM-2026-001" autoFocus />
          </Field>
          {captureMsg && <p className={cn('text-sm', captureMsg.startsWith('Marked') ? 'text-ok-600' : 'text-danger-600')}>{captureMsg}</p>}
          <div className="flex justify-end">
            <Button type="submit" loading={capture.isPending}>Capture</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function MonthlyAttendance() {
  const [sectionId, setSectionId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-monthly', sectionId, month],
    queryFn: () =>
      api<{ students: { id: string; rollNo: number | null; user: { firstName: string; lastName: string } }[]; records: { studentId: string; date: string; status: string }[] }>(
        `/attendance/monthly?sectionId=${sectionId}&month=${month}`,
      ),
    enabled: !!sectionId,
  });

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [month]);

  const cell = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data?.records ?? []) {
      map.set(`${r.studentId}-${new Date(r.date).getUTCDate()}`, r.status);
    }
    return map;
  }, [data]);

  const dot = (status?: string) =>
    !status ? 'bg-slate-100 dark:bg-slate-800'
      : status === 'present' ? 'bg-ok-500'
      : status === 'late' ? 'bg-warn-500'
      : status === 'leave' || status === 'half_day' ? 'bg-warn-300'
      : 'bg-danger-500';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SectionPicker value={sectionId} onChange={setSectionId} />
        <Input type="month" className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ok-500" /> present
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-warn-500" /> late/leave
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger-500" /> absent
        </div>
      </div>
      {!sectionId ? (
        <EmptyState title="Pick a section" />
      ) : isLoading ? (
        <Spinner />
      ) : (
        <Card className="overflow-x-auto p-3">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white pr-2 text-left dark:bg-slate-900">Student</th>
                {days.map((d) => (
                  <th key={d} className="w-5 p-0.5 text-center font-normal text-slate-400">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.students ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="sticky left-0 whitespace-nowrap bg-white py-1 pr-2 font-medium dark:bg-slate-900">
                    {s.user.firstName} {s.user.lastName}
                  </td>
                  {days.map((d) => (
                    <td key={d} className="p-0.5">
                      <span
                        title={cell.get(`${s.id}-${d}`) ?? ''}
                        className={cn('block h-3.5 w-3.5 rounded-sm', dot(cell.get(`${s.id}-${d}`)))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function AttendanceAnalytics() {
  const [sectionId, setSectionId] = useState('');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['attendance-analytics', sectionId],
    queryFn: () => api<{
      trend: { date: string; pct: number }[];
      sectionStats: { sectionId: string; label: string; pct: number }[];
      lowAttendance: { id: string; admissionNo: string; pct: number; user: { firstName: string; lastName: string }; section?: { name: string; class: { name: string } } }[];
      windowDays: number;
    }>(`/attendance/analytics${sectionId ? `?sectionId=${sectionId}` : ''}`),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <SectionPicker value={sectionId} onChange={setSectionId} allowAll />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance trend" subtitle={`Last ${data?.windowDays} days`} />
          <div className="p-3">
            <TrendLine data={data?.trend ?? []} xKey="date" yKey="pct" unit="%" color="#16a34a" />
          </div>
        </Card>
        <Card>
          <CardHeader title="By section" subtitle="Present % in window" />
          <div className="p-3">
            <Bars data={data?.sectionStats ?? []} xKey="label" yKey="pct" unit="%" />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Low attendance (<75%)" subtitle="Visible rule — not a black box" />
        {data?.lowAttendance.length === 0 ? (
          <EmptyState title="No students below 75%" />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data?.lowAttendance.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="px-4 py-2 font-medium">{s.user.firstName} {s.user.lastName}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{s.admissionNo}</td>
                  <td className="px-4 py-2 text-xs">{s.section ? `${s.section.class.name}-${s.section.name}` : ''}</td>
                  <td className="px-4 py-2 text-right font-semibold text-danger-600">{s.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/** per-student attendance summary + history (parent/student view) */
export function StudentAttendance({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-student', studentId],
    queryFn: () => api<{
      records: { id: string; date: string; status: string; note: string | null }[];
      summary: { total: number; counts: Record<string, number>; presentPct: number };
    }>(`/attendance/student/${studentId}`),
    enabled: !!studentId,
  });
  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Attendance" value={`${data.summary.presentPct}%`} tone={data.summary.presentPct >= 90 ? 'ok' : data.summary.presentPct >= 75 ? 'warn' : 'danger'} />
        <StatCard label="Present" value={data.summary.counts.present ?? 0} tone="ok" />
        <StatCard label="Leave/Late" value={(data.summary.counts.leave ?? 0) + (data.summary.counts.late ?? 0)} tone="warn" />
        <StatCard label="Absent" value={data.summary.counts.absent ?? 0} tone="danger" />
      </div>
      <Card>
        <CardHeader title="Recent days" />
        <div className="grid max-h-96 grid-cols-1 overflow-y-auto sm:grid-cols-2">
          {data.records.slice(0, 40).map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-50 px-4 py-2 text-sm dark:border-slate-800/50">
              <span>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
