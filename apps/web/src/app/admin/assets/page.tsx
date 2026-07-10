'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDate, fmtMoney } from '@/lib/utils';
import { CrudPage } from '@/components/crud-page';
import { Badge, Card, StatusBadge } from '@/components/ui';
import { Donut } from '@/components/charts';

interface AssetRow {
  id: string;
  name: string;
  category: string;
  assetTag: string;
  purchaseDate: string | null;
  purchaseCost: string;
  depreciationRate: string;
  vendor: string | null;
  amcExpiry: string | null;
  status: string;
  allocatedTo: string | null;
  nextMaintenanceAt: string | null;
  currentValue: number;
}

const CATEGORIES = ['furniture', 'electronics', 'lab', 'sports', 'vehicle', 'other'];

function AssetsDashboard() {
  const { data } = useQuery({
    queryKey: ['assets-analytics'],
    queryFn: () => api<{ total: number; totalCost: number; totalValue: number; byCategory: Record<string, { count: number }>; byStatus: Record<string, number>; maintenanceDue: number; amcExpiring: number }>('/assets/analytics'),
  });
  if (!data) return null;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Card className="p-4"><p className="text-xs uppercase text-slate-400">Assets</p><p className="text-xl font-bold">{data.total}</p></Card>
      <Card className="p-4"><p className="text-xs uppercase text-slate-400">Purchase cost</p><p className="text-xl font-bold">{fmtMoney(data.totalCost)}</p></Card>
      <Card className="p-4"><p className="text-xs uppercase text-slate-400">Current value</p><p className="text-xl font-bold text-brand-600">{fmtMoney(data.totalValue)}</p><p className="text-[10px] text-slate-400">straight-line depreciation</p></Card>
      <Card className="p-4"><p className="text-xs uppercase text-slate-400">Maintenance due</p><p className="text-xl font-bold text-warn-600">{data.maintenanceDue}</p><p className="text-[10px] text-slate-400">next 30 days</p></Card>
      <Card className="p-4"><p className="text-xs uppercase text-slate-400">AMC expiring</p><p className="text-xl font-bold text-danger-600">{data.amcExpiring}</p><p className="text-[10px] text-slate-400">next 60 days</p></Card>
      <Card className="p-2">
        <Donut height={110} data={Object.entries(data.byStatus).map(([name, value]) => ({ name, value }))} />
      </Card>
    </div>
  );
}

export default function AdminAssetsPage() {
  return (
    <div>
      <AssetsDashboard />
      <CrudPage<AssetRow>
        title="Assets"
        subtitle="Register with QR/barcode tags, allocation, AMC, vendors & depreciation"
        endpoint="/assets"
        createLabel="Add asset"
        deleteMessage="The asset will be marked disposed (records are kept)."
        filters={[
          { key: 'category', label: 'Category', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          { key: 'status', label: 'Status', options: ['available', 'in_use', 'maintenance', 'retired', 'disposed'].map((s) => ({ value: s, label: s.replace('_', ' ') })) },
        ]}
        columns={[
          { key: 'assetTag', header: 'Tag (QR)', render: (a) => <span className="font-mono text-xs">{a.assetTag}</span> },
          { key: 'name', header: 'Asset', render: (a) => (
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-slate-400">{a.vendor ?? ''}</p>
            </div>
          ) },
          { key: 'category', header: 'Category', render: (a) => <Badge>{a.category}</Badge> },
          { key: 'allocatedTo', header: 'Allocated to', render: (a) => a.allocatedTo ?? '—' },
          { key: 'purchaseCost', header: 'Cost', render: (a) => fmtMoney(a.purchaseCost) },
          { key: 'currentValue', header: 'Value now', render: (a) => <span className="text-brand-600">{fmtMoney(a.currentValue)}</span> },
          { key: 'amcExpiry', header: 'AMC', render: (a) => a.amcExpiry ? fmtDate(a.amcExpiry) : '—' },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ]}
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES.map((c) => ({ value: c, label: c })) },
          { name: 'purchaseDate', label: 'Purchase date', type: 'date' },
          { name: 'purchaseCost', label: 'Purchase cost (₹)', type: 'number' },
          { name: 'depreciationRate', label: 'Depreciation %/year', type: 'number' },
          { name: 'vendor', label: 'Vendor' },
          { name: 'amcExpiry', label: 'AMC expiry', type: 'date' },
          { name: 'status', label: 'Status', type: 'select', options: ['available', 'in_use', 'maintenance', 'retired'].map((s) => ({ value: s, label: s.replace('_', ' ') })) },
          { name: 'allocatedTo', label: 'Allocated to (room/person)' },
          { name: 'nextMaintenanceAt', label: 'Next maintenance', type: 'date' },
        ]}
        toFormValues={(a) => ({
          name: a.name, category: a.category,
          purchaseDate: a.purchaseDate?.slice(0, 10) ?? '', purchaseCost: Number(a.purchaseCost),
          depreciationRate: Number(a.depreciationRate), vendor: a.vendor ?? '',
          amcExpiry: a.amcExpiry?.slice(0, 10) ?? '', status: a.status,
          allocatedTo: a.allocatedTo ?? '', nextMaintenanceAt: a.nextMaintenanceAt?.slice(0, 10) ?? '',
        })}
      />
    </div>
  );
}
