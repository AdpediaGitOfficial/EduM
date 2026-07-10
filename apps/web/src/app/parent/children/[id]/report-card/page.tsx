'use client';

import { use } from 'react';
import { PageHeader } from '@/components/ui';
import { StudentGradebook } from '@/features/gradebook';

export default function ChildReportCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div>
      <PageHeader title="Report Card" subtitle="Printable exam report cards" />
      <StudentGradebook studentId={id} reportCard />
    </div>
  );
}
