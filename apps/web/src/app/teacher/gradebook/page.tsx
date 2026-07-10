'use client';
import { PageHeader } from '@/components/ui';
import { SectionResults } from '@/features/gradebook';

export default function TeacherGradebook() {
  return (
    <div>
      <PageHeader title="Gradebook" subtitle="Enter marks and review class ranking" />
      <SectionResults canEnterMarks />
    </div>
  );
}
