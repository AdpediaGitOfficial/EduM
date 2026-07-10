'use client';

import { use } from 'react';
import { PageHeader } from '@/components/ui';
import { StudentOverview } from '@/features/student-overview';

export default function ChildAcademic({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader title="Academic Overview" />
      <StudentOverview studentId={id} />
    </div>
  );
}
