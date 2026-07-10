'use client';
import { PageHeader, Spinner } from '@/components/ui';
import { StudentGradebook } from '@/features/gradebook';
import { useAuth } from '@/lib/auth';

export default function StudentGradebookPage() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return (
    <div>
      <PageHeader title="Gradebook" subtitle="Your marks across published exams" />
      <StudentGradebook studentId={user.studentId} />
    </div>
  );
}
