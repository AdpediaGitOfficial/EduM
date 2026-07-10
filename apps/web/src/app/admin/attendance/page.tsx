'use client';
import { useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { AttendanceMarker, MonthlyAttendance, AttendanceAnalytics } from '@/features/attendance';

export default function AdminAttendance() {
  const [tab, setTab] = useState('daily');
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Daily marking, monthly registers and analytics" />
      <Tabs
        tabs={[
          { key: 'daily', label: 'Daily' },
          { key: 'monthly', label: 'Monthly' },
          { key: 'analytics', label: 'Analytics' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'daily' && <AttendanceMarker />}
      {tab === 'monthly' && <MonthlyAttendance />}
      {tab === 'analytics' && <AttendanceAnalytics />}
    </div>
  );
}
