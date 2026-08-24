'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import { saveOwnerAlertsAction } from './actions';
// The idle state comes from the pure module, not from the action file: a
// 'use server' file may only export async functions, and lib/owner-sms imports
// the service-role client.
import { OWNER_ALERTS_IDLE } from '@/lib/owner-sms-state';
// The wording is imported, never retyped: this exact sentence is what goes to
// the carriers as evidence and what the ledger stamps a version against.
import {
  needsOwnerSmsConsent,
  OWNER_SMS_CONSENT_LABEL,
  OWNER_SMS_DISCLOSURE_JOIN,
  OWNER_SMS_DISCLOSURE_LEAD,
  OWNER_SMS_DISCLOSURE_TAIL,
  OWNER_SMS_PRIVACY_HREF,
  OWNER_SMS_PRIVACY_LABEL,
  OWNER_SMS_TERMS_HREF,
  OWNER_SMS_TERMS_LABEL,
} from '@/lib/owner-sms-disclosure';

/**
 * Section A of the setup dialog: the owner's own number, and their consent.
 *
 * DELIBERATELY NOT A CLOSE-ON-SUCCESS FORM. Every other modal form in the app
 * drops in <CloseOnSuccess/> and shuts on the pending true→false edge. This one
 * must not: it shares a dialog with the customer-texting section, closing on
 * save would take that away mid-read, and — the load-bearing half — a
 * validation error and a successful save produce the same pending edge. A
 * dialog that closes on both is one that reports "saved" by vanishing whether
 * or not anything was.
 *
 * So the result is rendered in place, errors sit under the field they are
 * about, and the dialog closes when the person closes it.
 */
