'use client';

import { useState } from 'react';
import ChannelToggles from '@/components/channel-toggles';
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
 * THE CHOICE IS ON THIS FORM NOW, NOT ONLY ON THE JOB AFTERWARDS.
 * It used to be a single tick-box that could say only "send" or "don't", and
 * 'auto' means text-first — so a contractor who had just typed a customer's
 * email address in, and wanted the quote to go there, had no way to say so.
 * The setting existed; it lived on the job page, which is the page you reach
 * AFTER the quote has already gone out by text. Two toggles, here, before.
 *
 * The choice is still stored against the client rather than spent on this one
 * send, so the appointment reminder three weeks later honours the same
 * instruction. That is the difference between a consent control and a checkbox.
 */
export default function QuoteDeliveryPreview({
  phone,
  email,
  preference,
}: {
  phone: string | null;
  email: string | null;
  /** What is already stored for this lead. 'off' starts both toggles off. */
  preference: ClientChannelPreference;
}) {
  const [channel, setChannel] = useState<ClientChannelPreference>(preference);

  const preview = clientChannelPreview(
    { phone, email, preference: channel },
    {
      what: 'It carries a secure link to view and approve the quote.',
      fallbackAction: 'You’ll get a link on the next screen to copy and send yourself.',
      formatPhone: formatPhoneDashes,
    },
  );

  return (
    <div className={styles.quoteDelivery}>
      <ChannelToggles
        value={channel}
        onChange={setChannel}
        phone={phone}
        email={email}
        formatPhone={formatPhoneDashes}
        legacyCheckboxId="sendClientTextCheckbox"
        legacyCheckboxName="sendClientText"
      />

      {/* aria-live, because this is the one thing on the form that answers
          "what happens when I press send" and it changes without navigating. */}
      <div className={styles.quotePreview} data-tone={preview.tone} aria-live="polite">
        <span>Your client will receive</span>
        <p>
          <strong>{preview.icon} {preview.headline}</strong>
          {preview.detail ? ` — ${preview.detail}` : ''}
        </p>
        {/* Only worth saying when it can actually happen. Both switches on and
            both details present is the only shape where a failed text has
            somewhere to go — see smsFailureFallback. */}
        {channel === 'auto' && phone && email ? (
          <p className={styles.quotePreviewFallback}>If the text doesn’t go through, we email it instead.</p>
        ) : null}
      </div>
    </div>
  );
}
