'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ViewGear from '@/components/view-gear';
import { setMessagesViewAction } from '@/app/dashboard/view-actions';
import type { MessagesView } from '@/lib/dashboard-views';

const VIEWS: { id: MessagesView; label: string; hint: string }[] = [
  { id: 'classic', label: 'Classic', hint: 'Orange replies, avatars beside their side' },
  { id: 'slate', label: 'Slate', hint: 'Blue replies on black, one time under each turn' },
];

/**
 * The inbox is a server component, so unlike the Clients gear this one can't
 * hold the choice in state and paint it immediately — the markup for the two
 * dressings is decided on the server.
 *
 * Which makes the await load-bearing: writing the cookie and refreshing in the
 * same tick races, and the refresh can be served with the OLD cookie, so the
 * page comes back looking exactly as it did and the gear reads as broken.
 */
export default function InboxViewGear({ view }: { view: MessagesView }) {
  const router = useRouter();
  const [, start] = useTransition();

  function pick(next: MessagesView) {
    if (next === view) return;
    start(async () => {
      await setMessagesViewAction(next);
      router.refresh();
    });
  }

  return (
    <ViewGear views={VIEWS} activeView={view} onPickView={pick} label="View" defaults={{ view: 'classic' }} />
  );
}
