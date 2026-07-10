'use client';

import { use } from 'react';
import { PageHeader } from '@/components/ui';
import { StudentAttendance } from '@/features/attendance';

export default function ChildAttendance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader title="Attendance" />
      <StudentAttendance studentId={id} />
    </div>
  );
}
