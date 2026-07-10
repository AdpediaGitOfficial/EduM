'use client';
import { PageHeader, Spinner } from '@/components/ui';
import { StudentHomeworkView } from '@/features/homework';
import { useAuth } from '@/lib/auth';

export default function StudentHomeworkPage() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return (
    <div>
      <PageHeader title="Homework" subtitle="Today, upcoming and overdue work" />
      <StudentHomeworkView studentId={user.studentId} canSubmit />
    </div>
  );
}
