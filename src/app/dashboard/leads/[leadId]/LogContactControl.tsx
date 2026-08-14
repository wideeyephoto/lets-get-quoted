'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { logLeadContactAction } from '../actions';
import styles from '../leads.module.css';

// What happened on the touchpoint — one-tap outcomes covering the calls a
// contractor actually makes on a fresh lead.
const OUTCOMES: { label: string; icon: string }[] = [
  { label: 'Spoke to homeowner', icon: '📞' },
  { label: 'Sent text', icon: '💬' },
  { label: 'Left voicemail', icon: '📵' },
  { label: 'No answer', icon: '🔕' },
  { label: 'Sent email', icon: '📧' },
  { label: 'Scheduled call-back', icon: '📅' },
];

// Quick note snippets for the scenarios that repeat lead after lead.
const NOTE_SNIPPETS = ['Wants a quote', 'Discussed scope', 'Call back later', 'Asked for photos', 'Price shopping', 'Ready to book'];

type LogContactControlProps = {
  leadId: string;
  isFirst?: boolean;
};

export default function LogContactControl({ leadId, isFirst = false }: LogContactControlProps) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function addSnippet(snippet: string) {
    setNote((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      if (trimmed.toLowerCase().includes(snippet.toLowerCase())) return prev;
      return `${trimmed}${trimmed.endsWith('.') ? '' : '.'} ${snippet}`;
    });
  }

  function submit() {
    if (!outcome) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await logLeadContactAction(leadId, outcome, note);
        setOpen(false);
        setOutcome(null);
        setNote('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not log contact.');
      }
    });
  }

  return (
    <div className={styles.logContact} ref={boxRef}>
      <button
        type="button"
        className="btn secondary"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {isFirst ? 'Log first contact' : 'Log contact'}
      </button>
      {open ? (
        <div id={popId} className={styles.logContactPop} role="dialog" aria-label="Log contact">
          <p className={styles.logContactTitle}>What happened?</p>
          <div className={styles.logContactChips}>
            {OUTCOMES.map((item) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={outcome === item.label}
                className={`${styles.logChip} ${outcome === item.label ? styles.logChipActive : ''}`}
                onClick={() => setOutcome(item.label)}
              >
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </button>
            ))}
          </div>

          <label className={styles.logContactNoteLabel} htmlFor={`logNote-${leadId}`}>
            Note <span>(optional)</span>
          </label>
          <textarea
            id={`logNote-${leadId}`}
            className={styles.logContactNote}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything worth remembering…"
          />
          <div className={styles.logContactChips}>
            {NOTE_SNIPPETS.map((snippet) => (
              <button key={snippet} type="button" className={styles.logSnippet} onClick={() => addSnippet(snippet)}>
                + {snippet}
              </button>
            ))}
          </div>

          <div className={styles.logContactActions}>
            <button type="button" className="btn ghost" disabled={isPending} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={!outcome || isPending} onClick={submit}>
              {isPending ? 'Logging…' : 'Log contact'}
            </button>
          </div>
          {message ? <small className={styles.triageNote} role="status">{message}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
