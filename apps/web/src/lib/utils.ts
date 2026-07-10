import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtMoney(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

/** status → token color mapping (green good / yellow pending / red bad) */
export const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  present: 'ok', paid: 'ok', success: 'ok', approved: 'ok', resolved: 'ok', active: 'ok',
  done: 'ok', graded: 'ok', submitted: 'ok', available: 'ok', returned: 'ok', positive: 'ok',
  pending: 'warn', partial: 'warn', leave: 'warn', late: 'warn', in_review: 'warn',
  in_progress: 'warn', maintenance: 'warn', issued: 'warn', draft: 'warn', half_day: 'warn',
  processed: 'warn', reserved: 'warn', borrowed: 'warn', invited: 'warn', todo: 'warn', open: 'warn',
  overdue: 'danger', absent: 'danger', failed: 'danger', rejected: 'danger', urgent: 'danger',
  escalated: 'danger', missed: 'danger', negative: 'danger', suspended: 'danger', lost: 'danger',
  cancelled: 'neutral', closed: 'neutral', archived: 'neutral', refunded: 'neutral',
  retired: 'neutral', disposed: 'neutral', alumni: 'neutral', withdrawn: 'neutral', transferred: 'neutral',
};
