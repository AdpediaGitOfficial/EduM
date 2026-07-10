'use client';
import { PageHeader } from '@/components/ui';
import { FamilyPayments } from '@/features/misc';

export default function ParentPayments() {
  return (
    <div>
      <PageHeader title="Payments" subtitle="Receipts and payment history" />
      <FamilyPayments />
    </div>
  );
}
