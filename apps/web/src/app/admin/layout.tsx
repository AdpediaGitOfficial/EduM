'use client';

import { AppShell } from '@/components/app-shell';
import { ADMIN_ROLES } from '@/components/nav-config';
import { Spinner } from '@/components/ui';
import { useRequireRole } from '@/lib/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { allowed, loading } = useRequireRole(ADMIN_ROLES);
  if (loading || !allowed) return <Spinner className="min-h-screen" />;
  return <AppShell>{children}</AppShell>;
}
