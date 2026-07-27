'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import SaveButton from '@/components/save-button';
import LeadTriageActions from './LeadTriageActions';
import LogContactControl from './LogContactControl';
import UndoQuoteButton from './UndoQuoteButton';
import styles from '../leads.module.css';

type LayoutKey = 'guided' | 'primary';
type WorkflowState = 'newLead' | 'estimateScheduled' | 'converted';

type LeadActionDeckProps = {
  initialLayout: LayoutKey;
  leadId: string;
  status: string;
  workflowState: WorkflowState;
  convertedJobId: string | null;
  convertedJobLabel: string;
  hasPhone: boolean;
  snoozed: boolean;
  archived: boolean;
  declinedReason: string | null;
  leadName: string;
  businessName: string;
  markWon: () => Promise<void>;
  markLost: () => Promise<void>;
  markContacted: () => Promise<void>;
  undoConvert: () => Promise<void>;
  setLayoutAction: (layout: LayoutKey) => Promise<void>;
};

// The single source of truth for a lead's action hierarchy. Renders both
// layouts — "Guided" (a recommended next step with the rest tucked away) and
// "One primary + actions" (everything inline behind a loud primary) — and lets
// each user switch via the gear. The choice is remembered in a cookie so the
// next lead opens in the same layout.
export default function LeadActionDeck({
  initialLayout,
  leadId,
  status,
  workflowState,
  convertedJobId,
  convertedJobLabel,
  hasPhone,
  snoozed,
  archived,
  declinedReason,
  leadName,
  businessName,
  markWon,
  markLost,
  markContacted,
  undoConvert,
  setLayoutAction,
}: LeadActionDeckProps) {
  const [layout, setLayout] = useState<LayoutKey>(initialLayout);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (gearRef.current && !gearRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function choose(next: LayoutKey) {
    setLayout(next);
    setMenuOpen(false);
    startTransition(() => {
      // Persist for the next lead; failure is non-fatal (the live toggle already applied).
      setLayoutAction(next).catch(() => {});
    });
  }

  // A won/lost lead can exist without a scheduled estimate or a job, so the
  // stage has to consider status too — otherwise "Mark won" wrongly falls back
  // to "schedule the estimate". converted (a real job) always wins.
  const stage: 'new' | 'scheduled' | 'won' | 'converted' | 'lost' =
    workflowState === 'converted'
      ? 'converted'
      : status === 'won'
        ? 'won'
        : status === 'lost'
          ? 'lost'
          : workflowState === 'estimateScheduled'
            ? 'scheduled'
            : 'new';

  const primaryCta =
    stage === 'new' ? (
      <Link className="btn primary" href="#availability-snapshot">Schedule estimate</Link>
    ) : stage === 'scheduled' ? (
      <Link className="btn primary" href="#lead-estimate">Send the quote</Link>
    ) : stage === 'won' ? (
      <Link className="btn primary" href="#lead-estimate">Send quote &amp; create job</Link>
    ) : stage === 'lost' ? (
      <form action={markContacted}><SaveButton className="btn primary">Reopen lead</SaveButton></form>
    ) : (
      <Link className="btn primary" href={`/dashboard/jobs/${convertedJobId}`}>{convertedJobLabel}</Link>
    );

  const skipToQuote =
    stage === 'new' ? (
      <Link className={styles.btnSkip} href="#lead-estimate">
        <span className={styles.zap} aria-hidden="true">⚡</span> Skip to quote
      </Link>
    ) : null;

  const altAction =
    stage === 'new' ? (
      skipToQuote
    ) : stage === 'scheduled' ? (
      <Link className="btn secondary" href="#availability-snapshot">Review scheduled estimate</Link>
    ) : stage === 'converted' ? (
      <UndoQuoteButton action={undoConvert} />
    ) : null;

  const guidance =
    stage === 'new'
      ? { icon: '📅', heading: 'Next step — schedule the estimate', why: 'New request — book the visit before this lead cools off.' }
      : stage === 'scheduled'
        ? { icon: '📝', heading: 'Next step — send the quote', why: 'The estimate is on the calendar — send the quote when you are ready.' }
        : stage === 'won'
          ? { icon: '🎉', heading: 'You won it — send the quote & create the job', why: 'Lock this lead in by sending the quote, which opens the job.' }
          : stage === 'lost'
            ? { icon: '🗂️', heading: 'This lead is marked lost', why: 'Reopen it if the homeowner comes back around.' }
            : { icon: '✅', heading: 'Open the job', why: 'This lead has been converted into a job.' };

  const statusButtons = (
    <>
      {status === 'new' ? (
        <LogContactControl leadId={leadId} isFirst />
      ) : status === 'contacted' || status === 'quoted' ? (
        <LogContactControl leadId={leadId} />
      ) : null}
      {status !== 'won' ? <form action={markWon}><SaveButton className="btn ghost">Mark won</SaveButton></form> : null}
      {status !== 'lost' ? <form action={markLost}><SaveButton className="btn ghost">Mark lost</SaveButton></form> : null}
      {status === 'won' || status === 'lost' ? <form action={markContacted}><SaveButton className="btn ghost">Reopen</SaveButton></form> : null}
    </>
  );

  const triage = (
    <LeadTriageActions leadId={leadId} hasPhone={hasPhone} snoozed={snoozed} archived={archived} declinedReason={declinedReason} leadName={leadName} businessName={businessName} />
  );

  return (
    <div className={styles.actionDeck} data-layout={layout} ref={gearRef}>
      <div className={styles.deckGear}>
        <button
          type="button"
          className={styles.deckGearBtn}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Switch layout"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {menuOpen ? (
          <div className={styles.deckGearPop} role="menu">
            <p>Action layout</p>
            <button type="button" role="menuitemradio" aria-checked={layout === 'guided'} className={styles.deckGearOpt} onClick={() => choose('guided')}>
              Guided next step <small>Default</small>
            </button>
            <button type="button" role="menuitemradio" aria-checked={layout === 'primary'} className={styles.deckGearOpt} onClick={() => choose('primary')}>
              One primary + actions
            </button>
          </div>
        ) : null}
      </div>

      {layout === 'guided' ? (
        <div className={styles.deckGuided}>
          <div className={styles.nba} data-tone={stage === 'lost' ? 'muted' : stage === 'won' ? 'win' : undefined}>
            <span className={styles.nbaIcon} aria-hidden="true">{guidance.icon}</span>
            <div className={styles.nbaText}>
              <strong>{guidance.heading}</strong>
              <span>{guidance.why}</span>
            </div>
            {primaryCta}
          </div>
          {altAction ? (
            <div className={styles.guidedAlt}>
              <span>or</span>
              {altAction}
            </div>
          ) : null}
          <details className={styles.moreActions}>
            <summary>More actions</summary>
            <div className={styles.moreActionsBody}>
              <div className={styles.deckStatusRow}>
                <span className={styles.deckLabel}>Update status</span>
                {statusButtons}
              </div>
              {triage}
            </div>
          </details>
        </div>
      ) : (
        <div className={styles.deckPrimary}>
          <div className={styles.deckPrimaryRow}>
            {primaryCta}
            {altAction}
          </div>
          <div className={styles.deckStatusRow}>
            <span className={styles.deckLabel}>Update status</span>
            {statusButtons}
          </div>
          {triage}
        </div>
      )}
    </div>
  );
}
