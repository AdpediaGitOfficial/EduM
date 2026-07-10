'use client';
import { ComplaintsPage } from '@/features/complaints';

export default function ParentComplaints() {
  return <ComplaintsPage canManage={false} />;
}
