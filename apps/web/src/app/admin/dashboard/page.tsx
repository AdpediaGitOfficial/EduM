'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtMoney } from '@/lib/utils';
import { Card, CardHeader, ErrorState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { Bars, Donut, TrendLine } from '@/components/charts';

interface AdminAnalytics {
  headline: {
    students: number; staff: number; revenueCollected: number; revenueOutstanding: number;
    collectionRate: number; attendance30d: number; admissionsThisYear: number;
    activeBuses: number; assets: number; libraryCopies: number; libraryAvailable: number;
  };
  revenueTrend: { month: string; amount: number }[];
  attendanceTrend: { date: string; pct: number }[];
  sectionPerformance: { label: string; avgPct: number }[];
  teacherPerformance: { name: string; period: string; rating: number }[];
  invoiceStatus: Record<string, number>;
  complaintsByStatus: Record<string, number>;
  examName: string | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const isLeadership = ['super_admin', 'school_admin', 'principal', 'vice_principal'].includes(user?.role ?? '');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api<AdminAnalytics>('/analytics/admin'),
    enabled: isLeadership,
  });
  const finance = useQuery({
    queryKey: ['finance-analytics'],
    queryFn: () => api<{ invoiced: number; collected: number; outstanding: number; collectionRate: number; trend: { month: string; amount: number }[]; byMethod: Record<string, number> }>('/analytics/finance'),
    enabled: user?.role === 'accountant',
  });
  const hr = useQuery({
    queryKey: ['hr-analytics'],
    queryFn: () => api<{ staffCount: number; byDepartment: Record<string, number>; staffAttendance30d: number; leavesByStatus: Record<string, number>; payrollByMonth: { month: string; total: number }[] }>('/analytics/hr'),
    enabled: user?.role === 'hr',
  });

  if (user?.role === 'accountant') {
    if (finance.isLoading || !finance.data) return <Spinner />;
    const f = finance.data;
    return (
      <div>
        <PageHeader title="Finance Dashboard" subtitle="Collections and outstanding at a glance" />
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Invoiced" value={fmtMoney(f.invoiced)} />
          <StatCard label="Collected" value={fmtMoney(f.collected)} tone="ok" />
          <StatCard label="Outstanding" value={fmtMoney(f.outstanding)} tone="danger" />
          <StatCard label="Collection rate" value={`${f.collectionRate}%`} tone="brand" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="Monthly collections" /><div className="p-3"><TrendLine data={f.trend} xKey="month" yKey="amount" /></div></Card>
          <Card><CardHeader title="By payment method" /><div className="p-3"><Donut data={Object.entries(f.byMethod).map(([name, value]) => ({ name, value }))} /></div></Card>
        </div>
      </div>
    );
  }

  if (user?.role === 'hr') {
    if (hr.isLoading || !hr.data) return <Spinner />;
    const h = hr.data;
    return (
      <div>
        <PageHeader title="HR Dashboard" subtitle="Staffing, attendance and payroll" />
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active staff" value={h.staffCount} tone="brand" />
          <StatCard label="Staff attendance (30d)" value={`${h.staffAttendance30d}%`} tone="ok" />
          <StatCard label="Pending leaves" value={h.leavesByStatus.pending ?? 0} tone="warn" />
          <StatCard label="Approved leaves" value={h.leavesByStatus.approved ?? 0} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader title="Staff by department" /><div className="p-3"><Donut data={Object.entries(h.byDepartment).map(([name, value]) => ({ name, value }))} /></div></Card>
          <Card><CardHeader title="Payroll by month" /><div className="p-3"><Bars data={h.payrollByMonth} xKey="month" yKey="total" /></div></Card>
        </div>
      </div>
    );
  }

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="School-wide health at a glance" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={data.headline.students} tone="brand" sub={`${data.headline.admissionsThisYear} admitted this year`} />
        <StatCard label="Staff" value={data.headline.staff} />
        <StatCard label="Revenue collected" value={fmtMoney(data.headline.revenueCollected)} tone="ok" sub={`${data.headline.collectionRate}% collection rate`} />
        <StatCard label="Outstanding" value={fmtMoney(data.headline.revenueOutstanding)} tone={data.headline.revenueOutstanding > 0 ? 'danger' : 'ok'} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance (30d)" value={`${data.headline.attendance30d}%`} tone={data.headline.attendance30d >= 90 ? 'ok' : 'warn'} />
        <StatCard label="Active buses" value={data.headline.activeBuses} />
        <StatCard label="Assets tracked" value={data.headline.assets} />
        <StatCard label="Library availability" value={`${data.headline.libraryAvailable}/${data.headline.libraryCopies}`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue trend" subtitle="Fee collections by month" />
          <div className="p-3"><TrendLine data={data.revenueTrend} xKey="month" yKey="amount" /></div>
        </Card>
        <Card>
          <CardHeader title="Attendance trend" subtitle="Daily present %, last 30 days" />
          <div className="p-3"><TrendLine data={data.attendanceTrend} xKey="date" yKey="pct" unit="%" color="#16a34a" /></div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Section performance" subtitle={data.examName ?? 'Latest exam'} />
          <div className="p-3"><Bars data={data.sectionPerformance} xKey="label" yKey="avgPct" unit="%" /></div>
        </Card>
        <Card>
          <CardHeader title="Invoice status" />
          <div className="p-3"><Donut data={Object.entries(data.invoiceStatus).map(([name, value]) => ({ name, value }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Complaints" />
          <div className="p-3"><Donut data={Object.entries(data.complaintsByStatus).map(([name, value]) => ({ name, value }))} /></div>
        </Card>
      </div>
    </div>
  );
}
