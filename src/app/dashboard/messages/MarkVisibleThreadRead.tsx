'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { markThreadReadAction } from './actions';

/**
 * Mark only a conversation pane the browser is actually displaying.
 *
 * The server cannot know the viewport: a default thread is visible beside the
 * list on desktop, but deliberately hidden behind the list on phones. Waiting
 * for this visibility check prevents a mobile inbox visit from clearing a text
 * the owner never saw while preserving normal desktop read behavior.
 */
export default function MarkVisibleThreadRead({
  phone,
  readThrough,
  explicitlyChosen,
}: {
  phone: string;
  readThrough: string;
  explicitlyChosen: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 821px)');
    let submitted = false;
    let cancelled = false;

    const markIfVisible = () => {
      if (submitted || (!explicitlyChosen && !desktop.matches)) return;
      submitted = true;
      void markThreadReadAction(phone, readThrough)
        .then((updated) => {
          if (!cancelled && updated) router.refresh();
        })
        .catch(() => {
          // Navigation/session changes can invalidate an in-flight action. The
          // next real visit will try again; this invisible helper has no error UI.
        });
    };

    markIfVisible();
    desktop.addEventListener('change', markIfVisible);
    return () => {
      cancelled = true;
      desktop.removeEventListener('change', markIfVisible);
    };
  }, [explicitlyChosen, phone, readThrough, router]);

  return null;
}
