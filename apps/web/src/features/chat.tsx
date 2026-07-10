'use client';

/* Messaging: contact list, threads, chat pane (parent↔teacher, teacher↔student…). */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, fmtDateTime, initials } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

interface Contact { id: string; firstName: string; lastName: string; role: string }
interface Thread { peer: Contact; last: { body: string; createdAt: string }; unread: number }
interface Msg { id: string; senderId: string; recipientId: string; body: string; createdAt: string }

export function MessagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [peer, setPeer] = useState<Contact | null>(null);
  const [text, setText] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threads = useQuery({
    queryKey: ['threads'],
    queryFn: () => api<Thread[]>('/messages/threads'),
    refetchInterval: 20_000,
  });
  const contacts = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api<Contact[]>('/messages/contacts'),
    enabled: showContacts,
  });
  const thread = useQuery({
    queryKey: ['thread', peer?.id],
    queryFn: () => api<Msg[]>(`/messages/thread/${peer!.id}`),
    enabled: !!peer,
    refetchInterval: 10_000,
  });

  const send = useMutation({
    mutationFn: () => api('/messages', { method: 'POST', body: { recipientId: peer!.id, body: text } }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['thread', peer?.id] });
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.data]);

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Direct chat with your school contacts"
        actions={
          <Button variant="secondary" onClick={() => setShowContacts((s) => !s)}>
            {showContacts ? 'Show conversations' : 'New conversation'}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto">
          {showContacts ? (
            contacts.isLoading ? <Spinner /> : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {(contacts.data ?? []).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setPeer(c); setShowContacts(false); }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {initials(c.firstName, c.lastName)}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{c.firstName} {c.lastName}</span>
                      <Badge>{c.role.replace('_', ' ')}</Badge>
                    </span>
                  </button>
                ))}
                {contacts.data?.length === 0 && <EmptyState title="No contacts available" />}
              </div>
            )
          ) : threads.isLoading ? (
            <Spinner />
          ) : (threads.data?.length ?? 0) === 0 ? (
            <EmptyState title="No conversations yet" hint="Start one from 'New conversation'" />
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {threads.data!.map((t) => (
                <button
                  key={t.peer.id}
                  onClick={() => setPeer(t.peer)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800',
                    peer?.id === t.peer.id && 'bg-brand-50 dark:bg-brand-900/20',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {initials(t.peer.firstName, t.peer.lastName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.peer.firstName} {t.peer.lastName}</span>
                    <span className="block truncate text-xs text-slate-400">{t.last.body}</span>
                  </span>
                  {t.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex max-h-[70vh] min-h-[50vh] flex-col">
          {!peer ? (
            <EmptyState title="Select a conversation" />
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-sm font-semibold">{peer.firstName} {peer.lastName}</p>
                <Badge>{peer.role.replace('_', ' ')}</Badge>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {thread.isLoading ? (
                  <Spinner />
                ) : (
                  (thread.data ?? []).map((m) => {
                    const mine = m.senderId === user?.id;
                    return (
                      <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className={cn(
                          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                          mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-slate-100 dark:bg-slate-800',
                        )}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className={cn('mt-0.5 text-[10px]', mine ? 'text-brand-100' : 'text-slate-400')}>
                            {fmtDateTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}
                className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
              >
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" />
                <Button type="submit" loading={send.isPending} disabled={!text.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
