'use client';
import { useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { AttendanceMarker, MonthlyAttendance, AttendanceAnalytics } from '@/features/attendance';

export default function TeacherAttendance() {
  const [tab, setTab] = useState('daily');
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark and review attendance for your sections" />
      <Tabs
        tabs={[
          { key: 'daily', label: 'Daily marking' },
          { key: 'monthly', label: 'Monthly view' },
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
