'use client';
import { PageHeader, Spinner } from '@/components/ui';
import { StudentAttendance } from '@/features/attendance';
import { useAuth } from '@/lib/auth';

export default function StudentAttendancePage() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return (
    <div>
      <PageHeader title="My Attendance" />
      <StudentAttendance studentId={user.studentId} />
    </div>
  );
}
