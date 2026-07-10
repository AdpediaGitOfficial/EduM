'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Paged } from '@/lib/api';
import { PageHeader, Select, EmptyState } from '@/components/ui';
import { StudentOverview } from '@/features/student-overview';
import { SectionPicker } from '@/features/pickers';

interface StudentLite {
  id: string;
  rollNo: number | null;
  user: { firstName: string; lastName: string };
}

export default function TeacherProgressHub() {
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const { data: students } = useQuery({
    queryKey: ['section-students', sectionId],
    queryFn: () => api<Paged<StudentLite>>(`/students?sectionId=${sectionId}&pageSize=100`),
    enabled: !!sectionId,
  });

  return (
    <div>
      <PageHeader
        title="Progress Hub"
        subtitle="Deep-dive into any student's progress, behavior and outcomes"
        actions={
          <div className="flex gap-2">
            <SectionPicker value={sectionId} onChange={(v) => { setSectionId(v); setStudentId(''); }} />
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="min-w-44" disabled={!sectionId}>
              <option value="">Select student…</option>
              {students?.items.map((s) => (
                <option key={s.id} value={s.id}>{s.user.firstName} {s.user.lastName}</option>
              ))}
            </Select>
          </div>
        }
      />
      {studentId ? <StudentOverview studentId={studentId} /> : <EmptyState title="Pick a section and a student" />}
    </div>
  );
}
