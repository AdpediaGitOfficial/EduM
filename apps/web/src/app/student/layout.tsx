'use client';

import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useRequireRole } from '@/lib/auth';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { allowed, loading } = useRequireRole(['student']);
  if (loading || !allowed) return <Spinner className="min-h-screen" />;
  return <AppShell>{children}</AppShell>;
}
