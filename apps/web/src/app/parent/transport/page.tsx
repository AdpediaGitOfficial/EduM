'use client';

import { useQuery } from '@tanstack/react-query';
import { Bus, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/utils';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui';

interface TransportInfo {
  studentId: string;
  name: string;
  stop: { name: string; pickupTime: string | null; dropTime: string | null } | null;
  route: { name: string; stops: { id: string; name: string; sequence: number; pickupTime: string | null }[] } | null;
  vehicle: { registration: string; driverName: string | null; driverPhone: string | null; lastLat: number | null; lastLng: number | null; lastPingAt: string | null } | null;
}

export default function ParentTransport() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-transport'],
    queryFn: () => api<TransportInfo[]>('/fleet/my-transport'),
  });
  if (isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Transport" subtitle="Bus routes and stops for your children" />
      {(data ?? []).length === 0 ? (
        <EmptyState title="No transport records" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data!.map((t) => (
            <Card key={t.studentId}>
              <CardHeader title={t.name} subtitle={t.route ? t.route.name : 'Not using school transport'} />
              {t.route ? (
                <div className="space-y-3 p-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Bus className="h-4 w-4 text-brand-600" />
                    <span className="font-medium">{t.vehicle?.registration ?? '—'}</span>
                    {t.vehicle?.driverName && (
                      <span className="text-xs text-slate-400">Driver: {t.vehicle.driverName} ({t.vehicle.driverPhone})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-ok-600" />
                    <span>{t.stop?.name}</span>
                    <Badge tone="ok">pickup {t.stop?.pickupTime}</Badge>
                    <Badge tone="warn">drop {t.stop?.dropTime}</Badge>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Route stops</p>
                    <ol className="space-y-1">
                      {t.route.stops.map((s) => (
                        <li key={s.id} className={`flex items-center gap-2 text-xs ${s.name === t.stop?.name ? 'font-bold text-brand-600' : 'text-slate-500'}`}>
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[9px] dark:bg-slate-800">{s.sequence}</span>
                          {s.name} {s.pickupTime && <span className="text-slate-400">({s.pickupTime})</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800">
                    {t.vehicle?.lastPingAt
                      ? `Last GPS ping: ${fmtDateTime(t.vehicle.lastPingAt)} (${t.vehicle.lastLat?.toFixed(4)}, ${t.vehicle.lastLng?.toFixed(4)})`
                      : 'Live GPS: endpoint contract ready — no tracking device connected yet.'}
                  </p>
                </div>
              ) : (
                <p className="p-4 text-sm text-slate-400">This child is not assigned to a route.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
