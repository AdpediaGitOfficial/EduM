'use client';
import { PageHeader } from '@/components/ui';
import { FamilyFees } from '@/features/misc';

export default function ParentFees() {
  return (
    <div>
      <PageHeader title="Fees" subtitle="Invoices for your children — pay online via the sandbox gateway" />
      <FamilyFees canPay />
    </div>
  );
}
