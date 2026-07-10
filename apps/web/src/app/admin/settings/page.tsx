'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, Field, Input, Modal, PageHeader,
  Spinner, StatusBadge, Tabs, Textarea,
} from '@/components/ui';

interface School {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  brandColor: string | null;
  settings: Record<string, unknown>;
}

function SchoolProfileTab() {
  const qc = useQueryClient();
  const { data: school, isLoading } = useQuery({ queryKey: ['school'], queryFn: () => api<School>('/settings/school') });
  const [form, setForm] = useState<Partial<School>>({});
  const [msg, setMsg] = useState('');
  useEffect(() => { if (school) setForm(school); }, [school]);
  const save = useMutation({
    mutationFn: () => api('/settings/school', {
      method: 'PATCH',
      body: {
        name: form.name, address: form.address, phone: form.phone,
        email: form.email, website: form.website, brandColor: form.brandColor,
      },
    }),
    onSuccess: () => { setMsg('Saved.'); qc.invalidateQueries({ queryKey: ['school'] }); },
    onError: (e: Error) => setMsg(e.message),
  });

  if (isLoading || !school) return <Spinner />;
  return (
    <Card>
      <CardHeader title="School profile & branding" subtitle={`Code: ${school.code}`} />
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Field label="School name"><Input value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Email"><Input value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label="Phone"><Input value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="Website"><Input value={form.website ?? ''} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></Field>
        <div className="sm:col-span-2">
          <Field label="Address"><Textarea rows={2} value={form.address ?? ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></Field>
        </div>
        <Field label="Brand color">
          <div className="flex items-center gap-2">
            <input type="color" value={form.brandColor ?? '#2563eb'} onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))} className="h-9 w-14 rounded border border-slate-200 dark:border-slate-700" />
            <span className="font-mono text-sm">{form.brandColor}</span>
          </div>
        </Field>
        <div className="flex items-end justify-end gap-3 sm:col-span-1">
          {msg && <span className={msg === 'Saved.' ? 'text-sm text-ok-600' : 'text-sm text-danger-600'}>{msg}</span>}
          <Button onClick={() => save.mutate()} loading={save.isPending}>Save profile</Button>
        </div>
      </div>
    </Card>
  );
}

interface Year {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  terms: { id: string; name: string; startDate: string; endDate: string }[];
}

