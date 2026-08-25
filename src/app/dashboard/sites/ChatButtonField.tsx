'use client';

import Link from 'next/link';
import type { SiteChatButtonContent } from '@/lib/site-content';
import {
  CHAT_CHANNEL_LABELS, chatNumberProblem, defaultChatGreeting,
  internationalDigits, isChatChannel, phoneDigits, type ChatChannel,
} from '@/lib/chat-button';
import { displayPhone } from '@/lib/phone';
import type { MessagingSetup } from '@/lib/owner-sms';
import styles from './SiteEditor.module.css';

// Page → "Message button".
//
// Integrates the floating website SMS/WhatsApp button with Let's Get Quoted's
// Texting Setup and Messages inbox.
//
// If the contractor has an approved dedicated customer-texting number from
// Texting Setup, inquiries from the website route through /api/sms/inbound into
// their dashboard Messages inbox. If not, inquiries fall back to their business
// mobile in their phone's native SMS app.

export default function ChatButtonField({
  chatButton,
  sitePhone,
  companyName,
  messagingSetup,
  onChange,
}: {
  chatButton: SiteChatButtonContent;
  sitePhone: string | null;
  companyName: string;
  messagingSetup?: MessagingSetup;
  onChange: (next: SiteChatButtonContent) => void;
}) {
  const channel: ChatChannel = isChatChannel(chatButton.channel) ? chatButton.channel : 'sms';

  const registration = messagingSetup?.registration;
  const dedicatedNumber =
    registration && registration.kind === 'ok' && registration.status === 'approved' && registration.assignedNumber
      ? registration.assignedNumber
      : null;

  const effectiveDefaultNumber = dedicatedNumber || (sitePhone ?? '').trim();
  const effectiveNumber = chatButton.number.trim() || effectiveDefaultNumber;
  const problem = chatButton.number.trim() ? chatNumberProblem(channel, chatButton.number) : '';
  const hasNumber = phoneDigits(effectiveNumber).length >= 10;

  const isUsingDedicated =
    Boolean(dedicatedNumber) &&
    (phoneDigits(chatButton.number) === phoneDigits(dedicatedNumber!) || (!chatButton.number.trim() && !sitePhone));

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

      {channel === 'sms' && (
        <div className={styles.chatIntegrationBox}>
          <div className={styles.chatIntegrationHead}>
            <span className={styles.chatIntegrationTitle}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Messages &amp; Texting Setup
            </span>
            {dedicatedNumber ? (
              <span className={`${styles.chatIntegrationBadge} ${styles.chatBadgeReady}`}>
                LGQ Inbox Connected
              </span>
            ) : registration?.kind === 'ok' && (registration.status === 'submitted' || registration.status === 'in_review') ? (
              <span className={`${styles.chatIntegrationBadge} ${styles.chatBadgePending}`}>
                Registration in review
              </span>
            ) : registration?.kind === 'ok' && (registration.status === 'action_required' || registration.status === 'rejected') ? (
              <span className={`${styles.chatIntegrationBadge} ${styles.chatBadgeAttention}`}>
                Action required
              </span>
            ) : (
              <span className={`${styles.chatIntegrationBadge} ${styles.chatBadgeNeutral}`}>
                Personal mobile fallback
              </span>
            )}
          </div>

          <p className={styles.chatIntegrationBody}>
            {dedicatedNumber
              ? isUsingDedicated
                ? 'Inbound texts from the website button route directly to your Let’s Get Quoted Messages inbox.'
                : 'You have an active dedicated texting number. Tap below to route website messages into your dashboard inbox.'
              : 'Website texts currently open on your personal mobile phone. To receive and manage customer texts directly inside your Let’s Get Quoted inbox, get a dedicated business number.'}
          </p>

          {dedicatedNumber && (
            <div className={styles.chatNumberChips}>
              <button
                type="button"
                className={`${styles.chatNumberChip} ${isUsingDedicated ? styles.chatNumberChipActive : ''}`}
                onClick={() => onChange({ ...chatButton, number: dedicatedNumber })}
              >
                💬 Use LGQ Inbox Number ({displayPhone(dedicatedNumber)})
              </button>
              {sitePhone && (
                <button
                  type="button"
                  className={`${styles.chatNumberChip} ${!isUsingDedicated && phoneDigits(chatButton.number) === phoneDigits(sitePhone) ? styles.chatNumberChipActive : ''}`}
                  onClick={() => onChange({ ...chatButton, number: sitePhone })}
                >
                  📱 Use Main Business Phone ({displayPhone(sitePhone)})
                </button>
              )}
            </div>
          )}

          <div>
            <Link href="/dashboard/messages?setup=1#texting-setup" className={styles.chatIntegrationLink}>
              {dedicatedNumber ? 'Manage Texting setup →' : 'Open Texting setup to enable 2-way inbox →'}
            </Link>
          </div>
        </div>
      )}

      <label className={styles.formField}>
        <span>Number to message</span>
        <input
          type="tel"
          inputMode="tel"
          value={chatButton.number}
          maxLength={24}
          placeholder={
            dedicatedNumber
              ? displayPhone(dedicatedNumber)
              : sitePhone?.trim()
                ? displayPhone(sitePhone)
                : 'e.g. (313) 555-0100'
          }
          aria-invalid={Boolean(problem)}
          onChange={(event) => onChange({ ...chatButton, number: event.target.value })}
        />
        {problem ? (
          <small className={styles.socialFieldError}>{problem}</small>
        ) : (
          <small className={styles.fieldHint}>
            {chatButton.number.trim() ? (
              dedicatedNumber && phoneDigits(chatButton.number) === phoneDigits(dedicatedNumber) ? (
                'Using your dedicated LGQ number — messages land in your Messages inbox.'
              ) : (
                'Messages go to this number in your mobile texting app.'
              )
            ) : dedicatedNumber ? (
              'Leave empty to use your dedicated LGQ texting number.'
            ) : sitePhone?.trim() ? (
              'Leave empty to use your main business number.'
            ) : (
              'Add a phone number in your intake section, or type one here.'
            )}
          </small>
        )}
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
