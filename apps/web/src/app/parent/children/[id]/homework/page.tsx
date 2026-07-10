'use client';

import { use } from 'react';
import { PageHeader } from '@/components/ui';
import { StudentHomeworkView } from '@/features/homework';

export default function ChildHomework({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader title="Homework" subtitle="Read-only view of your child's work" />
      <StudentHomeworkView studentId={id} canSubmit={false} />
    </div>
  );
}
