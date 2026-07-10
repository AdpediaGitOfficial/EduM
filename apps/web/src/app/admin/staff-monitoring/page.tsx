'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, todayStr } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, Input, PageHeader, Spinner, StatusBadge, Tabs,
} from '@/components/ui';

interface StaffOverviewRow {
  id: string;
  employeeNo: string;
  name: string;
  role: string;
  department: string | null;
  designation: string | null;
  attendancePct: number | null;
  pendingLeaves: number;
  openTasks: { id: string; title: string; status: string }[];
  latestReview: { rating: number; reviewPeriod: string } | null;
}

interface StaffSheetRow {
  id: string;
  employeeNo: string;
  department: string | null;
  user: { firstName: string; lastName: string };
  status: string | null;
}

const STATUSES = ['present', 'absent', 'late', 'leave', 'half_day'];

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['staff-overview'],
    queryFn: () => api<StaffOverviewRow[]>('/staff-monitoring/overview'),
  });
  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader title="Staff KPIs" subtitle="Attendance (30d), leaves, tasks, latest review" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Department</th>
              <th className="px-4 py-2 text-right">Attendance</th>
              <th className="px-4 py-2 text-right">Pending leaves</th>
              <th className="px-4 py-2">Open tasks</th>
              <th className="px-4 py-2">Latest review</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-slate-50 dark:border-slate-800/50">
                <td className="px-4 py-2">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.employeeNo} · {s.designation ?? s.role}</p>
                </td>
                <td className="px-4 py-2">{s.department ?? '—'}</td>
                <td className={cn('px-4 py-2 text-right font-semibold', (s.attendancePct ?? 100) < 85 ? 'text-danger-600' : 'text-ok-600')}>
                  {s.attendancePct != null ? `${s.attendancePct}%` : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  {s.pendingLeaves > 0 ? <Badge tone="warn">{s.pendingLeaves}</Badge> : '—'}
                </td>
                <td className="px-4 py-2">
                  {s.openTasks.length === 0 ? '—' : s.openTasks.slice(0, 2).map((t) => (
                    <p key={t.id} className="text-xs">{t.title} <StatusBadge status={t.status} /></p>
                  ))}
                </td>
                <td className="px-4 py-2">
                  {s.latestReview ? (
                    <Badge tone={s.latestReview.rating >= 4 ? 'ok' : 'warn'}>
                      {s.latestReview.reviewPeriod}: {'★'.repeat(s.latestReview.rating)}
                    </Badge>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AttendanceTab() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['staff-sheet', date],
    queryFn: () => api<StaffSheetRow[]>(`/staff-monitoring/attendance?date=${date}`),
  });
  const effective = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of data ?? []) m[r.id] = marks[r.id] ?? r.status ?? 'present';
    return m;
  }, [data, marks]);
  const save = useMutation({
    mutationFn: () => api('/staff-monitoring/attendance', {
      method: 'POST',
      body: { date, entries: (data ?? []).map((r) => ({ staffId: r.id, status: effective[r.id] })) },
    }),
    onSuccess: () => { setMarks({}); qc.invalidateQueries({ queryKey: ['staff-sheet', date] }); },
  });

  return (
    <div className="space-y-3">
      <Input type="date" className="w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
      {isLoading ? <Spinner /> : (
        <Card>
          <table className="w-full text-sm">
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-slate-50 dark:border-slate-800/50">
                  <td className="px-4 py-2 font-medium">{r.user.firstName} {r.user.lastName}
                    <span className="ml-1 text-xs text-slate-400">{r.employeeNo}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.department ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setMarks((m) => ({ ...m, [r.id]: s }))}
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] capitalize',
                            effective[r.id] === s
                              ? s === 'present' ? 'bg-ok-600 text-white' : s === 'absent' ? 'bg-danger-600 text-white' : 'bg-warn-500 text-white'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                          )}
                        >
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function StaffMonitoringPage() {
  const [tab, setTab] = useState('overview');
  return (
    <div>
      <PageHeader title="Staff Monitoring" subtitle="Attendance, leaves, performance and task KPIs" />
      <Tabs
        tabs={[{ key: 'overview', label: 'KPI overview' }, { key: 'attendance', label: 'Staff attendance' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'attendance' && <AttendanceTab />}
    </div>
  );
}
