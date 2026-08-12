'use client';

import { useEffect, useRef } from 'react';
import {
  preferenceForToggles,
  togglesForPreference,
  type ClientChannelPreference,
} from '@/lib/client-channel';

/**
 * MAY WE TEXT THEM? MAY WE EMAIL THEM? TWO BUTTONS.
 *
 * This replaces a <select> whose options were sentences — "Text, or email if
 * there's no mobile" — which asked somebody to parse a rule in order to answer
 * a question they already knew the answer to. The four stored values are really
 * two independent yes/nos, so they are shown as two, and the mapping back is
 * exact: see togglesForPreference in lib/client-channel. Nothing about the
 * column or the send logic changed.
 *
 * EACH BUTTON NAMES ITS OWN DESTINATION. "Text" on its own is a promise the
 * form cannot keep — this customer may have no mobile — so the number or the
 * address is printed under the label, and a channel with nothing to send to is
 * shown switched off and disabled, saying which detail is missing. That is the
 * difference between a control that is off and one that cannot be on.
 *
 * role="switch" rather than a styled checkbox: these are two independent binary
 * states, which is exactly what a switch is, and it means a screen reader says
 * "Text, on" instead of reading a decorative tick.
 */
export default function ChannelToggles({
  value,
  onChange,
  phone,
  email,
  formatPhone,
  /** Rendered as a hidden mirror so QuoteStartDateCalendar can still watch it. */
  legacyCheckboxId,
  name = 'messageChannel',
  legacyCheckboxName,
}: {
  value: ClientChannelPreference;
  onChange: (next: ClientChannelPreference) => void;
  phone: string | null;
  email: string | null;
  formatPhone?: (phone: string) => string;
  legacyCheckboxId?: string;
  name?: string;
  legacyCheckboxName?: string;
}) {
  const toggles = togglesForPreference(value);
  const showPhone = formatPhone && phone ? formatPhone(phone) : phone;
  const mirror = useRef<HTMLInputElement>(null);

  // A controlled checkbox fires no 'change' when React sets its value, and the
  // listener below is the whole reason the element exists. Dispatched by hand
  // so the watcher sees the same event it always did.
  useEffect(() => {
    mirror.current?.dispatchEvent(new Event('change', { bubbles: true }));
  }, [toggles.sms]);

  function set(channel: 'sms' | 'email', on: boolean) {
    onChange(preferenceForToggles({ ...toggles, [channel]: on }));
  }

  return (
    <div className="chan-toggles">
      <p className="chan-toggles-label">How this goes out</p>
      <div className="chan-toggles-row">
        <ChannelButton
          icon="💬"
          label="Text"
          to={showPhone}
          missing="No mobile on file"
          on={toggles.sms}
          onToggle={(on) => set('sms', on)}
        />
        <ChannelButton
          icon="📧"
          label="Email"
          to={email}
          missing="No email on file"
          on={toggles.email}
          onToggle={(on) => set('email', on)}
        />
      </div>

      {/* The value the server stores. One field, whichever way the two
          buttons happen to be sitting. */}
      <input type="hidden" name={name} value={value} />

      {/* A REAL CHECKBOX, HIDDEN, MIRRORING "will a text go out".
          QuoteStartDateCalendar watches this element by id and listens for
          'change' to decide whether to draw its own scheduling-consent box —
          it predates these toggles, and quietly deleting the thing it reads
          would have left that box rendering on a path where the text already
          carries consent. Kept in the DOM, kept in sync, and it still posts
          the older field name so a server reading either shape agrees. */}
      {legacyCheckboxId ? (
        <input
          ref={mirror}
          id={legacyCheckboxId}
          name={legacyCheckboxName}
          type="checkbox"
          className="chan-toggles-mirror"
          tabIndex={-1}
          aria-hidden="true"
          checked={toggles.sms}
          readOnly
        />
      ) : null}
    </div>
  );
}

function ChannelButton({
  icon,
  label,
  to,
  missing,
  on,
  onToggle,
}: {
  icon: string;
  label: string;
  to: string | null;
  missing: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  const available = Boolean(to);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={available && on}
      aria-label={`${label} — ${available ? to : missing}`}
      disabled={!available}
      className={`chan-toggle${available && on ? ' is-on' : ''}${available ? '' : ' is-missing'}`}
      onClick={() => onToggle(!on)}
    >
      <span className="chan-toggle-mark" aria-hidden="true">
        {available && on ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        ) : null}
      </span>
      <span className="chan-toggle-text">
        <strong>
          <span aria-hidden="true">{icon}</span> {label}
        </strong>
        <small>{available ? to : missing}</small>
      </span>
    </button>
  );
}
