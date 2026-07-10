'use client';

import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useRequireRole } from '@/lib/auth';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { allowed, loading } = useRequireRole(['parent']);
  if (loading || !allowed) return <Spinner className="min-h-screen" />;
  return <AppShell>{children}</AppShell>;
}
