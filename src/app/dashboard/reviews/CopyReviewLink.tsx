'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * "Copy review link" in the page header.
 *
 * Its own component rather than the one in dashboard/jobs/[id]: that button
 * hard-codes `fontSize: 0.75rem` and a 0.25rem pad as inline styles, which is
 * right beside a payment row and is a 26px-tall target in a header action bar.
 * Editing it would shrink or grow it everywhere it is already used.
 *
 * The confirmation is a live region, not just a label swap — a sighted user
 * sees "Copied ✓", and without this nobody else is told anything happened.
 */
export default function CopyReviewLink({ url, label = 'Copy review link' }: { url: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // Clipboard access is refused on an insecure origin and in some embedded
      // browsers. Saying so beats a button that silently does nothing.
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 2500);
  }

  return (
    <>
      <button type="button" className="btn secondary" onClick={copy} title={url}>
        {state === 'copied' ? 'Copied ✓' : label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Review link copied to the clipboard.' : ''}
        {state === 'failed' ? 'Could not copy. Select the link manually.' : ''}
      </span>
    </>
  );
}
