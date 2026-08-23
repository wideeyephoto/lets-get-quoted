'use client';

import React, { useEffect, useRef, useState } from 'react';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Keep one producer identity across reloads and lost server-action responses.
 * A successful enqueue redirects with the durable event id as resetToken; that
 * rotates the identity once, while an ordinary reload keeps the old identity.
 */
export default function PersistentMessageIntent({
  storageKey,
  fallbackId,
  resetToken,
}: {
  storageKey: string;
  fallbackId: string;
  resetToken?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [intentId, setIntentId] = useState(fallbackId);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let next = fallbackId;
    try {
      const completionKey = `${storageKey}:last-completed`;
      const lastCompleted = window.sessionStorage.getItem(completionKey);
      const stored = window.sessionStorage.getItem(storageKey);
      if (resetToken && lastCompleted !== resetToken) {
        next = window.crypto.randomUUID();
        window.sessionStorage.setItem(completionKey, resetToken);
      } else if (stored && UUID.test(stored)) {
        next = stored;
      }
      window.sessionStorage.setItem(storageKey, next);
    } catch {
      // Private browsing or storage policy can deny sessionStorage. The
      // server-provided UUID remains valid; only cross-reload reuse is lost.
    }
    setIntentId(next);
    setReady(true);
  }, [fallbackId, resetToken, storageKey]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || ready) return;
    const holdUntilIdentityLoads = (event: SubmitEvent) => event.preventDefault();
    form.addEventListener('submit', holdUntilIdentityLoads);
    return () => form.removeEventListener('submit', holdUntilIdentityLoads);
  }, [ready]);

  // Disabled in the server HTML: a native/pre-hydration submit therefore
  // omits the identity and fails at the Server Action before enqueueing. The
  // field becomes actionable only after sessionStorage recovery has completed.
  return (
    <input
      ref={inputRef}
      type="hidden"
      name="intentId"
      value={intentId}
      disabled={!ready}
      readOnly
    />
  );
}
