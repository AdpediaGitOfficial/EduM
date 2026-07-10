'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Spinner, EmptyState, Badge } from '@/components/ui';
import { ChildPicker, useChildren } from '@/features/misc';
import { StudentOverview } from '@/features/student-overview';

export default function ParentDashboard() {
  const { data: children, isLoading } = useChildren();
  const [childId, setChildId] = useState('');
  const active = childId || children?.[0]?.id || '';

  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Family Dashboard"
        subtitle="Performance, attendance and fees for your children"
        actions={<ChildPicker value={active} onChange={setChildId} />}
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(children ?? []).map((c) => (
          <button key={c.id} onClick={() => setChildId(c.id)} className="text-left">
            <Card className={`p-4 transition-colors ${active === c.id ? 'border-brand-400 ring-1 ring-brand-400' : 'hover:border-slate-300'}`}>
              <p className="font-semibold">{c.user.firstName} {c.user.lastName}</p>
              <p className="text-xs text-slate-400">{c.admissionNo}</p>
              <Badge tone="brand" className="mt-1">
                {c.section ? `${c.section.class.name}-${c.section.name}` : 'Unassigned'}
              </Badge>
              <div className="mt-2 flex gap-2 text-xs">
                <Link onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline" href={`/parent/children/${c.id}/academic`}>Academic</Link>
                <Link onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline" href={`/parent/children/${c.id}/attendance`}>Attendance</Link>
                <Link onClick={(e) => e.stopPropagation()} className="text-brand-600 hover:underline" href={`/parent/children/${c.id}/report-card`}>Report card</Link>
              </div>
            </Card>
          </button>
        ))}
      </div>
      {active ? <StudentOverview studentId={active} /> : <EmptyState title="No children linked to your account" />}
    </div>
  );
}
