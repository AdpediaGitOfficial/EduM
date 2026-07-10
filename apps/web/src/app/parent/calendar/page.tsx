'use client';

import { useState } from 'react';
import { CalendarPage, ChildPicker, useChildren } from '@/features/misc';

export default function ParentCalendar() {
  const { data: children } = useChildren();
  const [childId, setChildId] = useState('');
  const active = childId || children?.[0]?.id;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ChildPicker value={active ?? ''} onChange={setChildId} />
      </div>
      <CalendarPage studentId={active} />
    </div>
  );
}
