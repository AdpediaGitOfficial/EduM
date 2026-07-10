'use client';
import { PageHeader } from '@/components/ui';
import { MySchedule } from '@/features/timetable';

export default function StudentTimetable() {
  return (
    <div>
      <PageHeader title="My Timetable" subtitle="Your weekly class schedule" />
      <MySchedule />
    </div>
  );
}
