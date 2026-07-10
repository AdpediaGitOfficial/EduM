'use client';

/* Announcements feed + composer with targeting (school/role/class/individual). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader,
  Select, Spinner, Textarea,
} from '@/components/ui';
import { SectionPicker } from './pickers';
import { useAuth } from '@/lib/auth';

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  targetRole: string | null;
  pinned: boolean;
  publishedAt: string;
  author: { firstName: string; lastName: string; role: string };
}

export function AnnouncementsFeed({ canCompose, canDelete }: { canCompose: boolean; canDelete?: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'school', targetRole: '', targetSectionId: '', targetUserEmail: '', pinned: false, notify: false });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['announcements', page],
    queryFn: () => api<Paged<Announcement>>(`/announcements?page=${page}&pageSize=10`),
  });

  const create = useMutation({
    mutationFn: async () => {
      let targetUserId: string | undefined;
      if (form.audience === 'individual' && form.targetUserEmail) {
        const res = await api<Paged<{ id: string }>>(`/users?search=${encodeURIComponent(form.targetUserEmail)}&pageSize=1`);
        if (!res.items[0]) throw new Error('No user found for that email/name');
        targetUserId = res.items[0].id;
      }
      return api('/announcements', {
        method: 'POST',
        body: {
          title: form.title, body: form.body, audience: form.audience,
          targetRole: form.audience === 'role' ? form.targetRole : undefined,
          targetSectionId: form.audience === 'class_section' ? form.targetSectionId : undefined,
          targetUserId,
          pinned: form.pinned, notify: form.notify,
        },
      });
    },
    onSuccess: () => {
      setComposeOpen(false); setError('');
      setForm({ title: '', body: '', audience: 'school', targetRole: '', targetSectionId: '', targetUserEmail: '', pinned: false, notify: false });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Notice board & school-wide updates"
        actions={canCompose && (
          <Button onClick={() => setComposeOpen(true)}><Plus className="h-4 w-4" /> Compose</Button>
        )}
      />
      {isLoading ? (
        <Spinner />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState title="No announcements" />
      ) : (
        <div className="space-y-3">
          {data!.items.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/40">
                    {a.pinned ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="font-semibold">{a.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.body}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {a.author.firstName} {a.author.lastName} · {fmtDate(a.publishedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={a.audience === 'school' ? 'brand' : 'neutral'}>
                    {a.audience === 'role' ? `${a.targetRole}s` : a.audience.replace('_', ' ')}
                  </Badge>
                  {(canDelete || (canCompose && user?.role === 'teacher')) && (
                    <button onClick={() => remove.mutate(a.id)} className="rounded p-1 text-slate-300 hover:text-danger-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Compose announcement" wide>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
          <Field label="Title *"><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required /></Field>
          <Field label="Message *"><Textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Audience">
              <Select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
                <option value="school">Whole school</option>
                <option value="role">By role</option>
                <option value="class_section">Class section</option>
                <option value="individual">Individual</option>
              </Select>
            </Field>
            {form.audience === 'role' && (
              <Field label="Target role">
                <Select value={form.targetRole} onChange={(e) => setForm((f) => ({ ...f, targetRole: e.target.value }))}>
                  <option value="">Select…</option>
                  {['teacher', 'parent', 'student', 'hr', 'accountant'].map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            )}
            {form.audience === 'class_section' && (
              <Field label="Section">
                <SectionPicker value={form.targetSectionId} onChange={(v) => setForm((f) => ({ ...f, targetSectionId: v }))} />
              </Field>
            )}
            {form.audience === 'individual' && (
              <Field label="User (search by name/email)">
                <Input value={form.targetUserEmail} onChange={(e) => setForm((f) => ({ ...f, targetUserEmail: e.target.value }))} placeholder="name or email" />
              </Field>
            )}
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
              Pin to top
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} />
              Also send email (mock provider)
            </label>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Publish</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
