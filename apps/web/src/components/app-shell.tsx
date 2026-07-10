'use client';

/* App shell: role-based sidebar + topbar (global search, notifications, theme, user). */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  Bell, LogOut, Menu, Moon, Search, Sun, X, ChevronDown, KeyRound,
} from 'lucide-react';
import { api, Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fmtDateTime, initials } from '@/lib/utils';
import { navForRole } from './nav-config';
import { Badge, Button, Input, Modal, Field } from './ui';

function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();
  const { user } = useAuth();
  const canSearchStudents = user && user.role !== 'student';

  const { data } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => api<Paged<{ id: string; admissionNo: string; user: { firstName: string; lastName: string }; section?: { name: string; class: { name: string } } | null }>>(`/students?search=${encodeURIComponent(q)}&pageSize=6`),
    enabled: open && q.length >= 2 && !!canSearchStudents,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-400 hover:border-slate-300 sm:flex dark:border-slate-700"
      >
        <Search className="h-4 w-4" /> Search… <kbd className="rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800">⌘K</kbd>
      </button>
      <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 sm:hidden dark:hover:bg-slate-800">
        <Search className="h-4 w-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Search">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={canSearchStudents ? 'Search students by name or admission no…' : 'Search…'} />
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
          {data?.items.map((s) => (
            <button
              key={s.id}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => {
                setOpen(false);
                const base = user?.role === 'teacher' ? '/teacher/students' : '/admin/students';
                router.push(`${base}/${s.id}`);
              }}
            >
              <span>{s.user.firstName} {s.user.lastName}</span>
              <span className="text-xs text-slate-400">
                {s.admissionNo} {s.section ? `· ${s.section.class.name}-${s.section.name}` : ''}
              </span>
            </button>
          ))}
          {q.length >= 2 && data && data.items.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">No matches</p>
          )}
        </div>
      </Modal>
    </>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Paged<{ id: string; title: string; body: string; readAt: string | null; createdAt: string }> & { unread: number }>('/notifications?pageSize=12'),
    refetchInterval: 60_000,
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
        <Bell className="h-4 w-4" />
        {!!data?.unread && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[9px] font-bold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              className="text-xs text-brand-600 hover:underline"
              onClick={async () => {
                await api('/notifications/read-all', { method: 'POST' });
                qc.invalidateQueries({ queryKey: ['notifications'] });
              }}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {data?.items.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-400">No notifications</p>}
            {data?.items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.readAt) {
                    await api(`/notifications/${n.id}/read`, { method: 'POST' });
                    qc.invalidateQueries({ queryKey: ['notifications'] });
                  }
                }}
                className={cn(
                  'block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800',
                  !n.readAt && 'bg-brand-50/60 dark:bg-brand-900/20',
                )}
              >
                <p className="text-xs font-medium">{n.title}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{n.body}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg('');
          try {
            await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
            setMsg('Password changed.');
            setCurrent(''); setNext('');
          } catch (err) {
            setMsg((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="space-y-3"
      >
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password (min 8 chars)">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </Field>
        {msg && <p className={cn('text-sm', msg.includes('changed') ? 'text-ok-600' : 'text-danger-600')}>{msg}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button type="submit" loading={busy}>Update</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const sections = useMemo(() => (user ? navForRole(user.role) : []), [user]);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">E</div>
        <div>
          <p className="text-sm font-bold leading-tight">EduM</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-400">{user?.role.replace('_', ' ')}</p>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</p>}
            {s.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-brand-600 font-medium text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
        {sidebar}
      </aside>
      {/* mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl dark:bg-slate-900">
            <button className="absolute right-2 top-3 p-2" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-2">
            <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Toggle theme"
            >
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
            </button>
            <NotificationsBell />
            <div className="relative" ref={menuRef}>
              <button onClick={() => setUserMenu((o) => !o)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-200">
                  {initials(user?.firstName, user?.lastName)}
                </span>
                <span className="hidden text-sm font-medium sm:block">{user?.firstName}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              {userMenu && (
                <div className="absolute right-0 z-40 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-2.5 py-2 dark:border-slate-800">
                    <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                    <p className="truncate text-xs text-slate-400">{user?.email}</p>
                    <Badge tone="brand" className="mt-1">{user?.role.replace('_', ' ')}</Badge>
                  </div>
                  <button
                    onClick={() => { setPwOpen(true); setUserMenu(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Change password
                  </button>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
