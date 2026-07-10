'use client';

/**
 * CrudPage — config-driven CRUD screen: server-paginated table +
 * create/edit modal form + delete confirmation. Powers most admin lists.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Column, DataTable, FilterDef } from './data-table';
import { Button, ConfirmDialog, Field, Input, Modal, PageHeader, Select, Textarea } from './ui';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'select' | 'textarea' | 'checkbox' | 'time';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** only include in create (not edit) or vice versa */
  createOnly?: boolean;
  editOnly?: boolean;
}

export function FormFields({
  fields, values, setValues, mode,
}: {
  fields: FieldDef[];
  values: Record<string, unknown>;
  setValues: (updater: (v: Record<string, unknown>) => Record<string, unknown>) => void;
  mode: 'create' | 'edit';
}) {
  const visible = fields.filter((f) => (mode === 'create' ? !f.editOnly : !f.createOnly));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {visible.map((f) => (
        <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
          <Field label={f.label + (f.required ? ' *' : '')}>
            {f.type === 'select' ? (
              <Select
                value={(values[f.name] as string) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              >
                <option value="">Select…</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            ) : f.type === 'textarea' ? (
              <Textarea
                rows={3}
                value={(values[f.name] as string) ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            ) : f.type === 'checkbox' ? (
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={!!values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
              />
            ) : (
              <Input
                type={f.type ?? 'text'}
                value={(values[f.name] as string | number) ?? ''}
                placeholder={f.placeholder}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [f.name]: f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
                  }))
                }
              />
            )}
          </Field>
        </div>
      ))}
    </div>
  );
}

export function CrudPage<T extends { id: string }>({
  title, subtitle, endpoint, columns, fields, filters,
  canCreate = true, canEdit = true, canDelete = true,
  createLabel = 'Add', deleteMessage = 'This cannot be undone.',
  toFormValues, transformSubmit, extraHeaderActions, extraRowActions, onRowClick,
  createEndpoint,
}: {
  title: string;
  subtitle?: string;
  endpoint: string;
  columns: Column<T>[];
  fields: FieldDef[];
  filters?: FilterDef[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  createLabel?: string;
  deleteMessage?: string;
  /** map a row to form values for editing */
  toFormValues?: (row: T) => Record<string, unknown>;
  /** transform form values before submit */
  transformSubmit?: (values: Record<string, unknown>, mode: 'create' | 'edit') => Record<string, unknown>;
  extraHeaderActions?: React.ReactNode;
  extraRowActions?: (row: T, refresh: () => void) => React.ReactNode;
  onRowClick?: (row: T) => void;
  createEndpoint?: string;
}) {
  const qc = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; row?: T }>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [deleteRow, setDeleteRow] = useState<T | null>(null);
  const [error, setError] = useState('');

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    qc.invalidateQueries();
  };

  const save = useMutation({
    mutationFn: async () => {
      const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v !== undefined));
      const body = transformSubmit ? transformSubmit(clean, modal!.mode) : clean;
      if (modal!.mode === 'create') {
        return api(createEndpoint ?? endpoint, { method: 'POST', body });
      }
      return api(`${endpoint}/${modal!.row!.id}`, { method: 'PATCH', body });
    },
    onSuccess: () => { setModal(null); setError(''); refresh(); },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (row: T) => api(`${endpoint}/${row.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {extraHeaderActions}
            {canCreate && (
              <Button onClick={() => { setValues({}); setError(''); setModal({ mode: 'create' }); }}>
                <Plus className="h-4 w-4" /> {createLabel}
              </Button>
            )}
          </>
        }
      />
      <DataTable<T>
        endpoint={endpoint}
        columns={columns}
        filters={filters}
        refreshKey={refreshKey}
        onRowClick={onRowClick}
        actions={(row) => (
          <>
            {extraRowActions?.(row, refresh)}
            {canEdit && (
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  setValues(toFormValues ? toFormValues(row) : { ...row });
                  setError('');
                  setModal({ mode: 'edit', row });
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteRow(row)}>
                <Trash2 className="h-3.5 w-3.5 text-danger-500" />
              </Button>
            )}
          </>
        )}
      />

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? `${createLabel}` : 'Edit'} wide>
        {modal && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <FormFields fields={fields} values={values} setValues={(u) => setValues(u)} mode={modal.mode} />
            {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" loading={save.isPending}>Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        onConfirm={() => deleteRow && remove.mutate(deleteRow)}
        title="Delete?"
        message={deleteMessage}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
