'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

type DraftValue = string | boolean;

/** Preserve a long private-beta application across server validation redirects. */
export default function PersistedApplicationForm({
  action,
  storageKey,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  storageKey: string;
  children: ReactNode;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // The saved browser draft is the newest copy after a validation redirect.
  // Keep every control inert during SSR and the first hydrated frame so a user
  // cannot submit (or start typing into) stale server defaults before restore.
  const [draftRestored, setDraftRestored] = useState(false);

  const saveDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const draft: Record<string, DraftValue> = {};
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement
        || element instanceof HTMLTextAreaElement
        || element instanceof HTMLSelectElement)) continue;
      if (!element.name
        || element.name === 'submissionKey'
        || element.name === 'attested'
        || element.name === 'ein'
        || element.name === 'taxId'
        || element.type === 'submit') continue;
      draft[element.name] = element instanceof HTMLInputElement && element.type === 'checkbox'
        ? element.checked
        : element.value;
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // The form remains usable when a browser blocks session storage.
    }
  }, [storageKey]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      setDraftRestored(true);
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        for (const [name, value] of Object.entries(draft)) {
          if (name === 'attested' || name === 'submissionKey' || name === 'ein' || name === 'taxId') continue;
          const element = form.elements.namedItem(name);
          if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            if (typeof value === 'boolean') element.checked = value;
          } else if (
            (element instanceof HTMLInputElement
              || element instanceof HTMLTextAreaElement
              || element instanceof HTMLSelectElement)
            && typeof value === 'string'
          ) {
            element.value = value;
          }
        }
      }
    } catch {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Storage is optional; do not break the application form when denied.
      }
    } finally {
      setDraftRestored(true);
    }
  }, [storageKey]);

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    if (!draftRestored) {
      event.preventDefault();
      return;
    }
    saveDraft();
  }, [draftRestored, saveDraft]);

  return (
    <form
      ref={formRef}
      action={action}
      className={className}
      onInput={saveDraft}
      onChange={saveDraft}
      onSubmit={submit}
    >
      <fieldset
        disabled={!draftRestored}
        aria-busy={!draftRestored}
        style={{ border: 0, display: 'grid', gap: '1rem', margin: 0, minWidth: 0, padding: 0 }}
      >
        {children}
      </fieldset>
    </form>
  );
}

/** Clear a draft only after the server has loaded a durable non-editable state. */
export function ApplicationDraftLifecycle({ storageKey, clear }: { storageKey: string; clear: boolean }) {
  useEffect(() => {
    if (!clear) return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage is optional; the durable application remains authoritative.
    }
  }, [clear, storageKey]);
  return null;
}
