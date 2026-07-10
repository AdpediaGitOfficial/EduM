'use client';

/* Per-child / per-student analytics overview (parent dashboard, student progress hub). */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { Card, CardHeader, EmptyState, Spinner, StatCard, StatusBadge } from '@/components/ui';
import { Bars, TrendLine } from '@/components/charts';

export interface OverviewData {
  student: { id: string; name: string; class: string };
  attendancePct: number;
  attendanceTrend: { week: string; pct: number }[];
  examTrend: { exam: string; pct: number; gpa: number }[];
  subjectScores: { subject: string; pct: number; grade: string | null }[];
  fees: { totalDue: number; totalPaid: number; outstanding: number };
  homework: Record<string, number>;
  remarks: { id: string; note: string; createdAt: string }[];
  behavior: { id: string; category: string; description: string; createdAt: string; teacher: { user: { firstName: string; lastName: string } } }[];
}

export function useStudentOverview(studentId: string | null) {
  return useQuery({
    queryKey: ['student-overview', studentId],
    queryFn: () => api<OverviewData>(`/analytics/student-overview?studentId=${studentId}`),
    enabled: !!studentId,
  });
}

export function StudentOverview({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentOverview(studentId);
  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState />;

  const hwDone = (data.homework.graded ?? 0) + (data.homework.submitted ?? 0) + (data.homework.late ?? 0);
  const hwTotal = Object.values(data.homework).reduce((a, b) => a + b, 0);
  const latestExam = data.examTrend[data.examTrend.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendance (60d)"
          value={`${data.attendancePct}%`}
          tone={data.attendancePct >= 90 ? 'ok' : data.attendancePct >= 75 ? 'warn' : 'danger'}
        />
        <StatCard label="Latest exam" value={latestExam ? `${latestExam.pct}%` : '—'} sub={latestExam?.exam} tone="brand" />
        <StatCard
          label="Homework done"
          value={hwTotal ? `${hwDone}/${hwTotal}` : '—'}
          tone={hwTotal && hwDone / hwTotal > 0.8 ? 'ok' : 'warn'}
        />
        <StatCard
          label="Fees outstanding"
          value={fmtMoney(data.fees.outstanding)}
          tone={data.fees.outstanding === 0 ? 'ok' : 'danger'}
          sub={`paid ${fmtMoney(data.fees.totalPaid)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance trend" subtitle="Weekly, last ~8 weeks" />
          <div className="p-3">
            <TrendLine data={data.attendanceTrend} xKey="week" yKey="pct" unit="%" color="#16a34a" height={200} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Exam progress" subtitle="Overall percentage per exam" />
          <div className="p-3">
            <TrendLine data={data.examTrend} xKey="exam" yKey="pct" unit="%" height={200} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Subject performance" subtitle="Latest exam" />
          <div className="p-3">
            <Bars data={data.subjectScores} xKey="subject" yKey="pct" unit="%" height={220} horizontal />
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Teacher remarks" />
            {data.remarks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No remarks yet</p>
            ) : (
              <div className="divide-y divide-slate-50 px-4 dark:divide-slate-800/50">
                {data.remarks.map((r) => (
                  <div key={r.id} className="py-2.5">
                    <p className="text-sm">{r.note}</p>
                    <p className="text-xs text-slate-400">{fmtDate(r.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Behavior notes" />
            {data.behavior.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No behavior notes</p>
            ) : (
              <div className="divide-y divide-slate-50 px-4 dark:divide-slate-800/50">
                {data.behavior.map((b) => (
                  <div key={b.id} className="flex items-start justify-between gap-2 py-2.5">
                    <div>
                      <p className="text-sm">{b.description}</p>
                      <p className="text-xs text-slate-400">
                        {b.teacher.user.firstName} {b.teacher.user.lastName} · {fmtDate(b.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={b.category} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
