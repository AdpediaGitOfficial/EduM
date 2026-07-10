'use client';
import { AnnouncementsFeed } from '@/features/announcements';

export default function ParentAnnouncements() {
  return <AnnouncementsFeed canCompose={false} />;
}
