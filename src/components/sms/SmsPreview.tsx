'use client';

import { useEffect, useRef, useState } from 'react';
import { segmentSms } from '@/lib/sms-segments';

/**
 * Calculates carrier SMS segment usage and detects UCS-2 characters.
 *
 * GSM-7 allows 160 characters for single segment, 153 for multi-segment.
 * UCS-2 allows 70 characters for single segment, 67 for multi-segment.
 */
export function calculateSmsSegments(text: string): { count: number; unicode: boolean } {
  const segmentation = segmentSms(text);
  return { count: segmentation.segments, unicode: segmentation.encoding === 'ucs-2' };
}

export function SmsBubble({
  message,
  phone,
  recipientLabel,
  note,
  warnNote,
}: {
  message: string;
  phone?: string | null;
  recipientLabel?: string;
  note?: React.ReactNode;
  warnNote?: React.ReactNode;
}) {
  const parts = calculateSmsSegments(message);
  const target = recipientLabel ? `${recipientLabel}${phone ? ` (${phone})` : ''}` : (phone || 'no number entered');

  return (
    <div className="preview-body sms-preview-container">
      <p className="preview-sms-meta">
        To {phone || recipientLabel ? target : <em>no number entered</em>} · {message.length} character{message.length === 1 ? '' : 's'} ·{' '}
        {parts.count} text{parts.count === 1 ? '' : 's'}
        {parts.unicode ? ' (a special character makes each one shorter)' : ''}
      </p>
      <div className="preview-sms">
        <p>{message}</p>
      </div>
      {note ? <p className="preview-note">{note}</p> : null}
      {warnNote ? <p className="preview-note preview-note-warn">{warnNote}</p> : null}
    </div>
  );
}

export default function SmsPreview({
  message,
  phone,
  recipientLabel,
  title = 'Before you send it',
  triggerLabel = '👁 Preview text',
  buttonClassName = 'btn secondary',
  mode = 'modal',
  note,
  warnNote,
}: {
  message: string;
  phone?: string | null;
  recipientLabel?: string;
  title?: string;
  triggerLabel?: string;
  buttonClassName?: string;
  mode?: 'modal' | 'inline';
  note?: React.ReactNode;
  warnNote?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (mode === 'inline') {
    return (
      <SmsBubble
        message={message}
        phone={phone}
        recipientLabel={recipientLabel}
        note={note}
        warnNote={warnNote}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div className="preview-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preview-head">
              <h3>{title}</h3>
              <button ref={closeRef} type="button" className="preview-close" onClick={() => setOpen(false)}>
                Close<span className="sr-only"> the preview</span>
              </button>
            </div>

            <SmsBubble
              message={message}
              phone={phone}
              recipientLabel={recipientLabel}
              note={note}
              warnNote={warnNote}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
