'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ViewGear from '@/components/view-gear';
import { setRecurringViewAction } from '@/app/dashboard/view-actions';
import type { RecurringView } from '@/lib/dashboard-views';

const VIEWS: { id: RecurringView; label: string; hint: string }[] = [
  { id: 'cards', label: 'Cards', hint: 'A map of the book, then one card per plan' },
  { id: 'ops', label: 'Operations', hint: 'Tiles, a work board, and every plan on one row' },
];

/**
 * Same shape as the inbox gear, and the await is load-bearing for the same
 * reason: the page is a server component, so the markup for both dressings is
 * decided on the server. Writing the cookie and refreshing in one tick races,
 * and the refresh can be served with the OLD cookie — the page comes back
 * identical and the gear reads as broken.
 */
export default function RecurringViewGear({ view }: { view: RecurringView }) {
  const router = useRouter();
  const [, start] = useTransition();

  function pick(next: RecurringView) {
    if (next === view) return;
    start(async () => {
      await setRecurringViewAction(next);
      router.refresh();
    });
  }

  return <ViewGear views={VIEWS} activeView={view} onPickView={pick} label="View" defaults={{ view: 'cards' }} />;
}
