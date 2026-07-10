'use client';

import { use } from 'react';
import { PageHeader } from '@/components/ui';
import { StudentGradebook } from '@/features/gradebook';

export default function ChildExams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader title="Exams & Results" />
      <StudentGradebook studentId={id} />
    </div>
  );
}
