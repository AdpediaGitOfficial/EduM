'use client';

import { useRouter } from 'next/navigation';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { useSections, sectionLabel } from '@/features/pickers';

interface StudentRow {
  id: string;
  admissionNo: string;
  rollNo: number | null;
  status: string;
  user: { firstName: string; lastName: string; email: string };
  section: { id: string; name: string; class: { name: string } } | null;
}

export default function TeacherStudents() {
  const router = useRouter();
  const { data: sections } = useSections();
  return (
    <div>
      <PageHeader title="My Students" subtitle="Students in your assigned sections" />
      <DataTable<StudentRow>
        endpoint="/students"
        searchPlaceholder="Search name or admission no…"
        filters={sections ? [{
          key: 'sectionId', label: 'Section',
          options: sections.map((s) => ({ value: s.id, label: sectionLabel(s) })),
        }] : []}
        columns={[
          { key: 'rollNo', header: 'Roll', render: (r) => r.rollNo ?? '—' },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.user.firstName} {r.user.lastName}</span> },
          { key: 'admissionNo', header: 'Admission no' },
          { key: 'section', header: 'Section', render: (r) => r.section ? `${r.section.class.name}-${r.section.name}` : '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        onRowClick={(r) => router.push(`/teacher/students/${r.id}`)}
      />
    </div>
  );
}
