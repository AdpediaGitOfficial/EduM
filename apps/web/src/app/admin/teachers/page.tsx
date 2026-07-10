'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { CrudPage } from '@/components/crud-page';
import { Badge } from '@/components/ui';

interface StaffRow {
  id: string;
  employeeNo: string;
  department: string | null;
  designation: string | null;
  qualifications: string | null;
  baseSalary: string;
  user: { firstName: string; lastName: string; email: string; role: string; status: string };
}

export default function AdminTeachersPage() {
  const router = useRouter();
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api<{ department: string; count: number }[]>('/staff/departments'),
  });

  return (
    <CrudPage<StaffRow>
      title="Teachers & Staff"
      subtitle="Profiles, departments, qualifications and subject allocation"
      endpoint="/staff"
      createLabel="Add staff"
      deleteMessage="Staff with payroll history are archived instead of deleted."
      filters={[
        ...(departments ? [{
          key: 'department', label: 'Department',
          options: departments.map((d) => ({ value: d.department, label: `${d.department} (${d.count})` })),
        }] : []),
        { key: 'role', label: 'Role', options: ['teacher', 'principal', 'vice_principal', 'hr', 'accountant'].map((r) => ({ value: r, label: r.replace('_', ' ') })) },
      ]}
      columns={[
        { key: 'employeeNo', header: 'Emp #', render: (s) => <span className="font-mono text-xs">{s.employeeNo}</span> },
        { key: 'name', header: 'Name', render: (s) => <span className="font-medium">{s.user.firstName} {s.user.lastName}</span> },
        { key: 'role', header: 'Role', render: (s) => <Badge tone="brand">{s.user.role.replace('_', ' ')}</Badge> },
        { key: 'department', header: 'Department', render: (s) => s.department ?? '—' },
        { key: 'designation', header: 'Designation', render: (s) => s.designation ?? '—' },
      ]}
      fields={[
        { name: 'firstName', label: 'First name', required: true, createOnly: true },
        { name: 'lastName', label: 'Last name', required: true, createOnly: true },
        { name: 'email', label: 'Email', type: 'email', required: true, createOnly: true },
        { name: 'role', label: 'Role', type: 'select', required: true, createOnly: true, options: ['teacher', 'hr', 'accountant', 'principal', 'vice_principal'].map((r) => ({ value: r, label: r.replace('_', ' ') })) },
        { name: 'department', label: 'Department' },
        { name: 'designation', label: 'Designation' },
        { name: 'qualifications', label: 'Qualifications' },
        { name: 'joinDate', label: 'Join date', type: 'date' },
        { name: 'baseSalary', label: 'Base salary (₹/month)', type: 'number' },
      ]}
      toFormValues={(s) => ({
        department: s.department ?? '', designation: s.designation ?? '',
        qualifications: s.qualifications ?? '', baseSalary: Number(s.baseSalary),
      })}
      onRowClick={(s) => router.push(`/admin/teachers/${s.id}`)}
    />
  );
}
