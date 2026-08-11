'use client';

import { useState, useTransition } from 'react';
import { setClientQuoteChangesAction } from './actions';

/**
 * Letting customers change their own extras after they approve.
 *
 * OFF UNTIL A CONTRACTOR TURNS IT ON, and the copy has to be honest about what
 * they are agreeing to rather than selling it. The upside is real — somebody
 * who decides three weeks out that they do want the gate can just tick it, and
 * nobody has to remember a phone call. The downside is equally real: the same
 * box can be unticked, and it might be unticked the evening before, off
 * materials that are already bought.
 *
 * So the guard rails are named here, in full, next to the switch. A contractor
 * deciding this should be able to see exactly where the door shuts without
 * opening a help article.
 */
export default function QuoteChangesSection({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const [pending, startSaving] = useTransition();

  function toggle(next: boolean) {
    const previous = on;
    setOn(next);
    setFailed(false);
    startSaving(async () => {
      try {
        await setClientQuoteChangesAction(next);
      } catch {
        setOn(previous);
        setFailed(true);
      }
    });
  }

  return (
    <section className="panel workspace-section-card" id="quote-changes">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Customer-facing</p>
        <h2>Let customers change their own extras</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        With this on, a customer who has already approved can add or drop the <strong>optional extras</strong> on their quote
        from the same link, and you get an email the moment they do. They can never touch the base scope, the base price, or
        anything on a recurring plan — those are your quote, not a menu.
      </p>

      {/* The switch the rest of Settings already uses, rather than a fourth one
          invented for this card. */}
      <label className="intake-toggle">
        <input type="checkbox" checked={on} disabled={pending} onChange={(event) => toggle(event.target.checked)} />
        <span className="intake-toggle-track" aria-hidden="true"><span /></span>
        <span className="intake-toggle-copy">
          <strong>{on ? 'On — customers can change their extras' : 'Off — only you can change an approved quote'}</strong>
          <small>
            {on
              ? 'Until the job starts. You are emailed the moment anything moves.'
              : 'A customer who wants something changed has to ask you, and you edit the quote.'}
          </small>
        </span>
      </label>

      <div className="quote-changes-rules">
        <p className="quote-changes-rules-head">It shuts on its own when:</p>
        <ul>
          <li>the job&rsquo;s start date arrives — closed from the first minute of that day, not the end of it</li>
          <li>anybody presses <strong>Job started</strong>, whatever the calendar says</li>
          <li>a payment plan has been authorized, because the installments are already set against a total</li>
          <li>the change would take the total below what they have already paid you</li>
        </ul>
        <p className="field-hint">
          Worth knowing before you switch it on: they can remove work as well as add it. If you order materials well ahead,
          leave this off and let them ask you instead.
        </p>
      </div>

      <p className="field-hint" role="status">
        {failed ? 'That did not save. Check your connection and try again.' : pending ? 'Saving…' : ''}
      </p>
    </section>
  );
}
