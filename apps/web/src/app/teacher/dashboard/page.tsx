'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { Bars, TrendLine } from '@/components/charts';

interface TeacherAnalytics {
  headline: { sections: number; students: number; assignments: number; weakStudents: number };
  weakRule: string;
  attendanceTrend: { date: string; pct: number }[];
  completion: { id: string; title: string; subject: string; completionPct: number }[];
  weakStudents: { id: string; name: string; section: string; attendancePct: number | null; missedAssignments: number; examPct: number | null; reasons: string[] }[];
  comparison: { name: string; section: string; examPct: number | null; attendancePct: number | null }[];
  examName: string | null;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['teacher-analytics'],
    queryFn: () => api<TeacherAnalytics>('/analytics/teacher'),
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName}`} subtitle="Your classes at a glance" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="My sections" value={data.headline.sections} tone="brand" />
        <StatCard label="Students" value={data.headline.students} />
        <StatCard label="Assignments" value={data.headline.assignments} />
        <StatCard
          label="Students needing attention"
          value={data.headline.weakStudents}
          tone={data.headline.weakStudents > 0 ? 'danger' : 'ok'}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance trend" subtitle="My sections, last 30 days" />
          <div className="p-3">
            <TrendLine data={data.attendanceTrend} xKey="date" yKey="pct" unit="%" color="#16a34a" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Assignment completion" subtitle="Latest assignments" />
          <div className="p-3">
            <Bars
              data={data.completion.slice(0, 8).map((c) => ({ name: c.title.slice(0, 18), pct: c.completionPct }))}
              xKey="name" yKey="pct" unit="%"
            />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="Students needing attention"
          subtitle={`Rule: ${data.weakRule}`}
          actions={<Link href="/teacher/progress-hub" className="text-xs text-brand-600 hover:underline">Progress hub</Link>}
        />
        {data.weakStudents.length === 0 ? (
          <EmptyState title="No students flagged 🎉" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2">Student</th>
                  <th className="px-4 py-2">Section</th>
                  <th className="px-4 py-2 text-right">Attendance</th>
                  <th className="px-4 py-2 text-right">Missed work</th>
                  <th className="px-4 py-2 text-right">Exam %</th>
                  <th className="px-4 py-2">Why flagged</th>
                </tr>
              </thead>
              <tbody>
                {data.weakStudents.map((s) => (
                  <tr key={s.id} className="border-t border-slate-50 dark:border-slate-800/50">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2 text-xs">{s.section}</td>
                    <td className="px-4 py-2 text-right text-danger-600">{s.attendancePct ?? '—'}%</td>
                    <td className="px-4 py-2 text-right">{s.missedAssignments}</td>
                    <td className="px-4 py-2 text-right">{s.examPct ?? '—'}</td>
                    <td className="px-4 py-2">
                      {s.reasons.map((r, i) => <Badge key={i} tone="danger" className="mr-1">{r}</Badge>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Student comparison" subtitle={data.examName ? `Exam: ${data.examName}` : 'Latest exam'} />
        <div className="p-3">
          <Bars
            data={data.comparison.slice(0, 20).map((c) => ({ name: c.name.split(' ')[0], pct: c.examPct ?? 0 }))}
            xKey="name" yKey="pct" unit="%" height={260}
          />
        </div>
      </Card>
    </div>
  );
}
