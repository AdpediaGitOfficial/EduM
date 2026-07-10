'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, History } from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { fmtDateTime } from '@/lib/utils';
import { CrudPage } from '@/components/crud-page';
import { Badge, Button, Modal, Spinner, StatusBadge, Tabs } from '@/components/ui';

interface UserRow {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
}

const ROLES = ['school_admin', 'principal', 'vice_principal', 'hr', 'accountant', 'teacher', 'parent', 'student'];

function UserDetailModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [tab, setTab] = useState('activity');
  const activity = useQuery({
    queryKey: ['user-activity', user.id],
    queryFn: () => api<Paged<{ id: string; action: string; module: string; createdAt: string }>>(`/users/${user.id}/activity?pageSize=20`),
    enabled: tab === 'activity',
  });
  const logins = useQuery({
    queryKey: ['user-logins', user.id],
    queryFn: () => api<Paged<{ id: string; ipAddress: string | null; success: boolean; createdAt: string; userAgent: string | null }>>(`/users/${user.id}/login-history?pageSize=20`),
    enabled: tab === 'logins',
  });

  return (
    <Modal open onClose={onClose} title={`${user.firstName} ${user.lastName}`} wide>
      <Tabs
        tabs={[{ key: 'activity', label: 'Activity log' }, { key: 'logins', label: 'Login history' }]}
        active={tab}
        onChange={setTab}
      />
      <div className="max-h-[50vh] overflow-y-auto">
        {tab === 'activity' && (
          activity.isLoading ? <Spinner /> : (
            <table className="w-full text-sm">
              <tbody>
                {(activity.data?.items ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2 font-mono text-xs">{a.action}</td>
                    <td className="py-2"><Badge>{a.module}</Badge></td>
                    <td className="py-2 text-right text-xs text-slate-400">{fmtDateTime(a.createdAt)}</td>
                  </tr>
                ))}
                {activity.data?.items.length === 0 && <tr><td className="py-4 text-center text-sm text-slate-400">No activity recorded</td></tr>}
              </tbody>
            </table>
          )
        )}
        {tab === 'logins' && (
          logins.isLoading ? <Spinner /> : (
            <table className="w-full text-sm">
              <tbody>
                {(logins.data?.items ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 dark:border-slate-800/50">
                    <td className="py-2"><StatusBadge status={l.success ? 'success' : 'failed'} /></td>
                    <td className="py-2 text-xs">{l.ipAddress ?? '—'}</td>
                    <td className="py-2 max-w-56 truncate text-xs text-slate-400">{l.userAgent ?? '—'}</td>
                    <td className="py-2 text-right text-xs text-slate-400">{fmtDateTime(l.createdAt)}</td>
                  </tr>
                ))}
                {logins.data?.items.length === 0 && <tr><td className="py-4 text-center text-sm text-slate-400">No logins recorded</td></tr>}
              </tbody>
            </table>
          )
        )}
      </div>
    </Modal>
  );
}

export default function AdminUsersPage() {
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const resetPw = useMutation({
    mutationFn: (id: string) => api<{ tempPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' }),
    onSuccess: (d) => setTempPw(d.tempPassword),
  });

  return (
    <>
      <CrudPage<UserRow>
        title="Users"
        subtitle="Invite users, assign roles, review activity"
        endpoint="/users"
        createLabel="Invite user"
        deleteMessage="The account will be archived and its sessions revoked."
        filters={[
          { key: 'role', label: 'Role', options: ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') })) },
          { key: 'status', label: 'Status', options: ['active', 'invited', 'suspended', 'archived'].map((s) => ({ value: s, label: s })) },
        ]}
        columns={[
          { key: 'name', header: 'Name', render: (u) => <span className="font-medium">{u.firstName} {u.lastName}</span> },
          { key: 'email', header: 'Email' },
          { key: 'role', header: 'Role', render: (u) => <Badge tone="brand">{u.role.replace('_', ' ')}</Badge> },
          { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
          { key: 'lastLoginAt', header: 'Last login', render: (u) => <span className="text-xs text-slate-400">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'never'}</span> },
        ]}
        fields={[
          { name: 'firstName', label: 'First name', required: true },
          { name: 'lastName', label: 'Last name', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true, createOnly: true },
          { name: 'role', label: 'Role', type: 'select', required: true, options: ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') })) },
          { name: 'phone', label: 'Phone' },
          { name: 'status', label: 'Status', type: 'select', editOnly: true, options: ['active', 'suspended', 'archived'].map((s) => ({ value: s, label: s })) },
        ]}
        toFormValues={(u) => ({ firstName: u.firstName, lastName: u.lastName, role: u.role, phone: u.phone ?? '', status: u.status })}
        extraRowActions={(row) => (
          <>
            <Button size="sm" variant="ghost" title="Activity & logins" onClick={() => setDetail(row)}>
              <History className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" title="Reset password" onClick={() => resetPw.mutate(row.id)}>
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      />
      {detail && <UserDetailModal user={detail} onClose={() => setDetail(null)} />}
      <Modal open={!!tempPw} onClose={() => setTempPw(null)} title="Temporary password">
        <p className="mb-2 text-sm">Share this temporary password with the user (they must change it at next login):</p>
        <p className="rounded-lg bg-slate-100 p-3 text-center font-mono text-lg dark:bg-slate-800">{tempPw}</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setTempPw(null)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}