export default function OwnerAlertsForm({
  phone,
  enabled,
  consent,
  consentedAt,
  consentVersion,
  disabled,
}: {
  phone: string | null;
  enabled: boolean;
  /** What the consent ledger says for this number, on this account. */
  consent: 'opted_in' | 'opted_out' | 'none';
  consentedAt: string | null;
  /** Which disclosure they agreed to; null predates versioning. */
  consentVersion: string | null;
  /** True when the settings could not be read — see the note on the fieldset. */
  disabled: boolean;
}) {
  const [state, action] = useFormState(saveOwnerAlertsAction, OWNER_ALERTS_IDLE);
  const errors = state.status === 'error' ? state.errors : [];
  const errorFor = (field: 'phone' | 'consent' | 'form') => errors.find((one) => one.field === field)?.message ?? null;

  /**
   * Whether the ledger already holds an acceptance of the CURRENT wording.
   *
   * Used to say so on screen — never to pre-tick the box. See the checkbox.
   */
  const consentIsCurrent = consent === 'opted_in' && !needsOwnerSmsConsent(consentVersion);
  const consentIsStale = consent === 'opted_in' && needsOwnerSmsConsent(consentVersion);

  return (
    <form action={action} className="msg-setup-form" noValidate>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Your Let&rsquo;s Get Quoted notifications</legend>

        <div className="field full msg-setup-phone-field">
          <label htmlFor="alertPhone">YOUR MOBILE NUMBER</label>
          <div className="msg-setup-input-wrap">
            <span className="msg-setup-input-icon" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <input
              id="alertPhone"
              name="alertPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(248) 555-0100"
              defaultValue={phone ?? ''}
              aria-describedby="alertPhone-hint"
              aria-invalid={errorFor('phone') ? true : undefined}
            />
          </div>
          <small className="field-hint" id="alertPhone-hint">
            Yours, not a customer&rsquo;s. This is the only number we text about your own account.
          </small>
          {errorFor('phone') ? <p className="field-error" role="alert">{errorFor('phone')}</p> : null}
        </div>

        <div className="msg-setup-toggle-card">
          <label className="checkbox-row" htmlFor="alertsEnabled">
            <input id="alertsEnabled" name="alertsEnabled" type="checkbox" defaultChecked={enabled} />
            <span className="msg-setup-toggle-text">
              <b>Text me when a high-value lead comes in</b>
              <small>Instant notification when a homeowner submits a quote request or accepts an estimate</small>
            </span>
          </label>
        </div>

        {/**
         * THE CHECKBOX STARTS EMPTY. ALWAYS. NO EXCEPTION FOR "already agreed".
         *
         * It used to be pre-ticked for anyone with an existing opted-in row, on
         * the reasonable-sounding grounds that the box reflects stored state.
         * It does not: it is the act of agreeing, and a pre-ticked box is the
         * canonical example of what does not count as consent — to the FCC, to
         * the carriers reviewing this campaign, and in the screenshot that goes
         * with the submission. Reflecting the stored state is what the sentence
         * underneath is for.
         *
         * It also means every save is a fresh affirmative act against the
         * wording currently on screen, which is what makes the version stamp in
         * the ledger mean anything. Somebody who agreed to the old sentence has
         * to read this one and tick it again.
         *
         * Both strings come from lib/owner-sms-disclosure rather than being
         * typed here, so what a carrier sees in the screenshot, what the ledger
         * records a version for, and what the tests assert are one string.
         */}
        <div className="msg-setup-compliance-card">
          <div className="msg-setup-compliance-head">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Carrier 10DLC Messaging Consent</span>
          </div>
          <label className="checkbox-row msg-setup-consent" htmlFor="alertsConsent">
            <input
              id="alertsConsent"
              name="alertsConsent"
              type="checkbox"
              defaultChecked={false}
              aria-describedby="alertsConsent-terms"
              aria-invalid={errorFor('consent') ? true : undefined}
            />
            <span>{OWNER_SMS_CONSENT_LABEL}</span>
          </label>
          <p className="msg-setup-terms" id="alertsConsent-terms">
            {OWNER_SMS_DISCLOSURE_LEAD}
            <Link href={OWNER_SMS_TERMS_HREF}>{OWNER_SMS_TERMS_LABEL}</Link>
            {OWNER_SMS_DISCLOSURE_JOIN}
            <Link href={OWNER_SMS_PRIVACY_HREF}>{OWNER_SMS_PRIVACY_LABEL}</Link>
            {OWNER_SMS_DISCLOSURE_TAIL}
          </p>
          {errorFor('consent') ? <p className="field-error" role="alert">{errorFor('consent')}</p> : null}
        </div>

        {/* WHERE THEY STAND TODAY, said plainly. "Stopped" is the one worth
            printing: it is why their phone is quiet, and nothing else on the
            page would tell them. */}
        {consent === 'opted_out' ? (
          <div className="msg-setup-banner is-stopped" role="status">
            <span className="msg-setup-banner-icon" aria-hidden="true">⚠️</span>
            <p className="msg-setup-note is-attention">
              You replied STOP from this number, so nothing is being texted to you. Text START to{' '}
              <b>the same number our alerts came from</b> to turn them back on — we cannot do it from here.
            </p>
          </div>
        ) : consentIsStale ? (
          // Agreed, but to wording we have replaced. Saying "consent recorded"
          // would be true and useless — it is the reason the box is empty.
          <div className="msg-setup-banner is-warning" role="status">
            <span className="msg-setup-banner-icon" aria-hidden="true">ℹ️</span>
            <p className="msg-setup-note is-attention">
              Our texting disclosure has changed since you last agreed. Read it above and tick the box to keep
              these texts coming.
            </p>
          </div>
        ) : consentIsCurrent && consentedAt ? (
          <div className="msg-setup-banner is-recorded">
            <span className="msg-setup-banner-icon" aria-hidden="true">✓</span>
            <p className="msg-setup-note">
              Consent recorded {new Date(consentedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
            </p>
          </div>
        ) : null}

        {errorFor('form') ? <p className="field-error" role="alert">{errorFor('form')}</p> : null}
        {state.status === 'saved' ? <p className="msg-setup-note is-ready" role="status">{state.message}</p> : null}

        <div className="msg-setup-save">
          <SaveButton className="btn primary msg-setup-submit">Save notification settings</SaveButton>
        </div>
      </fieldset>

      {/* Outside the fieldset so it is still readable when everything above is
          disabled — a disabled form with no explanation is just a broken one. */}
      {disabled ? (
        <p className="msg-setup-note is-attention" role="status">
          We could not read your notification settings, so this cannot be saved right now. Nothing has changed.
        </p>
      ) : null}
    </form>
  );
}

