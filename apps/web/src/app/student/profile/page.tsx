'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';
import { Badge, Card, CardHeader, PageHeader, Spinner, StatusBadge } from '@/components/ui';

interface StudentProfile {
  id: string;
  admissionNo: string;
  rollNo: number | null;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  address: string | null;
  admissionDate: string;
  status: string;
  hostel: boolean;
  user: { firstName: string; lastName: string; email: string; phone: string | null };
  section: { name: string; class: { name: string } } | null;
  guardians: { id: string; relation: string; isPrimary: boolean; user: { firstName: string; lastName: string; email: string; phone: string | null } }[];
  medical: { allergies: string | null; conditions: string | null; emergencyName: string | null; emergencyPhone: string | null } | null;
  certificates: { id: string; type: string; serialNo: string; issuedAt: string }[];
  routeStop: { name: string; pickupTime: string | null; route: { name: string; vehicle: { registration: string } | null } } | null;
}

export default function StudentProfilePage() {
  const { user } = useAuth();
  const { data: s, isLoading } = useQuery({
    queryKey: ['my-profile', user?.studentId],
    queryFn: () => api<StudentProfile>(`/students/${user?.studentId}`),
    enabled: !!user?.studentId,
  });

  if (isLoading || !s) return <Spinner />;

  return (
    <div>
      <PageHeader title="My Profile" subtitle={`${s.admissionNo} · ${s.section ? `${s.section.class.name}-${s.section.name}` : ''}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <div className="space-y-1.5 p-4 text-sm">
            <p><span className="text-slate-400">Name:</span> {s.user.firstName} {s.user.lastName}</p>
            <p><span className="text-slate-400">Email:</span> {s.user.email}</p>
            <p><span className="text-slate-400">Date of birth:</span> {fmtDate(s.dob)}</p>
            <p><span className="text-slate-400">Gender:</span> {s.gender ?? '—'}</p>
            <p><span className="text-slate-400">Blood group:</span> {s.bloodGroup ?? '—'}</p>
            <p><span className="text-slate-400">Address:</span> {s.address ?? '—'}</p>
            <p><span className="text-slate-400">Admitted:</span> {fmtDate(s.admissionDate)}</p>
            <p><span className="text-slate-400">Status:</span> <StatusBadge status={s.status} /></p>
            {s.hostel && <Badge tone="brand">Hostel resident</Badge>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Guardians" />
          <div className="divide-y divide-slate-50 p-2 dark:divide-slate-800/50">
            {s.guardians.map((g) => (
              <div key={g.id} className="flex items-center justify-between px-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{g.user.firstName} {g.user.lastName}</p>
                  <p className="text-xs text-slate-400">{g.user.email} {g.user.phone ? `· ${g.user.phone}` : ''}</p>
                </div>
                <Badge tone={g.isPrimary ? 'brand' : 'neutral'}>{g.relation}{g.isPrimary ? ' · primary' : ''}</Badge>
              </div>
            ))}
          </div>
        </Card>
        {s.routeStop && (
          <Card>
            <CardHeader title="Transport" />
            <div className="space-y-1.5 p-4 text-sm">
              <p><span className="text-slate-400">Route:</span> {s.routeStop.route.name}</p>
              <p><span className="text-slate-400">Stop:</span> {s.routeStop.name}</p>
              <p><span className="text-slate-400">Pickup:</span> {s.routeStop.pickupTime ?? '—'}</p>
              <p><span className="text-slate-400">Bus:</span> {s.routeStop.route.vehicle?.registration ?? '—'}</p>
            </div>
          </Card>
        )}
        {s.certificates.length > 0 && (
          <Card>
            <CardHeader title="Certificates" />
            <div className="divide-y divide-slate-50 p-2 dark:divide-slate-800/50">
              {s.certificates.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-2 py-2.5 text-sm">
                  <span className="font-medium capitalize">{c.type}</span>
                  <span className="text-xs text-slate-400">{c.serialNo} · {fmtDate(c.issuedAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
