'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fuel, Plus, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader,
  Select, Spinner, StatusBadge, Tabs,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface Vehicle {
  id: string;
  registration: string;
  model: string | null;
  capacity: number;
  driverName: string | null;
  driverPhone: string | null;
  status: string;
  gpsDeviceId: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastPingAt: string | null;
  routes: { id: string; name: string }[];
}

interface Route {
  id: string;
  name: string;
  monthlyFee: string;
  vehicle: Vehicle | null;
  stops: { id: string; name: string; sequence: number; pickupTime: string | null; _count: { students: number } }[];
}

function VehiclesTab() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [logFor, setLogFor] = useState<{ vehicle: Vehicle; kind: 'maintenance' | 'fuel' } | null>(null);
  const [form, setForm] = useState({ registration: '', model: '', capacity: 40, driverName: '', driverPhone: '', gpsDeviceId: '' });
  const [log, setLog] = useState({ type: 'service', date: '', cost: '', notes: '', liters: '', odometer: '' });
  const [error, setError] = useState('');
  const refresh = () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); };

  const create = useMutation({
    mutationFn: () => api('/fleet/vehicles', { method: 'POST', body: { ...form, capacity: Number(form.capacity) } }),
    onSuccess: () => { setOpen(false); setError(''); refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const addLog = useMutation({
    mutationFn: () => {
      if (logFor!.kind === 'maintenance') {
        return api(`/fleet/vehicles/${logFor!.vehicle.id}/maintenance`, {
          method: 'POST',
          body: { type: log.type, date: log.date, cost: Number(log.cost || 0), notes: log.notes || undefined },
        });
      }
      return api(`/fleet/vehicles/${logFor!.vehicle.id}/fuel`, {
        method: 'POST',
        body: { date: log.date, liters: Number(log.liters), cost: Number(log.cost), odometer: log.odometer ? Number(log.odometer) : undefined },
      });
    },
    onSuccess: () => { setLogFor(null); setError(''); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Add vehicle</Button>
      </div>
      <DataTable<Vehicle>
        endpoint="/fleet/vehicles"
        refreshKey={refreshKey}
        searchPlaceholder="Search registration…"
        columns={[
          { key: 'registration', header: 'Vehicle', render: (v) => (
            <div>
              <p className="font-mono font-medium">{v.registration}</p>
              <p className="text-xs text-slate-400">{v.model ?? ''} · {v.capacity} seats</p>
            </div>
          ) },
          { key: 'driverName', header: 'Driver', render: (v) => (
            <div>
              <p>{v.driverName ?? '—'}</p>
              <p className="text-xs text-slate-400">{v.driverPhone ?? ''}</p>
            </div>
          ) },
          { key: 'routes', header: 'Routes', render: (v) => v.routes.map((r) => <Badge key={r.id} tone="brand" className="mr-1">{r.name}</Badge>) },
          { key: 'gps', header: 'GPS', render: (v) => v.lastPingAt
            ? <span className="text-xs text-ok-600">ping {fmtDateTime(v.lastPingAt)}</span>
            : <span className="text-xs text-slate-400">{v.gpsDeviceId ? 'device provisioned, no pings' : 'no device'}</span> },
          { key: 'status', header: 'Status', render: (v) => <StatusBadge status={v.status} /> },
        ]}
        actions={(v) => (
          <>
            <Button size="sm" variant="ghost" title="Log maintenance" onClick={() => { setLogFor({ vehicle: v, kind: 'maintenance' }); setError(''); }}>
              <Wrench className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Log fuel" onClick={() => { setLogFor({ vehicle: v, kind: 'fuel' }); setError(''); }}>
              <Fuel className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      />

      <Modal open={open} onClose={() => setOpen(false)} title="Add vehicle" wide>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Registration *"><Input value={form.registration} onChange={(e) => setForm((f) => ({ ...f, registration: e.target.value }))} placeholder="MH12-SB-1004" /></Field>
          <Field label="Model"><Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} /></Field>
          <Field label="Capacity"><Input type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} /></Field>
          <Field label="GPS device id"><Input value={form.gpsDeviceId} onChange={(e) => setForm((f) => ({ ...f, gpsDeviceId: e.target.value }))} placeholder="GPS-2003" /></Field>
          <Field label="Driver name"><Input value={form.driverName} onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))} /></Field>
          <Field label="Driver phone"><Input value={form.driverPhone} onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.registration} loading={create.isPending}>Add</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!logFor} onClose={() => setLogFor(null)} title={logFor?.kind === 'maintenance' ? `Maintenance — ${logFor?.vehicle.registration}` : `Fuel log — ${logFor?.vehicle.registration}`}>
        <div className="space-y-3">
          {logFor?.kind === 'maintenance' && (
            <Field label="Type">
              <Select value={log.type} onChange={(e) => setLog((l) => ({ ...l, type: e.target.value }))}>
                {['service', 'repair', 'inspection'].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *"><Input type="date" value={log.date} onChange={(e) => setLog((l) => ({ ...l, date: e.target.value }))} /></Field>
            <Field label="Cost (₹)"><Input type="number" value={log.cost} onChange={(e) => setLog((l) => ({ ...l, cost: e.target.value }))} /></Field>
          </div>
          {logFor?.kind === 'fuel' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Liters *"><Input type="number" value={log.liters} onChange={(e) => setLog((l) => ({ ...l, liters: e.target.value }))} /></Field>
              <Field label="Odometer"><Input type="number" value={log.odometer} onChange={(e) => setLog((l) => ({ ...l, odometer: e.target.value }))} /></Field>
            </div>
          )}
          {logFor?.kind === 'maintenance' && (
            <Field label="Notes"><Input value={log.notes} onChange={(e) => setLog((l) => ({ ...l, notes: e.target.value }))} /></Field>
          )}
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogFor(null)}>Cancel</Button>
            <Button onClick={() => addLog.mutate()} disabled={!log.date} loading={addLog.isPending}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RoutesTab() {
  const qc = useQueryClient();
  const { data: routes, isLoading } = useQuery({ queryKey: ['routes'], queryFn: () => api<Route[]>('/fleet/routes') });
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-picker'],
    queryFn: () => api<{ items: Vehicle[] }>('/fleet/vehicles?pageSize=100'),
  });
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeForm, setRouteForm] = useState({ name: '', vehicleId: '', monthlyFee: '' });
  const [stopFor, setStopFor] = useState<Route | null>(null);
  const [stopForm, setStopForm] = useState({ name: '', sequence: 1, pickupTime: '', dropTime: '' });
  const [error, setError] = useState('');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['routes'] });

  const createRoute = useMutation({
    mutationFn: () => api('/fleet/routes', {
      method: 'POST',
      body: { name: routeForm.name, vehicleId: routeForm.vehicleId || undefined, monthlyFee: routeForm.monthlyFee ? Number(routeForm.monthlyFee) : undefined },
    }),
    onSuccess: () => { setRouteOpen(false); setError(''); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });
  const addStop = useMutation({
    mutationFn: () => api(`/fleet/routes/${stopFor!.id}/stops`, {
      method: 'POST',
      body: { name: stopForm.name, sequence: Number(stopForm.sequence), pickupTime: stopForm.pickupTime || undefined, dropTime: stopForm.dropTime || undefined },
    }),
    onSuccess: () => { setStopFor(null); setError(''); invalidate(); },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setRouteOpen(true); setError(''); }}><Plus className="h-4 w-4" /> Add route</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(routes ?? []).map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              subtitle={`${r.vehicle?.registration ?? 'No vehicle'} · ${fmtMoney(r.monthlyFee)}/month`}
              actions={
                <Button size="sm" variant="secondary" onClick={() => {
                  setStopFor(r);
                  setStopForm({ name: '', sequence: r.stops.length + 1, pickupTime: '', dropTime: '' });
                  setError('');
                }}>
                  <Plus className="h-3.5 w-3.5" /> Stop
                </Button>
              }
            />
            <ol className="space-y-1 p-4">
              {r.stops.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] dark:bg-slate-800">{s.sequence}</span>
                    {s.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {s.pickupTime ?? ''} · {s._count.students} students
                  </span>
                </li>
              ))}
              {r.stops.length === 0 && <p className="text-sm text-slate-400">No stops yet</p>}
            </ol>
          </Card>
        ))}
      </div>

      <Modal open={routeOpen} onClose={() => setRouteOpen(false)} title="Add route">
        <div className="space-y-3">
          <Field label="Name *"><Input value={routeForm.name} onChange={(e) => setRouteForm((f) => ({ ...f, name: e.target.value }))} placeholder="West Loop" /></Field>
          <Field label="Vehicle">
            <Select value={routeForm.vehicleId} onChange={(e) => setRouteForm((f) => ({ ...f, vehicleId: e.target.value }))}>
              <option value="">Assign later…</option>
              {vehicles?.items.map((v) => <option key={v.id} value={v.id}>{v.registration}</option>)}
            </Select>
          </Field>
          <Field label="Monthly fee (₹)"><Input type="number" value={routeForm.monthlyFee} onChange={(e) => setRouteForm((f) => ({ ...f, monthlyFee: e.target.value }))} /></Field>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRouteOpen(false)}>Cancel</Button>
            <Button onClick={() => createRoute.mutate()} disabled={!routeForm.name} loading={createRoute.isPending}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!stopFor} onClose={() => setStopFor(null)} title={`Add stop — ${stopFor?.name}`}>
        <div className="space-y-3">
          <Field label="Stop name *"><Input value={stopForm.name} onChange={(e) => setStopForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sequence"><Input type="number" value={stopForm.sequence} onChange={(e) => setStopForm((f) => ({ ...f, sequence: Number(e.target.value) }))} /></Field>
            <Field label="Pickup"><Input type="time" value={stopForm.pickupTime} onChange={(e) => setStopForm((f) => ({ ...f, pickupTime: e.target.value }))} /></Field>
            <Field label="Drop"><Input type="time" value={stopForm.dropTime} onChange={(e) => setStopForm((f) => ({ ...f, dropTime: e.target.value }))} /></Field>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStopFor(null)}>Cancel</Button>
            <Button onClick={() => addStop.mutate()} disabled={!stopForm.name} loading={addStop.isPending}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MaintenanceTab() {
  const { data: vehicles } = useQuery({
    queryKey: ['vehicles-picker'],
    queryFn: () => api<{ items: Vehicle[] }>('/fleet/vehicles?pageSize=100'),
  });
  const [vehicleId, setVehicleId] = useState('');
  const maintenance = useQuery({
    queryKey: ['vehicle-maintenance', vehicleId],
    queryFn: () => api<{ id: string; type: string; date: string; cost: string; notes: string | null }[]>(`/fleet/vehicles/${vehicleId}/maintenance`),
    enabled: !!vehicleId,
  });
  const fuel = useQuery({
    queryKey: ['vehicle-fuel', vehicleId],
    queryFn: () => api<{ id: string; date: string; liters: string; cost: string; odometer: number | null }[]>(`/fleet/vehicles/${vehicleId}/fuel`),
    enabled: !!vehicleId,
  });

  return (
    <div className="space-y-4">
      <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-auto min-w-44">
        <option value="">Select vehicle…</option>
        {vehicles?.items.map((v) => <option key={v.id} value={v.id}>{v.registration}</option>)}
      </Select>
      {vehicleId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Maintenance history" />
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {(maintenance.data ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span><Badge>{m.type}</Badge> {m.notes ?? ''}</span>
                  <span className="text-xs text-slate-400">{fmtDate(m.date)} · {fmtMoney(m.cost)}</span>
                </div>
              ))}
              {maintenance.data?.length === 0 && <p className="p-4 text-sm text-slate-400">No records</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Fuel log" />
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {(fuel.data ?? []).map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{Number(f.liters)} L {f.odometer ? `· ${f.odometer} km` : ''}</span>
                  <span className="text-xs text-slate-400">{fmtDate(f.date)} · {fmtMoney(f.cost)}</span>
                </div>
              ))}
              {fuel.data?.length === 0 && <p className="p-4 text-sm text-slate-400">No records</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function AdminFleetPage() {
  const [tab, setTab] = useState('vehicles');
  return (
    <div>
      <PageHeader title="Fleet" subtitle="Vehicles, drivers, routes, stops, maintenance & fuel — GPS ingestion endpoint ready" />
      <Tabs
        tabs={[
          { key: 'vehicles', label: 'Vehicles & drivers' },
          { key: 'routes', label: 'Routes & stops' },
          { key: 'maintenance', label: 'Maintenance & fuel' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'maintenance' && <MaintenanceTab />}
    </div>
  );
}
