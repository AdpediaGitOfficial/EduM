'use client';
import { PageHeader } from '@/components/ui';
import { SectionResults } from '@/features/gradebook';

export default function AdminGradebook() {
  return (
    <div>
      <PageHeader title="Gradebook" subtitle="Ranking, GPA and performance comparison per section" />
      <SectionResults canEnterMarks />
    </div>
  );
}
