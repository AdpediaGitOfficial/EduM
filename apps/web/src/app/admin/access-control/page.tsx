'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, ConfirmDialog, Field, Input, Modal,
  PageHeader, Select, Spinner, StatusBadge, Tabs,
} from '@/components/ui';
import { DataTable } from '@/components/data-table';

interface Matrix {
  roles: string[];
  modules: string[];
  actions: string[];
  permissions: { role: string; module: string; action: string; scope: string | null }[];
}

function MatrixTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rbac-matrix'], queryFn: () => api<Matrix>('/access-control/matrix') });
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const [role, setRole] = useState('teacher');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [error, setError] = useState('');

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.permissions ?? []) set.add(`${p.role}:${p.module}:${p.action}`);
    return set;
  }, [data]);

  const scopes = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data?.permissions ?? []) if (p.scope) m.set(`${p.role}:${p.module}:${p.action}`, p.scope);
    return m;
  }, [data]);

  const isChecked = (key: string) => changes.get(key) ?? granted.has(key);

  const save = useMutation({
    mutationFn: () => api('/access-control/matrix', {
      method: 'PUT',
      body: {
        changes: Array.from(changes.entries()).map(([key, grantedFlag]) => {
          const [r, module, action] = key.split(':');
          return { role: r, module, action, granted: grantedFlag, scope: scopes.get(key) ?? undefined };
        }),
      },
    }),
    onSuccess: () => { setChanges(new Map()); setError(''); qc.invalidateQueries({ queryKey: ['rbac-matrix'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const reset = useMutation({
    mutationFn: () => api('/access-control/matrix/reset', { method: 'POST' }),
    onSuccess: () => { setChanges(new Map()); qc.invalidateQueries({ queryKey: ['rbac-matrix'] }); },
  });

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto">
          {data.roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </Select>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => setResetConfirm(true)}>
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Button>
        <Button onClick={() => save.mutate()} disabled={changes.size === 0} loading={save.isPending}>
          <Save className="h-4 w-4" /> Save {changes.size > 0 && `(${changes.size})`}
        </Button>
      </div>
      {error && <p className="text-sm text-danger-600">{error}</p>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Module</th>
                {data.actions.map((a) => <th key={a} className="px-3 py-2 text-center">{a}</th>)}
                <th className="px-3 py-2">Scope</th>
              </tr>
            </thead>
            <tbody>
              {data.modules.map((m) => {
                const scope = data.actions.map((a) => scopes.get(`${role}:${m}:${a}`)).find(Boolean);
                return (
                  <tr key={m} className="border-t border-slate-50 dark:border-slate-800/50">
                    <td className="px-4 py-2 font-medium">{m.replace('_', ' ')}</td>
                    {data.actions.map((a) => {
                      const key = `${role}:${m}:${a}`;
                      return (
                        <td key={a} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand-600"
                            checked={isChecked(key)}
                            onChange={(e) => {
                              setChanges((c) => {
                                const next = new Map(c);
                                if (e.target.checked === granted.has(key)) next.delete(key);
                                else next.set(key, e.target.checked);
                                return next;
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">{scope && <Badge tone="warn">{scope}</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-400">
        Scoped permissions (own_class, own_child, self…) are enforced in the API service layer; unchecking removes the grant entirely.
      </p>
      <ConfirmDialog
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={() => reset.mutate()}
        title="Reset permission matrix?"
        message="All customizations will be replaced with the built-in default matrix."
        confirmLabel="Reset"
        danger
      />
    </div>
  );
}

interface AuditRow {
  id: string;
  action: string;
  module: string;
  entityId: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; role: string; email: string } | null;
}

function AuditTab() {
  return (
    <DataTable<AuditRow>
      endpoint="/access-control/audit-logs"
      searchPlaceholder="Search action (e.g. user.create)…"
      columns={[
        { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(r.createdAt)}</span> },
        { key: 'user', header: 'Actor', render: (r) => r.user ? `${r.user.firstName} ${r.user.lastName}` : 'system' },
        { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
        { key: 'module', header: 'Module', render: (r) => <Badge>{r.module}</Badge> },
        { key: 'entityId', header: 'Entity', render: (r) => <span className="font-mono text-[10px] text-slate-400">{r.entityId?.slice(0, 8) ?? '—'}</span> },
      ]}
    />
  );
}

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  user: { firstName: string; lastName: string; email: string; role: string };
}

function SessionsTab() {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/access-control/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); },
  });
  return (
    <DataTable<SessionRow>
      endpoint="/access-control/sessions"
      refreshKey={refreshKey}
      columns={[
        { key: 'user', header: 'User', render: (s) => (
          <div>
            <p className="font-medium">{s.user.firstName} {s.user.lastName}</p>
            <p className="text-xs text-slate-400">{s.user.email}</p>
          </div>
        ) },
        { key: 'role', header: 'Role', render: (s) => <Badge tone="brand">{s.user.role.replace('_', ' ')}</Badge> },
        { key: 'ipAddress', header: 'IP', render: (s) => <span className="font-mono text-xs">{s.ipAddress ?? '—'}</span> },
        { key: 'createdAt', header: 'Started', render: (s) => <span className="text-xs text-slate-400">{fmtDateTime(s.createdAt)}</span> },
        { key: 'expiresAt', header: 'Expires', render: (s) => <span className="text-xs text-slate-400">{fmtDateTime(s.expiresAt)}</span> },
      ]}
      actions={(s) => (
        <Button size="sm" variant="danger" onClick={() => revoke.mutate(s.id)}>Revoke</Button>
      )}
    />
  );
}

function IpTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ip-allowlist'],
    queryFn: () => api<{ id: string; cidr: string; label: string | null; active: boolean; createdAt: string }[]>('/access-control/ip-allowlist'),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cidr: '', label: '' });
  const add = useMutation({
    mutationFn: () => api('/access-control/ip-allowlist', { method: 'POST', body: form }),
    onSuccess: () => { setOpen(false); setForm({ cidr: '', label: '' }); qc.invalidateQueries({ queryKey: ['ip-allowlist'] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/access-control/ip-allowlist/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ip-allowlist'] }),
  });

  if (isLoading) return <Spinner />;
  return (
    <Card>
      <CardHeader
        title="IP allowlist"
        subtitle="Restrict portal access to trusted networks (advisory list — enforcement is a deploy-time reverse-proxy concern)"
        actions={<Button size="sm" onClick={() => setOpen(true)}>Add entry</Button>}
      />
      <table className="w-full text-sm">
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id} className="border-b border-slate-50 dark:border-slate-800/50">
              <td className="px-4 py-2 font-mono">{e.cidr}</td>
              <td className="px-4 py-2">{e.label ?? '—'}</td>
              <td className="px-4 py-2"><StatusBadge status={e.active ? 'active' : 'cancelled'} /></td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => remove.mutate(e.id)} className="rounded p-1 text-slate-300 hover:text-danger-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td className="p-4 text-sm text-slate-400">No restrictions — access allowed from anywhere.</td></tr>
          )}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="Add IP range">
        <div className="space-y-3">
          <Field label="CIDR"><Input value={form.cidr} onChange={(e) => setForm((f) => ({ ...f, cidr: e.target.value }))} placeholder="203.0.113.0/24" /></Field>
          <Field label="Label"><Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="School campus" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => add.mutate()} disabled={!form.cidr} loading={add.isPending}>Add</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default function AccessControlPage() {
  const [tab, setTab] = useState('matrix');
  return (
    <div>
      <PageHeader title="Access Control" subtitle="RBAC matrix, audit trail, live sessions and IP restrictions" />
      <Tabs
        tabs={[
          { key: 'matrix', label: 'Permission matrix' },
          { key: 'audit', label: 'Audit logs' },
          { key: 'sessions', label: 'Sessions' },
          { key: 'ip', label: 'IP restrictions' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'matrix' && <MatrixTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'ip' && <IpTab />}
    </div>
  );
}
