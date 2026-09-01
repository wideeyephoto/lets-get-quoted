'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import SaveFieldContactButton from '@/components/SaveFieldContactButton';
import { useAssistant } from '@/components/ai-assistant/AssistantProvider';
import { formatUsPhone } from '@/lib/phone';
import { saveOwnerAlertsAction, sendOwnerPhoneVerificationCodeAction } from './actions';
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
 * Section A of the setup dialog: the owner's own number, 2FA verification, and consent.
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
  sharedPhoneNumber,
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
  sharedPhoneNumber?: string;
}) {
  const [state, action] = useFormState(saveOwnerAlertsAction, OWNER_ALERTS_IDLE);
  const errors = state.status === 'error' ? state.errors : [];
  const errorFor = (field: 'phone' | 'consent' | 'form') => errors.find((one) => one.field === field)?.message ?? null;

  let companionName = 'Sparky';
  try {
    const assistant = useAssistant();
    if (assistant?.companion?.name) {
      companionName = assistant.companion.name;
    }
  } catch {
    companionName = 'Sparky';
  }

  const [currentPhone, setCurrentPhone] = useState(phone ?? '');
  const [otpState, setOtpState] = useState<'idle' | 'sending' | 'sent' | 'verified'>('idle');
  const [verificationData, setVerificationData] = useState<{ token: string; expiresAt: number; phone: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const isStoredPhone = Boolean(phone && currentPhone.trim() === phone);
  const phoneHasChanged = Boolean(currentPhone.trim() && currentPhone.trim() !== (phone ?? ''));

  async function handleSendVerification() {
    if (!currentPhone.trim() || disabled) return;
    setOtpState('sending');
    setOtpError(null);

    const result = await sendOwnerPhoneVerificationCodeAction(currentPhone.trim());
    if (result.status === 'sent') {
      setVerificationData({ token: result.token, expiresAt: result.expiresAt, phone: result.phone });
      setOtpState('sent');
      setCountdown(60);
    } else {
      setOtpState('idle');
      setOtpError(result.message);
    }
  }

  /**
   * Whether the ledger already holds an acceptance of the CURRENT wording.
   *
   * Used to say so on screen — never to pre-tick the box. See the checkbox.
   */
  const consentIsCurrent = consent === 'opted_in' && !needsOwnerSmsConsent(consentVersion);
  const consentIsStale = consent === 'opted_in' && needsOwnerSmsConsent(consentVersion);
  const isAlreadyOptedIn = consentIsCurrent && !phoneHasChanged;

  return (
    <form action={action} className="msg-setup-form" noValidate>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Your Let&rsquo;s Get Quoted notifications</legend>

        {/* Hidden inputs for OTP binding & existing consent */}
        <input type="hidden" name="verificationCode" value={otpCode} />
        <input type="hidden" name="verificationToken" value={verificationData?.token ?? ''} />
        <input type="hidden" name="verificationExpiresAt" value={verificationData?.expiresAt ?? ''} />
        {isAlreadyOptedIn ? <input type="hidden" name="alertsConsent" value="on" /> : null}

        <div className="field full msg-setup-phone-field">
          <div className="msg-setup-phone-header">
            <label htmlFor="alertPhone">YOUR MOBILE NUMBER</label>
            {isStoredPhone || otpState === 'verified' ? (
              <span className="msg-setup-verified-badge" title="Phone verified via 2FA">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified number
              </span>
            ) : phoneHasChanged ? (
              <span className="msg-setup-unverified-badge">2FA verification available</span>
            ) : null}
          </div>

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
              value={currentPhone}
              onChange={(e) => {
                setCurrentPhone(e.target.value);
                if (otpState === 'verified') setOtpState('idle');
              }}
              aria-describedby="alertPhone-hint"
              aria-invalid={errorFor('phone') ? true : undefined}
            />

            {phoneHasChanged && otpState !== 'verified' ? (
              <button
                type="button"
                className="msg-setup-verify-trigger"
                disabled={otpState === 'sending' || countdown > 0}
                onClick={handleSendVerification}
              >
                {otpState === 'sending'
                  ? 'Sending…'
                  : otpState === 'sent'
                  ? countdown > 0
                    ? `Resend (${countdown}s)`
                    : 'Resend code'
                  : 'Verify number'}
              </button>
            ) : null}
          </div>

          <small className="field-hint" id="alertPhone-hint">
            Yours, not a customer&rsquo;s. This is the only number we text about your own account.
          </small>
          {errorFor('phone') ? <p className="field-error" role="alert">{errorFor('phone')}</p> : null}
          {otpError ? <p className="field-error" role="alert">{otpError}</p> : null}
        </div>

        {/* 6-Digit Verification Code Prompt */}
        {otpState === 'sent' ? (
          <div className="msg-setup-otp-card">
            <div className="msg-setup-otp-head">
              <span className="msg-setup-otp-title">Enter 6-digit confirmation code</span>
              <span className="msg-setup-otp-sub">
                We texted a verification code to <b>{verificationData?.phone || currentPhone}</b>
              </span>
            </div>
            <div className="msg-setup-otp-row">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                className="msg-setup-otp-input"
                value={otpCode}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpCode(digits);
                  if (digits.length === 6) {
                    setOtpState('verified');
                    setOtpError(null);
                  }
                }}
                autoFocus
              />
              {otpCode.length === 6 ? (
                <span className="msg-setup-otp-ready-badge">✓ Code entered</span>
              ) : null}
            </div>
          </div>
        ) : null}

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
         * The compliance card is presented whenever consent needs to be captured
         * (new setup, changed number, or stale disclosure version). If consent is already
         * current on this number, the card is hidden and the recorded status banner is shown.
         */}
        {!isAlreadyOptedIn ? (
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
        ) : null}

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
        ) : isAlreadyOptedIn && consentedAt ? (
          <div className="msg-setup-banner is-recorded">
            <span className="msg-setup-banner-icon" aria-hidden="true">✓</span>
            <p className="msg-setup-note">
              Consent recorded {new Date(consentedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
            </p>
          </div>
        ) : null}


        {errorFor('form') ? <p className="field-error" role="alert">{errorFor('form')}</p> : null}
        {state.status === 'saved' ? <p className="msg-setup-note is-ready" role="status">{state.message}</p> : null}

        {/* Confirmed Phone -> AI Copilot Field Line Callout */}
        {(isAlreadyOptedIn && (phone || currentPhone)) || otpState === 'verified' || state.status === 'saved' ? (
          <div className="msg-setup-copilot-card">
            <div className="msg-setup-copilot-head">
              <span className="msg-setup-copilot-badge">🎙️ AI Copilot Field Line Ready</span>
              <span className="msg-setup-copilot-num">{formatUsPhone(sharedPhoneNumber || '+19479412323')}</span>
            </div>
            <p className="msg-setup-copilot-text">
              Text notes, material receipts, gate codes, or punch lists to <b>{formatUsPhone(sharedPhoneNumber || '+19479412323')}</b> from your verified mobile ({formatUsPhone(currentPhone || phone || '')}). Your AI Copilot (Currently: {companionName}) organizes and updates job records automatically.
            </p>
            <p className="msg-setup-copilot-voice-tip">
              📞 <b>Hands-Free Dictation:</b> You can also call this number directly from your truck to dictate updates hands-free using your Voice credits.
            </p>
            <div className="msg-setup-copilot-actions">
              <SaveFieldContactButton size="small" label="Save Contact Card (.vcf)" />
              <a href={`sms:${(sharedPhoneNumber || '+19479412323').replace(/[^\d+]/g, '')}`} className="btn secondary sm msg-setup-copilot-btn">
                💬 Text Copilot
              </a>
              <Link href="/dashboard/text-to-job" className="btn quiet sm msg-setup-copilot-link">
                Open Text-to-Job →
              </Link>
            </div>
          </div>
        ) : null}

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


