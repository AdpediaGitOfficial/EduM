'use client';
import { Spinner } from '@/components/ui';
import { CalendarPage } from '@/features/misc';
import { useAuth } from '@/lib/auth';

export default function StudentCalendar() {
  const { user } = useAuth();
  if (!user?.studentId) return <Spinner />;
  return <CalendarPage studentId={user.studentId} />;
}
