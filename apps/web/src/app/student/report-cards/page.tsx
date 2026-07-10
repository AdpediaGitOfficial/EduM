'use client';
import { PageHeader, Spinner } from '@/components/ui';
import { StudentGradebook } from '@/features/gradebook';
import { useAuth } from '@/lib/auth';

export default function StudentReportCards() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return (
    <div>
      <PageHeader title="Report Cards" subtitle="Printable exam report cards" />
      <StudentGradebook studentId={user.studentId} reportCard />
    </div>
  );
}
