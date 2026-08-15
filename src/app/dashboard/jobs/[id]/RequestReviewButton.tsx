'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

type ReviewResult = { ok: boolean; message: string };

function formatRequestedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// One-tap "ask for a Google review" button, shown on a completed job. Calls the
// server action, which picks the channel (text, else email) and reports back
// what happened. When no Google Business Profile is linked there's nowhere for
// the review to land, so we point the owner to the website builder instead.
export default function RequestReviewButton({
  action,
  reviewConfigured,
  lastRequestedAt,
}: {
  action: () => Promise<ReviewResult>;
  reviewConfigured: boolean;
  lastRequestedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReviewResult | null>(null);

  if (!reviewConfigured) {
    return (
      <div className="review-request-block">
        <Link href="/dashboard/sites?open=reviews" className="btn secondary">⭐ Set up review requests</Link>
        <small className="review-request-hint">Link your Google Business Profile in the website builder so reviews have a destination.</small>
      </div>
    );
  }

  function handleClick() {
    startTransition(async () => {
      setResult(await action());
    });
  }

  const requestedLabel = lastRequestedAt ? formatRequestedAt(lastRequestedAt) : null;

  return (
    <div className="review-request-block">
      <button type="button" className="btn secondary" onClick={handleClick} disabled={pending}>
        {pending ? 'Sending…' : requestedLabel ? '⭐ Ask again for a review' : '⭐ Ask for a Google review'}
      </button>
      {result ? (
        <small className={`review-request-hint ${result.ok ? 'is-ok' : 'is-error'}`}>{result.message}</small>
      ) : requestedLabel ? (
        <small className="review-request-hint">Last requested {requestedLabel}.</small>
      ) : null}
    </div>
  );
}
