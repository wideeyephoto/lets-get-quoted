import type { Site } from '@/lib/sites';
import { getPublishedChatButton, getPublishedStickyCallBar } from '@/lib/site-content';
import styles from './themes.module.css';

// The floating "Message us" button, shared by every template.
//
// WHERE IT SITS, AND WHY THAT TOOK CARE. On a phone the bottom edge is already
// spoken for by the sticky call bar — full width, fixed, z-index 60 — so a
// button pinned to the bottom-right corner would land on top of "Call now",
// which is the one control a homeowner with a burst pipe is reaching for. It
// lifts clear of the bar when the bar is there, and drops back to the corner
// when it isn't. Desktop is unoccupied: .desktopCta in the stylesheet has no
// renderer, so nothing else is in that corner.
//
// A round bubble rather than a wide pill on phones: it has to coexist with the
// bar rather than compete with it. The label is still in the accessible name.

const SmsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 20.5l1.5-4.2A8.4 8.4 0 0 1 3.6 12a8.4 8.4 0 0 1 8.4-8.4h.5A8.4 8.4 0 0 1 21 11.5Z" />
  </svg>
);

const WhatsAppIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97s-.47-.15-.67.15-.77.96-.94 1.16-.35.22-.65.07a8.1 8.1 0 0 1-2.39-1.47 9 9 0 0 1-1.65-2.06c-.17-.3 0-.46.13-.61s.3-.35.45-.52a2 2 0 0 0 .3-.5.55.55 0 0 0 0-.53c-.08-.15-.67-1.61-.92-2.2s-.49-.51-.67-.52h-.57a1.1 1.1 0 0 0-.8.37 3.35 3.35 0 0 0-1.04 2.48 5.8 5.8 0 0 0 1.22 3.09 13.3 13.3 0 0 0 5.09 4.49c.71.3 1.26.49 1.7.63a4.1 4.1 0 0 0 1.87.12 3.07 3.07 0 0 0 2-1.42 2.5 2.5 0 0 0 .17-1.41c-.07-.13-.27-.2-.57-.35ZM12.05 21.8h-.01a9.8 9.8 0 0 1-4.98-1.36l-.36-.21-3.7.97.99-3.61-.23-.37a9.76 9.76 0 0 1-1.5-5.22 9.82 9.82 0 0 1 16.77-6.94 9.75 9.75 0 0 1 2.88 6.95 9.82 9.82 0 0 1-9.86 9.79ZM20.52 3.45A12.2 12.2 0 0 0 .96 18.16L0 24l6.02-1.58a12.2 12.2 0 0 0 5.83 1.48h.01A12.2 12.2 0 0 0 24 11.7a12.13 12.13 0 0 0-3.48-8.25Z" />
  </svg>
);

export default function SiteChatButton({ site }: { site: Site }) {
  const chat = getPublishedChatButton(site.content, site.phone, site.company_name);
  if (!chat) return null;

  // Only matters for the phone layout, where the bar owns the bottom edge.
  const liftedOverBar = Boolean(getPublishedStickyCallBar(site.content, site.phone));

  return (
    <a
      className={`${styles.chatButton} ${liftedOverBar ? styles.chatButtonLifted : ''}`}
      href={chat.href}
      // WhatsApp is a web URL and should open away from the site; sms: hands off
      // to the OS, where a target would leave an empty tab behind on some
      // browsers.
      {...(chat.channel === 'whatsapp' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      aria-label={`${chat.label} — opens ${chat.channel === 'whatsapp' ? 'WhatsApp' : 'your messaging app'}`}
      data-edit="chatButton"
      data-channel={chat.channel}
    >
      <span className={styles.chatButtonIcon} aria-hidden="true">
        {chat.channel === 'whatsapp' ? WhatsAppIcon : SmsIcon}
      </span>
      <span className={styles.chatButtonLabel}>{chat.label}</span>
    </a>
  );
}
