'use client';

/* Shared small features: settings page, calendar, child picker, fees view. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { CreditCard, Download } from 'lucide-react';
import { api, apiDownload, Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fmtDate, fmtMoney } from '@/lib/utils';
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal,
  PageHeader, Select, Spinner, StatusBadge,
} from '@/components/ui';

// ── shared personal settings page (teacher/parent/student) ──
export function PersonalSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const change = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => { setMsg('Password updated.'); setCurrent(''); setNext(''); },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your account preferences" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <div className="space-y-2 p-4 text-sm">
            <p><span className="text-slate-400">Name:</span> {user?.firstName} {user?.lastName}</p>
            <p><span className="text-slate-400">Email:</span> {user?.email}</p>
            <p><span className="text-slate-400">Role:</span> <Badge tone="brand">{user?.role.replace('_', ' ')}</Badge></p>
          </div>
        </Card>
        <Card>
          <CardHeader title="Appearance" />
          <div className="flex items-center gap-3 p-4">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <Button key={t} variant={theme === t ? 'primary' : 'secondary'} size="sm" onClick={() => setTheme(t)}>
                {t}
              </Button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <form
            onSubmit={(e) => { e.preventDefault(); setMsg(''); change.mutate(); }}
            className="space-y-3 p-4"
          >
            <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
            <Field label="New password (min 8 chars)"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required /></Field>
            {msg && <p className={cn('text-sm', msg.includes('updated') ? 'text-ok-600' : 'text-danger-600')}>{msg}</p>}
            <Button type="submit" loading={change.isPending}>Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ── parent child picker ──
export interface Child {
  id: string;
  admissionNo: string;
  user: { firstName: string; lastName: string };
  section: { id: string; name: string; class: { name: string } } | null;
}

export function useChildren() {
  return useQuery({ queryKey: ['my-children'], queryFn: () => api<Child[]>('/students/my-children') });
}

export function ChildPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useChildren();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-48">
      <option value="">Select child…</option>
      {data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.user.firstName} {c.user.lastName} {c.section ? `(${c.section.class.name}-${c.section.name})` : ''}
        </option>
      ))}
    </Select>
  );
}

// ── calendar (month grid: homework due, exams, announcements) ──
export function CalendarPage({ studentId }: { studentId?: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const hw = useQuery({
    queryKey: ['cal-homework', studentId],
    queryFn: () => api<{ upcoming: { homework: { title: string; dueDate: string } }[]; today: { homework: { title: string; dueDate: string } }[]; overdue: { homework: { title: string; dueDate: string } }[] }>(`/homework/student/${studentId}`),
    enabled: !!studentId,
  });
  const exams = useQuery({
    queryKey: ['cal-exams'],
    queryFn: () => api<{ id: string; name: string; startDate: string; endDate: string }[]>('/exams'),
  });
  const anns = useQuery({
    queryKey: ['cal-announcements'],
    queryFn: () => api<Paged<{ id: string; title: string; publishedAt: string }>>('/announcements?pageSize=50'),
  });

  const events = useMemo(() => {
    const map = new Map<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'brand' }[]>();
    const push = (dateStr: string, label: string, tone: 'ok' | 'warn' | 'danger' | 'brand') => {
      const key = dateStr.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push({ label, tone });
      map.set(key, list);
    };
    for (const bucket of [hw.data?.today, hw.data?.upcoming, hw.data?.overdue]) {
      for (const s of bucket ?? []) push(s.homework.dueDate, `HW: ${s.homework.title}`, 'warn');
    }
    for (const e of exams.data ?? []) push(e.startDate, `Exam: ${e.name}`, 'danger');
    for (const a of anns.data?.items ?? []) push(a.publishedAt, a.title, 'brand');
    return map;
  }, [hw.data, exams.data, anns.data]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Homework due dates, exams and announcements"
        actions={<Input type="month" className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />}
      />
      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            const key = day ? `${month}-${String(day).padStart(2, '0')}` : '';
            const dayEvents = day ? events.get(key) ?? [] : [];
            const isToday = key === new Date().toISOString().slice(0, 10);
            return (
              <div
                key={i}
                className={cn(
                  'min-h-20 rounded-lg border p-1 text-xs',
                  day ? 'border-slate-100 dark:border-slate-800' : 'border-transparent',
                  isToday && 'border-brand-400 bg-brand-50/50 dark:bg-brand-900/10',
                )}
              >
                {day && (
                  <>
                    <span className={cn('font-semibold', isToday && 'text-brand-600')}>{day}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map((e, j) => (
                        <p key={j} title={e.label} className={cn(
                          'truncate rounded px-1 py-px text-[10px]',
                          e.tone === 'warn' && 'bg-warn-100 text-warn-700 dark:bg-warn-700/20',
                          e.tone === 'danger' && 'bg-danger-100 text-danger-700 dark:bg-danger-700/20',
                          e.tone === 'brand' && 'bg-brand-100 text-brand-700 dark:bg-brand-700/20',
                          e.tone === 'ok' && 'bg-ok-100 text-ok-700 dark:bg-ok-700/20',
                        )}>{e.label}</p>
                      ))}
                      {dayEvents.length > 3 && <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── fees & payments (parent/student read + parent pay) ──
interface Invoice {
  id: string;
  invoiceNo: string;
  status: string;
  dueDate: string;
  totalAmount: string;
  discount: string;
  lateFee: string;
  paidAmount: number;
  dueAmount: number;
  student: { id: string; user: { firstName: string; lastName: string } };
  items: { id: string; description: string; amount: string }[];
}

export function FamilyFees({ canPay }: { canPay: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['family-invoices'],
    queryFn: () => api<Paged<Invoice> & { totals: { invoiced: number } }>('/fees/invoices?pageSize=50'),
  });
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [step, setStep] = useState<'review' | 'processing' | 'done'>('review');
  const [error, setError] = useState('');

  const pay = useMutation({
    mutationFn: async () => {
      setStep('processing');
      const checkout = await api<{ paymentId: string; orderId: string }>('/payments/checkout', {
        method: 'POST',
        body: { invoiceId: paying!.id },
      });
      // sandbox gateway: confirm immediately (simulates gateway redirect + webhook)
      await api(`/payments/checkout/${checkout.paymentId}/confirm`, { method: 'POST', body: {} });
    },
    onSuccess: () => { setStep('done'); qc.invalidateQueries(); },
    onError: (e: Error) => { setError(e.message); setStep('review'); },
  });

  if (isLoading) return <Spinner />;
  const invoices = data?.items ?? [];
  const outstanding = invoices.reduce((a, i) => a + i.dueAmount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-400">Total invoiced</p>
          <p className="text-xl font-bold">{fmtMoney(data?.totals.invoiced)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-400">Paid</p>
          <p className="text-xl font-bold text-ok-600">{fmtMoney(invoices.reduce((a, i) => a + i.paidAmount, 0))}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-400">Outstanding</p>
          <p className={cn('text-xl font-bold', outstanding > 0 ? 'text-danger-600' : 'text-ok-600')}>{fmtMoney(outstanding)}</p>
        </Card>
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices" />
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <Card key={inv.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{inv.invoiceNo} <span className="text-sm font-normal text-slate-400">· {inv.student.user.firstName}</span></p>
                  <p className="text-xs text-slate-400">Due {fmtDate(inv.dueDate)}</p>
                  <ul className="mt-1 text-xs text-slate-500">
                    {inv.items.map((it) => <li key={it.id}>{it.description} — {fmtMoney(it.amount)}</li>)}
                  </ul>
                </div>
                <div className="text-right">
                  <StatusBadge status={inv.status} />
                  <p className="mt-1 text-lg font-bold">{fmtMoney(Number(inv.totalAmount) - Number(inv.discount) + Number(inv.lateFee))}</p>
                  {inv.dueAmount > 0 && <p className="text-xs text-danger-600">due: {fmtMoney(inv.dueAmount)}</p>}
                  {canPay && inv.dueAmount > 0 && inv.status !== 'cancelled' && (
                    <Button size="sm" className="mt-2" onClick={() => { setPaying(inv); setStep('review'); setError(''); }}>
                      <CreditCard className="h-3.5 w-3.5" /> Pay now
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!paying} onClose={() => setPaying(null)} title={`Pay ${paying?.invoiceNo}`}>
        {step === 'review' && paying && (
          <div className="space-y-3">
            <p className="text-sm">
              You are paying <span className="font-bold">{fmtMoney(paying.dueAmount)}</span> via the sandbox payment gateway.
            </p>
            <p className="rounded-lg bg-warn-50 p-2 text-xs text-warn-700 dark:bg-warn-700/10">
              Demo mode: the mock gateway approves instantly. Swap in a real provider via PAYMENT_GATEWAY env.
            </p>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaying(null)}>Cancel</Button>
              <Button onClick={() => pay.mutate()}>Proceed to pay</Button>
            </div>
          </div>
        )}
        {step === 'processing' && <Spinner />}
        {step === 'done' && (
          <div className="space-y-3 text-center">
            <p className="text-lg font-semibold text-ok-600">Payment successful ✓</p>
            <p className="text-sm text-slate-500">A receipt has been generated under Payments.</p>
            <Button onClick={() => setPaying(null)}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

interface PaymentRow {
  id: string;
  receiptNo: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
  invoice: { invoiceNo: string; student: { user: { firstName: string; lastName: string } } };
}

export function FamilyPayments() {
  const { data, isLoading } = useQuery({
    queryKey: ['family-payments'],
    queryFn: () => api<Paged<PaymentRow>>('/payments?pageSize=50'),
  });
  if (isLoading) return <Spinner />;
  const rows = data?.items ?? [];
  return rows.length === 0 ? (
    <EmptyState title="No payments yet" />
  ) : (
    <Card>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500">
            <th className="px-4 py-2">Receipt</th>
            <th className="px-4 py-2">Invoice</th>
            <th className="px-4 py-2">Method</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2 text-right">Amount</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-slate-50 dark:border-slate-800/50">
              <td className="px-4 py-2 font-medium">{p.receiptNo}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{p.invoice.invoiceNo} · {p.invoice.student.user.firstName}</td>
              <td className="px-4 py-2"><Badge>{p.method.replace('_', ' ')}</Badge></td>
              <td className="px-4 py-2 text-xs">{fmtDate(p.paidAt)}</td>
              <td className="px-4 py-2 text-right font-semibold">{fmtMoney(p.amount)}</td>
              <td className="px-4 py-2 text-right">
                <Button size="sm" variant="ghost" onClick={() => apiDownload(`/payments/${p.id}/receipt`, `${p.receiptNo}.pdf`)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
