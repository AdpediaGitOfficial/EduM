'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtMoney } from '@/lib/utils';
import { Badge, Card, CardHeader, PageHeader, Spinner, StatCard, Tabs } from '@/components/ui';
import { Bars, Donut, TrendLine } from '@/components/charts';
import { AttendanceAnalytics } from '@/features/attendance';

function ExecutiveTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api<{
      headline: Record<string, number>;
      revenueTrend: { month: string; amount: number }[];
      attendanceTrend: { date: string; pct: number }[];
      sectionPerformance: { label: string; avgPct: number }[];
      teacherPerformance: { name: string; period: string; rating: number }[];
      invoiceStatus: Record<string, number>;
      complaintsByStatus: Record<string, number>;
      examName: string | null;
    }>('/analytics/admin'),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Students" value={data.headline.students} tone="brand" />
        <StatCard label="Collection rate" value={`${data.headline.collectionRate}%`} tone="ok" />
        <StatCard label="Attendance 30d" value={`${data.headline.attendance30d}%`} />
        <StatCard label="Outstanding" value={fmtMoney(data.headline.revenueOutstanding)} tone="danger" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Revenue" /><div className="p-3"><TrendLine data={data.revenueTrend} xKey="month" yKey="amount" /></div></Card>
        <Card><CardHeader title="Student performance by section" subtitle={data.examName ?? ''} /><div className="p-3"><Bars data={data.sectionPerformance} xKey="label" yKey="avgPct" unit="%" /></div></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Teacher performance" subtitle="Review ratings" />
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {data.teacherPerformance.map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>{t.name} <span className="text-xs text-slate-400">({t.period})</span></span>
                <Badge tone={t.rating >= 4 ? 'ok' : 'warn'}>{'★'.repeat(t.rating)}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card><CardHeader title="Complaints" /><div className="p-3"><Donut data={Object.entries(data.complaintsByStatus).map(([name, value]) => ({ name, value }))} /></div></Card>
      </div>
    </div>
  );
}

function FinanceTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance-analytics'],
    queryFn: () => api<{ invoiced: number; collected: number; outstanding: number; collectionRate: number; overdueCount: number; byMethod: Record<string, number>; trend: { month: string; amount: number }[]; payroll: { month: string; status: string; total: number }[] }>('/analytics/finance'),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Invoiced" value={fmtMoney(data.invoiced)} />
        <StatCard label="Collected" value={fmtMoney(data.collected)} tone="ok" />
        <StatCard label="Outstanding" value={fmtMoney(data.outstanding)} tone="danger" />
        <StatCard label="Collection rate" value={`${data.collectionRate}%`} tone="brand" />
        <StatCard label="Overdue invoices" value={data.overdueCount} tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Collections trend" /><div className="p-3"><TrendLine data={data.trend} xKey="month" yKey="amount" /></div></Card>
        <Card><CardHeader title="By method" /><div className="p-3"><Donut data={Object.entries(data.byMethod).map(([name, value]) => ({ name: name.replace('_', ' '), value: Math.round(value) }))} /></div></Card>
      </div>
    </div>
  );
}

function HrTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-analytics'],
    queryFn: () => api<{ staffCount: number; byDepartment: Record<string, number>; staffAttendance30d: number; leavesByStatus: Record<string, number>; payrollByMonth: { month: string; total: number }[] }>('/analytics/hr'),
  });
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff" value={data.staffCount} tone="brand" />
        <StatCard label="Staff attendance" value={`${data.staffAttendance30d}%`} tone="ok" />
        <StatCard label="Pending leaves" value={data.leavesByStatus.pending ?? 0} tone="warn" />
        <StatCard label="Approved leaves" value={data.leavesByStatus.approved ?? 0} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Staff by department" /><div className="p-3"><Donut data={Object.entries(data.byDepartment).map(([name, value]) => ({ name, value }))} /></div></Card>
        <Card><CardHeader title="Payroll cost by month" /><div className="p-3"><Bars data={data.payrollByMonth} xKey="month" yKey="total" /></div></Card>
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('executive');
  const canExec = ['super_admin', 'school_admin', 'principal', 'vice_principal'].includes(user?.role ?? '');
  const canFinance = ['super_admin', 'school_admin', 'principal', 'accountant'].includes(user?.role ?? '');
  const canHr = ['super_admin', 'school_admin', 'principal', 'hr'].includes(user?.role ?? '');
  const tabs = [
    ...(canExec ? [{ key: 'executive', label: 'Executive' }] : []),
    ...(canExec ? [{ key: 'attendance', label: 'Attendance' }] : []),
    ...(canFinance ? [{ key: 'finance', label: 'Finance' }] : []),
    ...(canHr ? [{ key: 'hr', label: 'Staff & HR' }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key ?? 'executive';

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Role-specific dashboards computed from live data" />
      <Tabs tabs={tabs} active={active} onChange={setTab} />
      {active === 'executive' && <ExecutiveTab />}
      {active === 'attendance' && <AttendanceAnalytics />}
      {active === 'finance' && <FinanceTab />}
      {active === 'hr' && <HrTab />}
    </div>
  );
}
