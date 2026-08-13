'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import { saveOwnerAlertsAction } from './actions';
// The idle state comes from the pure module, not from the action file: a
// 'use server' file may only export async functions, and lib/owner-sms imports
// the service-role client.
import { OWNER_ALERTS_IDLE } from '@/lib/owner-sms-state';

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
  disabled,
}: {
  phone: string | null;
  enabled: boolean;
  /** What the consent ledger says for this number, on this account. */
  consent: 'opted_in' | 'opted_out' | 'none';
  consentedAt: string | null;
  /** True when the settings could not be read — see the note on the fieldset. */
  disabled: boolean;
}) {
  const [state, action] = useFormState(saveOwnerAlertsAction, OWNER_ALERTS_IDLE);
  const errors = state.status === 'error' ? state.errors : [];
  const errorFor = (field: 'phone' | 'consent' | 'form') => errors.find((one) => one.field === field)?.message ?? null;

  /**
   * UNCHECKED THE FIRST TIME, ALWAYS.
   *
   * Consent that arrives pre-ticked is not consent, and this is the one field
   * on the page where that is a legal statement rather than a preference. It is
   * only ever checked by default for somebody who has already given it — which
   * is what `consent === 'opted_in'` means, because that row is written by this
   * form and nothing else. `none` is a first-time owner and gets an empty box.
   *
   * Somebody who replied STOP also gets an empty box, and re-ticking it will
   * not bring them back: ensureSmsConsentBaseline never overwrites an existing
   * row. Only a START from their own handset can, which is what an opt-out is.
   */
  const alreadyConsented = consent === 'opted_in';

  return (
    <form action={action} className="msg-setup-form" noValidate>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Your Let&rsquo;s Get Quoted notifications</legend>

        <div className="field full">
          <label htmlFor="alertPhone">Your mobile number</label>
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
          <small className="field-hint" id="alertPhone-hint">
            Yours, not a customer&rsquo;s. This is the only number we text about your own account.
          </small>
          {errorFor('phone') ? <p className="field-error" role="alert">{errorFor('phone')}</p> : null}
        </div>

        <label className="checkbox-row" htmlFor="alertsEnabled">
          <input id="alertsEnabled" name="alertsEnabled" type="checkbox" defaultChecked={enabled} />
          <span>Text me when a high-value lead comes in</span>
        </label>

        {/* THE DISCLOSURE, IN FULL, WHERE THE BOX IS.
            Frequency, rates, STOP, HELP, and that agreeing is not a condition of
            buying anything — all five, next to the checkbox rather than on a
            public page nobody is looking at. This is what "Standard rates
            apply." was standing in for. */}
        <label className="checkbox-row msg-setup-consent" htmlFor="alertsConsent">
          <input
            id="alertsConsent"
            name="alertsConsent"
            type="checkbox"
            defaultChecked={alreadyConsented}
            aria-describedby="alertsConsent-terms"
            aria-invalid={errorFor('consent') ? true : undefined}
          />
          <span>
            I agree to receive account notification texts from Let&rsquo;s Get Quoted at the number above.
          </span>
        </label>
        <p className="msg-setup-terms" id="alertsConsent-terms">
          Message frequency varies with your lead volume. Message and data rates may apply. Reply STOP to
          stop, HELP for help. Consent is not a condition of purchase. See our{' '}
          <Link href="/sms-terms">SMS terms</Link> and <Link href="/privacy">privacy policy</Link>.
        </p>
        {errorFor('consent') ? <p className="field-error" role="alert">{errorFor('consent')}</p> : null}

        {/* WHERE THEY STAND TODAY, said plainly. "Stopped" is the one worth
            printing: it is why their phone is quiet, and nothing else on the
            page would tell them. */}
        {consent === 'opted_out' ? (
          <p className="msg-setup-note is-attention" role="status">
            You replied STOP from this number, so nothing is being texted to you. Text START to{' '}
            <b>the same number our alerts came from</b> to turn them back on — we cannot do it from here.
          </p>
        ) : consentedAt ? (
          <p className="msg-setup-note">
            Consent recorded {new Date(consentedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
          </p>
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
