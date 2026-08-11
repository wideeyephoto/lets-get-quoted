'use client';

import { useState } from 'react';
import { clientChannelPreview, type ClientChannelPreference } from '@/lib/client-channel';
import { formatPhoneDashes } from '@/lib/phone';
import styles from '../leads.module.css';

/**
 * The send switch and the sentence describing what it does — as one thing.
 *
 * They were two, and they disagreed. The checkbox said "Text quote and sign-off
 * link"; the paragraph under it was rendered from the lead's phone number alone,
 * so it read "📱 A text to 248-555-0117" whether the box was ticked or not, and
 * whether the customer was reachable by text or not. Unticking the only consent
 * control on the page changed nothing on screen, which is the worst possible
 * behavior for a control whose entire job is to stop a message going out.
 *
 * Now the same call decides both — resolveClientChannel, the one that
 * convertLeadAction uses to actually send. The preview cannot describe a send
 * that will not happen, because it is not a description of the send; it is the
 * decision, rendered.
 *
 * The checkbox also stopped being a per-request whim. Unticking it stores "no
 * automatic messages" against this client and carries it to the job, so the
 * appointment reminder three weeks later honours the same instruction. That is
 * the difference between a consent control and a checkbox.
 */
export default function QuoteDeliveryPreview({
  phone,
  email,
  preference,
}: {
  phone: string | null;
  email: string | null;
  /** What is already stored for this lead. 'off' starts the box unticked. */
  preference: ClientChannelPreference;
}) {
  const [send, setSend] = useState(preference !== 'off');

  // Ticking the box on a client previously set to 'off' returns them to 'auto'
  // rather than resurrecting a channel choice they never made.
  const effective: ClientChannelPreference = send ? (preference === 'off' ? 'auto' : preference) : 'off';
  const preview = clientChannelPreview(
    { phone, email, preference: effective },
    {
      what: 'It carries a secure link to view and approve the quote.',
      fallbackAction: 'You’ll get a link on the next screen to copy and send yourself.',
      formatPhone: formatPhoneDashes,
    },
  );

  return (
    <>
      <label className={`sms-consent-check ${styles.quoteTextCheck}`}>
        <input
          id="sendClientTextCheckbox"
          name="sendClientText"
          type="checkbox"
          checked={send}
          onChange={(event) => setSend(event.target.checked)}
        />
        <span>
          <strong>Send this client their quote</strong>
          <small>
            Leave it unticked and nothing goes out automatically — not this quote, and not the reminders after it.
            You can change that any time on the job.
          </small>
        </span>
      </label>

      {/* Submitted alongside the box so the server stores a preference rather
          than inferring one from a checkbox it cannot see the history of. */}
      <input type="hidden" name="messageChannel" value={effective} />

      {/* aria-live, because this is the one thing on the form that answers
          "what happens when I press send" and it changes without navigating. */}
      <div className={styles.quotePreview} data-tone={preview.tone} aria-live="polite">
        <span>Your client will receive</span>
        <p>
          <strong>{preview.icon} {preview.headline}</strong>
          {preview.detail ? ` — ${preview.detail}` : ''}
        </p>
      </div>
    </>
  );
}
