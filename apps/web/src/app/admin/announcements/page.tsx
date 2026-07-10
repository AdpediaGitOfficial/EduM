'use client';
import { AnnouncementsFeed } from '@/features/announcements';

export default function AdminAnnouncements() {
  return <AnnouncementsFeed canCompose canDelete />;
}
