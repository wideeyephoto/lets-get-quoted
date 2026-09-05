'use client';

import { useActionState, type ReactNode } from 'react';
import Link from 'next/link';
import SaveButton from '@/components/save-button';
import type { MessageActionResult } from './types';

export default function ReplyForm({
  action,
  availableTextCredits,
  topUpHref,
  id = 'reply-body',
  children,
}: {
  action: (previousOrFormData: any, maybeFormData?: any) => Promise<MessageActionResult>;
  availableTextCredits: number | null;
  topUpHref: string;
  id?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, { status: 'idle' });

  return (
    <form action={formAction} className="inbox-reply">
      {children}
      {state.status === 'error' ? (
        <div
          className="alert alert-error"
          role="alert"
          style={{
            marginBottom: '0.5rem',
            color: 'var(--red-11, #b91c1c)',
            backgroundColor: 'var(--red-2, #fef2f2)',
            border: '1px solid var(--red-6, #fca5a5)',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            lineHeight: 1.4,
          }}
        >
          {state.message}
        </div>
      ) : null}
      <textarea
        id="reply-body"
        name="body"
        rows={2}
        placeholder="Type a reply…"
        required
        aria-label="Reply message"
      />
      <div
        className="inbox-reply-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginTop: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        {availableTextCredits !== null ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.8125rem',
              color: availableTextCredits <= 25 ? 'var(--amber-10, #f59e0b)' : 'var(--text-muted, #94a3b8)',
              fontWeight: 500,
            }}
          >
            <span>💬 {availableTextCredits.toLocaleString('en-US')} text credits remaining</span>
            {availableTextCredits <= 25 ? (
              <Link
                href={topUpHref}
                style={{ color: 'var(--amber-11, #d97706)', fontWeight: 600, textDecoration: 'underline' }}
              >
                + Top up
              </Link>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        <SaveButton className="btn primary" pendingLabel="Queueing…" savedLabel="Queued ✓">
          Send
        </SaveButton>
      </div>
    </form>
  );
}
