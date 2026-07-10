'use client';
import { PageHeader } from '@/components/ui';
import { MySchedule } from '@/features/timetable';

export default function TeacherTimetable() {
  return (
    <div>
      <PageHeader title="My Timetable" subtitle="Your weekly teaching schedule" />
      <MySchedule />
    </div>
  );
}
