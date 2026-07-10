'use client';
import { PageHeader, Spinner } from '@/components/ui';
import { StudentOverview } from '@/features/student-overview';
import { useAuth } from '@/lib/auth';

export default function StudentProgressHub() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return (
    <div>
      <PageHeader title="Progress Hub" subtitle="Your learning progress at a glance" />
      <StudentOverview studentId={user.studentId} />
    </div>
  );
}
