'use client';

/* Shared data hooks + picker dropdowns (sections, subjects, exams, classes). */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Select } from '@/components/ui';

export interface SectionInfo {
  id: string;
  name: string;
  room?: string | null;
  capacity?: number;
  classTeacherId?: string | null;
  class: { id: string; name: string; level: number };
  classTeacher?: { user: { firstName: string; lastName: string } } | null;
  _count?: { students: number };
}

export function useSections() {
  return useQuery({ queryKey: ['sections'], queryFn: () => api<SectionInfo[]>('/sections') });
}

export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: () => api<{ id: string; name: string; code: string; isElective: boolean }[]>('/subjects'),
  });
}

export function useClasses() {
  return useQuery({
    queryKey: ['classes'],
    queryFn: () => api<(SectionInfo['class'] & { sections: SectionInfo[] })[]>('/classes'),
  });
}

export function useExams() {
  return useQuery({
    queryKey: ['exams'],
    queryFn: () => api<{ id: string; name: string; type: string; startDate: string; published: boolean; _count?: { results: number } }[]>('/exams'),
  });
}

export function sectionLabel(s: SectionInfo | undefined | null): string {
  return s ? `${s.class.name}-${s.name}` : '';
}

export function SectionPicker({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const { data } = useSections();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-40">
      {allowAll ? <option value="">All sections</option> : <option value="">Select section…</option>}
      {data?.map((s) => (
        <option key={s.id} value={s.id}>{sectionLabel(s)}</option>
      ))}
    </Select>
  );
}

export function SubjectPicker({ value, onChange, allowAll }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const { data } = useSubjects();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-40">
      {allowAll ? <option value="">All subjects</option> : <option value="">Select subject…</option>}
      {data?.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </Select>
  );
}

export function ExamPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useExams();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-44">
      <option value="">Select exam…</option>
      {data?.map((e) => (
        <option key={e.id} value={e.id}>{e.name}</option>
      ))}
    </Select>
  );
}
