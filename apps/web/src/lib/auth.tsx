'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setTokens } from './api';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  schoolId: string;
  staffId: string | null;
  studentId: string | null;
  mustChangePassword?: boolean;
  avatarUrl?: string | null;
}

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, login: async () => { throw new Error('no provider'); }, logout: async () => {} });

export function homeFor(role: string): string {
  switch (role) {
    case 'teacher': return '/teacher/dashboard';
    case 'parent': return '/parent/dashboard';
    case 'student': return '/student/dashboard';
    default: return '/admin/dashboard';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('edum.user') : null;
    if (cached) {
      try { setUser(JSON.parse(cached)); } catch { /* ignore */ }
    }
    const access = typeof window !== 'undefined' ? localStorage.getItem('edum.access') : null;
    if (!access) { setLoading(false); return; }
    api<Record<string, unknown>>('/auth/me')
      .then((me) => {
        const u: SessionUser = {
          id: me.id as string,
          email: me.email as string,
          role: me.role as string,
          firstName: me.firstName as string,
          lastName: me.lastName as string,
          schoolId: me.schoolId as string,
          staffId: (me.staff as { id?: string } | null)?.id ?? null,
          studentId: (me.student as { id?: string } | null)?.id ?? null,
          avatarUrl: (me.avatarUrl as string) ?? null,
        };
        setUser(u);
        localStorage.setItem('edum.user', JSON.stringify(u));
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    localStorage.setItem('edum.user', JSON.stringify(data.user));
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('edum.refresh');
    try { await api('/auth/logout', { method: 'POST', body: { refreshToken: refresh } }); } catch { /* ignore */ }
    setTokens(null, null);
    localStorage.removeItem('edum.user');
    setUser(null);
    window.location.href = '/auth/login';
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}

/** client-side role gate for a portal segment (UX only — API is the boundary) */
export function useRequireRole(roles: string[]) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/auth/login');
    else if (!roles.includes(user.role)) router.replace(homeFor(user.role));
  }, [user, loading, roles, router]);
  return { user, loading, allowed: !!user && roles.includes(user.role) };
}
