'use client';

/* Library: catalog + borrow/reserve (all roles), returns/fines (staff). */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BookMarked, Plus, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { Badge, Button, Field, Input, Modal, PageHeader, StatusBadge, Tabs } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { useAuth } from '@/lib/auth';

interface Book {
  id: string; title: string; author: string | null; isbn: string | null;
  category: string | null; copies: number; availableCopies: number;
  shelf: string | null; isDigital: boolean;
}
interface Txn {
  id: string; type: string; issuedAt: string; dueAt: string | null; returnedAt: string | null;
  fine: string; finePaid: boolean;
  book: { title: string; author: string | null };
  student: { admissionNo: string; user: { firstName: string; lastName: string } } | null;
}

export function LibraryPage({ mode }: { mode: 'admin' | 'member' }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('catalog');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => { setRefreshKey((k) => k + 1); qc.invalidateQueries(); };

  const borrow = useMutation({
    mutationFn: (bookId: string) => api('/library/borrow', { method: 'POST', body: { bookId } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message),
  });
  const reserve = useMutation({
    mutationFn: (bookId: string) => api('/library/reserve', { method: 'POST', body: { bookId } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message),
  });
  const returnBook = useMutation({
    mutationFn: (txnId: string) => api(`/library/return/${txnId}`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message),
  });
  const payFine = useMutation({
    mutationFn: (txnId: string) => api(`/library/fines/${txnId}/pay`, { method: 'POST' }),
    onSuccess: refresh,
  });

  const canBorrowSelf = user?.role === 'student';
  const isStaff = mode === 'admin';
  const [bookOpen, setBookOpen] = useState(false);
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', category: '', copies: 1, shelf: '' });
  const [bookError, setBookError] = useState('');
  const addBook = useMutation({
    mutationFn: () => api('/library/books', { method: 'POST', body: { ...bookForm, copies: Number(bookForm.copies) } }),
    onSuccess: () => {
      setBookOpen(false); setBookError('');
      setBookForm({ title: '', author: '', isbn: '', category: '', copies: 1, shelf: '' });
      refresh();
    },
    onError: (e: Error) => setBookError(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle="Catalog, circulation, reservations & fines"
        actions={isStaff && (
          <Button onClick={() => { setBookOpen(true); setBookError(''); }}><Plus className="h-4 w-4" /> Add book</Button>
        )}
      />
      <Tabs
        tabs={[
          { key: 'catalog', label: 'Catalog' },
          { key: 'transactions', label: isStaff ? 'Circulation' : 'My books' },
          ...(isStaff ? [{ key: 'fines', label: 'Fines' }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'catalog' && (
        <DataTable<Book>
          endpoint="/library/books"
          refreshKey={refreshKey}
          searchPlaceholder="Search title, author, ISBN…"
          filters={[
            { key: 'category', label: 'Category', options: ['Fiction', 'Science', 'Mathematics', 'Biography', 'History', 'Technology', 'Reference', 'Art', 'Sports', 'Health'].map((c) => ({ value: c, label: c })) },
            { key: 'available', label: 'Availability', options: [{ value: 'true', label: 'Available now' }] },
          ]}
          columns={[
            { key: 'title', header: 'Title', render: (b) => (
              <div>
                <p className="font-medium">{b.title} {b.isDigital && <Badge tone="brand">digital</Badge>}</p>
                <p className="text-xs text-slate-400">{b.author ?? '—'} {b.isbn ? `· ${b.isbn}` : ''}</p>
              </div>
            ) },
            { key: 'category', header: 'Category' },
            { key: 'shelf', header: 'Shelf' },
            { key: 'availableCopies', header: 'Available', render: (b) => (
              <Badge tone={b.availableCopies > 0 ? 'ok' : 'danger'}>{b.availableCopies}/{b.copies}</Badge>
            ) },
          ]}
          actions={(b) => (
            <>
              {canBorrowSelf && b.availableCopies > 0 && (
                <Button size="sm" variant="secondary" onClick={() => borrow.mutate(b.id)}>
                  <BookMarked className="h-3.5 w-3.5" /> Borrow
                </Button>
              )}
              {canBorrowSelf && b.availableCopies === 0 && (
                <Button size="sm" variant="ghost" onClick={() => reserve.mutate(b.id)}>Reserve</Button>
              )}
            </>
          )}
        />
      )}

      {tab === 'transactions' && (
        <DataTable<Txn>
          endpoint="/library/transactions"
          refreshKey={refreshKey}
          filters={[
            { key: 'active', label: 'Show', options: [{ value: 'true', label: 'Active borrows' }] },
            { key: 'type', label: 'Type', options: ['borrow', 'return', 'reserve'].map((t) => ({ value: t, label: t })) },
          ]}
          columns={[
            { key: 'book', header: 'Book', render: (t) => <span className="font-medium">{t.book.title}</span> },
            ...(isStaff ? [{
              key: 'student', header: 'Borrower',
              render: (t: Txn) => t.student ? `${t.student.user.firstName} ${t.student.user.lastName}` : 'Staff',
            }] : []),
            { key: 'type', header: 'Type', render: (t) => <StatusBadge status={t.returnedAt ? 'returned' : t.type === 'borrow' ? 'borrowed' : t.type} /> },
            { key: 'issuedAt', header: 'Issued', render: (t) => fmtDate(t.issuedAt) },
            { key: 'dueAt', header: 'Due', render: (t) => (
              <span className={t.dueAt && !t.returnedAt && new Date(t.dueAt) < new Date() ? 'font-semibold text-danger-600' : ''}>
                {fmtDate(t.dueAt)}
              </span>
            ) },
            { key: 'fine', header: 'Fine', render: (t) => Number(t.fine) > 0 ? (
              <span className={t.finePaid ? 'text-slate-400 line-through' : 'font-semibold text-danger-600'}>{fmtMoney(t.fine)}</span>
            ) : '—' },
          ]}
          actions={(t) => (
            <>
              {isStaff && t.type === 'borrow' && !t.returnedAt && (
                <Button size="sm" variant="secondary" onClick={() => returnBook.mutate(t.id)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Return
                </Button>
              )}
              {isStaff && Number(t.fine) > 0 && !t.finePaid && (
                <Button size="sm" variant="ghost" onClick={() => payFine.mutate(t.id)}>Collect fine</Button>
              )}
            </>
          )}
        />
      )}

      {tab === 'fines' && isStaff && <FinesTab refreshKey={refreshKey} />}

      <Modal open={bookOpen} onClose={() => setBookOpen(false)} title="Add book" wide>
        <form onSubmit={(e) => { e.preventDefault(); addBook.mutate(); }} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Title *"><Input value={bookForm.title} onChange={(e) => setBookForm((f) => ({ ...f, title: e.target.value }))} required /></Field>
          <Field label="Author"><Input value={bookForm.author} onChange={(e) => setBookForm((f) => ({ ...f, author: e.target.value }))} /></Field>
          <Field label="ISBN"><Input value={bookForm.isbn} onChange={(e) => setBookForm((f) => ({ ...f, isbn: e.target.value }))} /></Field>
          <Field label="Category"><Input value={bookForm.category} onChange={(e) => setBookForm((f) => ({ ...f, category: e.target.value }))} placeholder="Fiction" /></Field>
          <Field label="Copies"><Input type="number" min={1} value={bookForm.copies} onChange={(e) => setBookForm((f) => ({ ...f, copies: Number(e.target.value) }))} /></Field>
          <Field label="Shelf"><Input value={bookForm.shelf} onChange={(e) => setBookForm((f) => ({ ...f, shelf: e.target.value }))} placeholder="A-4" /></Field>
          {bookError && <p className="text-sm text-danger-600 sm:col-span-2">{bookError}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setBookOpen(false)}>Cancel</Button>
            <Button type="submit" loading={addBook.isPending}>Add</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FinesTab({ refreshKey }: { refreshKey: number }) {
  return (
    <DataTable<Txn>
      endpoint="/library/transactions"
      refreshKey={refreshKey}
      extraParams={{ type: 'borrow' }}
      columns={[
        { key: 'book', header: 'Book', render: (t) => t.book.title },
        { key: 'student', header: 'Borrower', render: (t) => t.student ? `${t.student.user.firstName} ${t.student.user.lastName}` : 'Staff' },
        { key: 'dueAt', header: 'Due', render: (t) => fmtDate(t.dueAt) },
        { key: 'fine', header: 'Fine', render: (t) => Number(t.fine) > 0 ? fmtMoney(t.fine) : '—' },
        { key: 'finePaid', header: 'Paid?', render: (t) => Number(t.fine) > 0 ? <StatusBadge status={t.finePaid ? 'paid' : 'pending'} /> : '—' },
      ]}
    />
  );
}