function AcademicYearsTab() {
  const qc = useQueryClient();
  const { data: years, isLoading } = useQuery({ queryKey: ['academic-years'], queryFn: () => api<Year[]>('/settings/academic-years') });
  const [yearOpen, setYearOpen] = useState(false);
  const [yearForm, setYearForm] = useState({ name: '', startDate: '', endDate: '', isActive: false });
  const [termFor, setTermFor] = useState<Year | null>(null);
  const [termForm, setTermForm] = useState({ name: '', startDate: '', endDate: '' });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['academic-years'] });

  const createYear = useMutation({
    mutationFn: () => api('/settings/academic-years', { method: 'POST', body: yearForm }),
    onSuccess: () => { setYearOpen(false); invalidate(); },
  });
  const activate = useMutation({
    mutationFn: (id: string) => api(`/settings/academic-years/${id}`, { method: 'PATCH', body: { isActive: true } }),
    onSuccess: invalidate,
  });
  const addTerm = useMutation({
    mutationFn: () => api(`/settings/academic-years/${termFor!.id}/terms`, { method: 'POST', body: termForm }),
    onSuccess: () => { setTermFor(null); invalidate(); },
  });
  const deleteTerm = useMutation({
    mutationFn: (id: string) => api(`/settings/terms/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setYearOpen(true)}><Plus className="h-4 w-4" /> New academic year</Button>
      </div>
      {(years ?? []).map((y) => (
        <Card key={y.id}>
          <CardHeader
            title={y.name}
            subtitle={`${fmtDate(y.startDate)} → ${fmtDate(y.endDate)}`}
            actions={
              <div className="flex items-center gap-2">
                {y.isActive ? <Badge tone="ok">active</Badge> : (
                  <Button size="sm" variant="secondary" onClick={() => activate.mutate(y.id)}>Set active</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => { setTermFor(y); setTermForm({ name: `Term ${y.terms.length + 1}`, startDate: '', endDate: '' }); }}>
                  <Plus className="h-3.5 w-3.5" /> Term
                </Button>
              </div>
            }
          />
          <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
            {y.terms.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="font-medium">{t.name}</span>
                <span className="flex items-center gap-3 text-xs text-slate-400">
                  {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                  <button onClick={() => deleteTerm.mutate(t.id)} className="rounded p-0.5 text-slate-300 hover:text-danger-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Modal open={yearOpen} onClose={() => setYearOpen(false)} title="New academic year">
        <div className="space-y-3">
          <Field label="Name (e.g. 2027-28)"><Input value={yearForm.name} onChange={(e) => setYearForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="date" value={yearForm.startDate} onChange={(e) => setYearForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
            <Field label="End"><Input type="date" value={yearForm.endDate} onChange={(e) => setYearForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={yearForm.isActive} onChange={(e) => setYearForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Make this the active year
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setYearOpen(false)}>Cancel</Button>
            <Button onClick={() => createYear.mutate()} disabled={!yearForm.name || !yearForm.startDate || !yearForm.endDate} loading={createYear.isPending}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!termFor} onClose={() => setTermFor(null)} title={`Add term — ${termFor?.name}`}>
        <div className="space-y-3">
          <Field label="Name"><Input value={termForm.name} onChange={(e) => setTermForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><Input type="date" value={termForm.startDate} onChange={(e) => setTermForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
            <Field label="End"><Input type="date" value={termForm.endDate} onChange={(e) => setTermForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTermFor(null)}>Cancel</Button>
            <Button onClick={() => addTerm.mutate()} disabled={!termForm.startDate || !termForm.endDate} loading={addTerm.isPending}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function IntegrationsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api<Record<string, { provider?: string; mock?: boolean; endpoint?: string }>>('/settings/integrations'),
  });
  if (isLoading || !data) return <Spinner />;
  const rows = [
    { key: 'email', label: 'Email provider', hint: 'Swap via NOTIFY_EMAIL_PROVIDER env' },
    { key: 'sms', label: 'SMS provider', hint: 'Swap via NOTIFY_SMS_PROVIDER env' },
    { key: 'paymentGateway', label: 'Payment gateway', hint: 'Swap via PAYMENT_GATEWAY env (mock = sandbox auto-approve)' },
    { key: 'storage', label: 'File storage (S3/MinIO)', hint: 'S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY' },
  ];
  return (
    <Card>
      <CardHeader title="Integrations" subtitle="Provider interfaces are wired to mocks by default — swap providers with env vars, no code changes" />
      <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
        {rows.map((r) => {
          const v = data[r.key] ?? {};
          return (
            <div key={r.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{r.label}</p>
                <p className="text-xs text-slate-400">{r.hint}</p>
              </div>
              {'mock' in v ? (
                <StatusBadge status={v.mock ? 'pending' : 'active'} />
              ) : (
                <Badge tone={v.endpoint === 'configured' ? 'ok' : 'warn'}>{v.endpoint}</Badge>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-4 pb-4 text-xs text-slate-400">
        <StatusBadge status="pending" /> = mock provider active (works offline, nothing actually delivered externally).
      </p>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('profile');
  return (
    <div>
      <PageHeader title="Settings" subtitle="School profile, academic years, grading and integrations" />
      <Tabs
        tabs={[
          { key: 'profile', label: 'School profile' },
          { key: 'years', label: 'Academic years & terms' },
          { key: 'integrations', label: 'Integrations' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'profile' && <SchoolProfileTab />}
      {tab === 'years' && <AcademicYearsTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </div>
  );
}
