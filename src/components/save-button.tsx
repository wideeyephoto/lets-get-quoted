'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

type Props = {
  children?: React.ReactNode;
  pendingLabel?: string;
  savedLabel?: string;
  className?: string;
  // Lets one form host multiple submit buttons that call different (bound)
  // server actions — e.g. "Save & text" vs "Save, no text".
  formAction?: (formData: FormData) => void | Promise<void>;
  'aria-label'?: string;
};

// Submit button for a Server Action form. Shows a pending state while the
// action is in flight, then briefly confirms success once it completes.
export default function SaveButton({
  children = 'Save changes',
  pendingLabel = 'Saving…',
  savedLabel = 'Saved ✓',
  className = 'btn primary',
  formAction,
  'aria-label': ariaLabel,
}: Props) {
  const { pending } = useFormStatus();
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} formAction={formAction} aria-label={ariaLabel}>
      {pending ? pendingLabel : showSaved ? savedLabel : children}
    </button>
  );
}
