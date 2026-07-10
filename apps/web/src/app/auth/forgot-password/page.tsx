'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="mb-1 text-lg font-semibold">Reset your password</h1>
        {!resetToken && !done && (
          <>
            <p className="mb-5 text-sm text-slate-500">
              Enter your account email. With the demo mail provider the reset token is shown here directly.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true); setMsg('');
                try {
                  const res = await api<{ ok: boolean; resetToken?: string }>('/auth/forgot-password', {
                    method: 'POST', body: { email },
                  });
                  if (res.resetToken) {
                    setResetToken(res.resetToken);
                    setToken(res.resetToken);
                  } else {
                    setMsg('If that account exists, a reset link has been emailed.');
                  }
                } catch (err) {
                  setMsg((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-4"
            >
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              {msg && <p className="text-sm text-slate-500">{msg}</p>}
              <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
            </form>
          </>
        )}
        {resetToken && !done && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true); setMsg('');
              try {
                await api('/auth/reset-password', { method: 'POST', body: { token, newPassword } });
                setDone(true);
              } catch (err) {
                setMsg((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-4"
          >
            <p className="rounded-lg bg-warn-50 p-2 text-xs text-warn-700 dark:bg-warn-700/10">
              Mock email provider: your reset token was returned directly and pre-filled below.
            </p>
            <Field label="Reset token">
              <Input value={token} onChange={(e) => setToken(e.target.value)} required />
            </Field>
            <Field label="New password (min 8 chars)">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
            </Field>
            {msg && <p className="text-sm text-danger-600">{msg}</p>}
            <Button type="submit" className="w-full" loading={busy}>Set new password</Button>
          </form>
        )}
        {done && <p className="text-sm text-ok-600">Password updated. You can now sign in.</p>}
        <p className="mt-4 text-center text-sm">
          <Link href="/auth/login" className="text-brand-600 hover:underline">Back to sign in</Link>
        </p>
      </Card>
    </div>
  );
}
