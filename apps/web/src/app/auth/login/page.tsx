'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui';

const DEMO_ACCOUNTS = [
  ['School admin', 'admin@demo.edum.school'],
  ['Principal', 'principal@demo.edum.school'],
  ['Teacher', 'teacher1@demo.edum.school'],
  ['Parent', 'parent1@demo.edum.school'],
  ['Student', 'student1@demo.edum.school'],
  ['Accountant', 'accountant@demo.edum.school'],
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent, overrideEmail?: string) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(overrideEmail ?? email, overrideEmail ? 'Password123!' : password);
      router.replace(homeFor(user.role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-5xl gap-6 lg:grid lg:grid-cols-2">
        <div className="mb-6 flex flex-col justify-center lg:mb-0">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">EduM</h1>
              <p className="text-sm text-slate-500">School Management ERP</p>
            </div>
          </div>
          <p className="max-w-md text-sm text-slate-500">
            Attendance, academics, fees, payroll, transport, library and communication —
            one permission-controlled workspace for your whole school.
          </p>
          <div className="mt-6 hidden lg:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Demo accounts (password: Password123!)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map(([label, mail]) => (
                <button
                  key={mail}
                  onClick={() => submit(undefined, mail)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="font-medium">{label}</span>
                  <span className="block truncate text-slate-400">{mail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <h2 className="mb-1 text-lg font-semibold">Sign in</h2>
          <p className="mb-5 text-sm text-slate-500">Use your school account credentials.</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" required autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </Field>
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
            <p className="text-center text-sm">
              <Link href="/auth/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
