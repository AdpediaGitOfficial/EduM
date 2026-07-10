'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { Card, CardHeader, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useStudentOverview, StudentOverview } from '@/features/student-overview';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: overview } = useStudentOverview(user?.studentId ?? null);
  const { data: anns } = useQuery({
    queryKey: ['dash-announcements'],
    queryFn: () => api<Paged<{ id: string; title: string; publishedAt: string }>>('/announcements?pageSize=5'),
  });
  const { data: hw } = useQuery({
    queryKey: ['student-homework', user?.studentId],
    queryFn: () => api<{ today: unknown[]; upcoming: unknown[]; overdue: { id: string; homework: { title: string; dueDate: string; subject: { name: string } }; status: string }[] }>(`/homework/student/${user?.studentId}`),
    enabled: !!user?.studentId,
  });

  if (!user?.studentId) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={`Hi, ${user.firstName} 👋`}
        subtitle={overview ? `${overview.student.class} · your learning snapshot` : 'Your learning snapshot'}
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Announcements" actions={<Link className="text-xs text-brand-600 hover:underline" href="/student/announcements">View all</Link>} />
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {(anns?.items ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{a.title}</span>
                <span className="text-xs text-slate-400">{fmtDate(a.publishedAt)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Overdue homework" actions={<Link className="text-xs text-brand-600 hover:underline" href="/student/homework">Open</Link>} />
          {(hw?.overdue ?? []).length === 0 ? (
            <p className="px-4 py-4 text-sm text-ok-600">All caught up ✓</p>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {hw!.overdue.slice(0, 5).map((s) => (
                <div key={s.id} className="px-4 py-2 text-sm">
                  <p className="font-medium">{s.homework.title}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">{s.homework.subject.name} · due {fmtDate(s.homework.dueDate)}</p>
                    <StatusBadge status="overdue" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <StudentOverview studentId={user.studentId} />
    </div>
  );
}
