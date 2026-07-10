'use client';

import { use, useState } from 'react';
import { PageHeader, Tabs } from '@/components/ui';
import { StudentOverview } from '@/features/student-overview';
import { StudentAttendance } from '@/features/attendance';
import { StudentGradebook } from '@/features/gradebook';
import { StudentHomeworkView } from '@/features/homework';

export default function TeacherStudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState('overview');
  return (
    <div>
      <PageHeader title="Student Profile" />
      <Tabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'attendance', label: 'Attendance' },
          { key: 'gradebook', label: 'Gradebook' },
          { key: 'homework', label: 'Homework' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <StudentOverview studentId={id} />}
      {tab === 'attendance' && <StudentAttendance studentId={id} />}
      {tab === 'gradebook' && <StudentGradebook studentId={id} />}
      {tab === 'homework' && <StudentHomeworkView studentId={id} canSubmit={false} />}
    </div>
  );
}
