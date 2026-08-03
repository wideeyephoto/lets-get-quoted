'use client';

import type { SiteChatButtonContent } from '@/lib/site-content';
import {
  CHAT_CHANNEL_LABELS, chatNumberProblem, defaultChatGreeting,
  internationalDigits, isChatChannel, phoneDigits, type ChatChannel,
} from '@/lib/chat-button';
import styles from './SiteEditor.module.css';

// Page → "Message button".
//
// The one thing this screen has to get across is WHICH NUMBER the button will
// use, because the field is empty by default and an empty field looks broken
// rather than inherited. So the placeholder shows the site's own number and a
// line underneath says plainly what a visitor will reach.
//
// It also spells out the country code WhatsApp will send to. A contractor types
// their number the way they say it out loud, WhatsApp needs the international
// form, and the failure mode is invisible from the owner's side — the link just
// tells the VISITOR the number is invalid.

export default function ChatButtonField({
  chatButton,
  sitePhone,
  companyName,
  onChange,
}: {
  chatButton: SiteChatButtonContent;
  sitePhone: string | null;
  companyName: string;
  onChange: (next: SiteChatButtonContent) => void;
}) {
  const channel: ChatChannel = isChatChannel(chatButton.channel) ? chatButton.channel : 'sms';
  const effectiveNumber = chatButton.number.trim() || (sitePhone ?? '').trim();
  const problem = chatButton.number.trim() ? chatNumberProblem(channel, chatButton.number) : '';
  const hasNumber = phoneDigits(effectiveNumber).length >= 10;

  return (
    <>
      <div className={styles.cardGroupLabel}>How they message you</div>
      <div className={styles.chatChannelRow} role="radiogroup" aria-label="Messaging app">
        {(['sms', 'whatsapp'] as const).map((option) => (
          <button
            type="button"
            key={option}
            role="radio"
            aria-checked={channel === option}
            className={`${styles.chatChannelOption} ${channel === option ? styles.chatChannelOn : ''}`}
            onClick={() => onChange({ ...chatButton, channel: option })}
          >
            <strong>{CHAT_CHANNEL_LABELS[option]}</strong>
            <small>
              {option === 'sms'
                ? 'Opens their normal texting app. Works on every phone.'
                : 'Opens WhatsApp. Only useful if you actually use it.'}
            </small>
          </button>
        ))}
      </div>

      <label className={styles.formField}>
        <span>Number to message</span>
        <input
          type="tel"
          inputMode="tel"
          value={chatButton.number}
          maxLength={24}
          placeholder={sitePhone?.trim() || 'e.g. (313) 555-0100'}
          aria-invalid={Boolean(problem)}
          onChange={(event) => onChange({ ...chatButton, number: event.target.value })}
        />
        {problem
          ? <small className={styles.socialFieldError}>{problem}</small>
          : <small className={styles.fieldHint}>
              {chatButton.number.trim()
                ? 'Messages go here instead of your main number.'
                : sitePhone?.trim()
                  ? 'Leave empty to use your main number.'
                  : 'Add a phone number in your intake section, or type one here.'}
            </small>}
      </label>

      {channel === 'whatsapp' && hasNumber && !problem && (
        <p className={styles.fieldHint}>
          WhatsApp will message <strong>+{internationalDigits(effectiveNumber)}</strong>. If that country
          code is wrong, type the number with a + and the right one.
        </p>
      )}

      <label className={styles.formField}>
        <span>Button label</span>
        <input
          value={chatButton.label}
          maxLength={30}
          placeholder={channel === 'whatsapp' ? 'WhatsApp us' : 'Text us'}
          onChange={(event) => onChange({ ...chatButton, label: event.target.value })}
        />
        <small className={styles.fieldHint}>Shown on wide screens; phones get the icon on its own.</small>
      </label>

      <label className={styles.formField}>
        <span>Message it starts with</span>
        <textarea
          value={chatButton.greeting}
          maxLength={160}
          rows={2}
          placeholder={defaultChatGreeting(companyName)}
          onChange={(event) => onChange({ ...chatButton, greeting: event.target.value })}
        />
        <small className={styles.fieldHint}>
          Already typed in for them, so they only add the details. Ending mid-sentence
          (&ldquo;…a quote for &rdquo;) works well — it invites them to finish it.
        </small>
      </label>

      {chatButton.enabled && !hasNumber && (
        <p className={styles.emptyHelper}>
          This button won&apos;t appear until there&apos;s a number for it to message.
        </p>
      )}
    </>
  );
}
