'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText, Play } from 'lucide-react';
import { api, apiDownload } from '@/lib/api';
import {
  Button, Card, CardHeader, EmptyState, Input, PageHeader, Select, Spinner,
} from '@/components/ui';
import { ExamPicker, SectionPicker, useClasses } from '@/features/pickers';

interface CatalogItem { key: string; label: string }

export default function AdminReportsPage() {
  const { data: catalog } = useQuery({
    queryKey: ['report-catalog'],
    queryFn: () => api<CatalogItem[]>('/reports/catalog'),
  });
  const { data: classes } = useClasses();
  const [key, setKey] = useState('');
  const [params, setParams] = useState({ sectionId: '', examId: '', classId: '', month: '', from: '', to: '' });
  const [run, setRun] = useState(0);

  const buildQuery = () => {
    const q = new URLSearchParams({ key });
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return q;
  };

  const preview = useQuery({
    queryKey: ['report-preview', key, params, run],
    queryFn: () => api<{ title: string; rows: Record<string, string | number | null>[] }>(`/reports/run?${buildQuery().toString()}&format=json`),
    enabled: !!key && run > 0,
  });

  const download = (format: string) => {
    const q = buildQuery();
    q.set('format', format);
    apiDownload(`/reports/run?${q.toString()}`, `${key}-report.${format}`);
  };

  const showSection = ['attendance'].includes(key);
  const showExamClass = key === 'academic';
  const showMonth = key === 'payroll';
  const showDates = key === 'attendance';

  return (
    <div>
      <PageHeader title="Reports" subtitle="Parameterized reports with CSV / Excel / PDF export" />
      <Card className="mb-4">
        <CardHeader title="Report builder" />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Report</p>
            <Select value={key} onChange={(e) => { setKey(e.target.value); setRun(0); }} className="min-w-52">
              <option value="">Select a report…</option>
              {catalog?.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </div>
          {showSection && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Section</p>
              <SectionPicker value={params.sectionId} onChange={(v) => setParams((p) => ({ ...p, sectionId: v }))} allowAll />
            </div>
          )}
          {showExamClass && (
            <>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Exam</p>
                <ExamPicker value={params.examId} onChange={(v) => setParams((p) => ({ ...p, examId: v }))} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Class</p>
                <Select value={params.classId} onChange={(e) => setParams((p) => ({ ...p, classId: e.target.value }))} className="min-w-36">
                  <option value="">All classes</option>
                  {classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </>
          )}
          {showMonth && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Month</p>
              <Input type="month" value={params.month} onChange={(e) => setParams((p) => ({ ...p, month: e.target.value }))} />
            </div>
          )}
          {showDates && (
            <>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">From</p>
                <Input type="date" value={params.from} onChange={(e) => setParams((p) => ({ ...p, from: e.target.value }))} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">To</p>
                <Input type="date" value={params.to} onChange={(e) => setParams((p) => ({ ...p, to: e.target.value }))} />
              </div>
            </>
          )}
          <Button onClick={() => setRun((r) => r + 1)} disabled={!key}>
            <Play className="h-4 w-4" /> Run
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" disabled={!key || !preview.data} onClick={() => download('csv')}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" disabled={!key || !preview.data} onClick={() => download('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button variant="secondary" disabled={!key || !preview.data} onClick={() => download('pdf')}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </Card>

      {preview.isLoading && <Spinner />}
      {!preview.data && !preview.isLoading && <EmptyState title="Pick a report and press Run" />}
      {preview.data && (
        <Card>
          <CardHeader title={preview.data.title} subtitle={`${preview.data.rows.length} rows`} />
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-slate-900">
                <tr className="text-left text-xs uppercase text-slate-500">
                  {preview.data.rows[0] && Object.keys(preview.data.rows[0]).map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2">{h.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-slate-50 dark:border-slate-800/50">
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="whitespace-nowrap px-3 py-1.5">{v == null ? '—' : String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.data.rows.length > 200 && (
              <p className="p-3 text-center text-xs text-slate-400">Preview limited to 200 rows — export for the full set.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
