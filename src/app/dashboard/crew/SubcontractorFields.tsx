'use client';

import { useState } from 'react';
import AddressAutocomplete from '@/components/address-autocomplete';
import { SEED_TRADES } from '@/lib/subcontractor-form';
import {
  AGREEMENT_STATUSES,
  AGREEMENT_STATUS_LABEL,
  RATE_PREFERENCES,
  RATE_PREFERENCE_LABEL,
  SUB_STATUSES,
  SUB_STATUS_HINT,
  SUB_STATUS_LABEL,
  W9_STATUSES,
  W9_STATUS_LABEL,
  type SubcontractorProfile,
} from '@/lib/subcontractors';
import {
  CREW_SMS_CONSENT_LABEL,
  CREW_SMS_DISCLOSURE,
  CREW_SMS_DISCLOSURE_VERSION,
} from '@/lib/crew-sms-disclosure';
import { normalizeUsPhone } from '@/lib/phone';
import { formatPhoneAsTyped } from './AddCrewDrawer';
import styles from './dispatch.module.css';

/**
 * Every field a subcontractor profile has, rendered once.
 *
 * SHARED BY THE ADD DRAWER AND THE EDIT DRAWER on purpose. There are twenty-odd
 * fields here and half of them decide whether somebody gets offered work; two
 * copies of that list is two places for "insurance expires" to be present on
 * one screen and missing on the other, which is exactly how a firm ends up
 * permanently un-matchable with no visible reason why.
 *
 * Uncontrolled except for the three that need behavior: the phone (formatted
 * as typed), the rate preference (decides which amount box is shown) and the
 * trades (a checkbox set plus a free-text field, both posting to `trades`, which
 * readSubcontractorForm merges and de-duplicates).
 */
export default function SubcontractorFields({
  idPrefix,
  profile,
  knownTrades,
  contactName = '',
  phone: initialPhone = '',
  email = '',
  baseAddress = '',
}: {
  idPrefix: string;
  /** Null when adding — every field opens on its sensible default. */
  profile: SubcontractorProfile | null;
  /** Trades already used by this account's subs, so the list speaks their words. */
  knownTrades: string[];
  contactName?: string;
  phone?: string;
  email?: string;
  baseAddress?: string;
}) {
  const [phone, setPhone] = useState(formatPhoneAsTyped(initialPhone));
  const phoneChanged = Boolean(
    normalizeUsPhone(phone) && normalizeUsPhone(initialPhone) !== normalizeUsPhone(phone),
  );
  const [ratePreference, setRatePreference] = useState(profile?.ratePreference ?? 'fixed');
  const tradeOptions = [...new Set([...knownTrades, ...SEED_TRADES])].sort((a, b) => a.localeCompare(b));
  const chosen = new Set((profile?.trades ?? []).map((trade) => trade.toLowerCase()));
  // Anything on this firm that is not in the offered list still has to survive a
  // save — otherwise editing a phone number silently deletes a trade.
  const extraTrades = (profile?.trades ?? []).filter(
    (trade) => !tradeOptions.some((option) => option.toLowerCase() === trade.toLowerCase()),
  );

  return (
    <>
      <fieldset className={styles.formSection}>
        <legend>Who they are</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${idPrefix}-name`}>Contact name</label>
            <input id={`${idPrefix}-name`} name="name" required defaultValue={contactName} placeholder="AJ Rivera" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-company`}>Company name</label>
            <input
              id={`${idPrefix}-company`}
              name="companyName"
              defaultValue={profile?.companyName ?? ''}
              placeholder="Apex Plumbing"
              autoComplete="off"
            />
            <small className="field-hint">Left blank for a one-person outfit trading under their own name.</small>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-phone`}>Mobile number</label>
            <input
              id={`${idPrefix}-phone`}
              name="phone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="off"
              placeholder="(248) 555-0117"
              value={phone}
              onChange={(event) => setPhone(formatPhoneAsTyped(event.target.value))}
              aria-describedby={`${idPrefix}-phone-why`}
            />
            <small id={`${idPrefix}-phone-why`} className="field-hint">
              A job offer is a text. A subcontractor with no number is never asked.
            </small>
          </div>
          <div className="field full">
            <label className="checkbox-row" htmlFor={`${idPrefix}-crew-sms-consent`}>
              <input
                id={`${idPrefix}-crew-sms-consent`}
                name="crewSmsConsent"
                type="checkbox"
                required={!profile || phoneChanged}
                aria-describedby={`${idPrefix}-crew-sms-disclosure`}
              />
              <span>{CREW_SMS_CONSENT_LABEL}</span>
            </label>
            <p id={`${idPrefix}-crew-sms-disclosure`} className="field-hint">
              {CREW_SMS_DISCLOSURE}{' '}
              <a href="/sms-terms" target="_blank" rel="noreferrer">
                SMS Terms
              </a>
              {' and '}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
              .
            </p>
            <input type="hidden" name="crewSmsDisclosureVersion" value={CREW_SMS_DISCLOSURE_VERSION} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-email`}>Email address</label>
            <input id={`${idPrefix}-email`} name="email" type="email" defaultValue={email} placeholder="aj@apexplumbing.com" autoComplete="off" />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>Trades and skills</legend>
        <div className="form-grid">
          <div className="field full">
            <fieldset className={styles.checkGrid}>
              <legend className={styles.checkGridLegend}>Trades</legend>
              {tradeOptions.map((trade) => (
                <label key={trade} className={styles.checkChip} htmlFor={`${idPrefix}-trade-${trade}`}>
                  <input
                    id={`${idPrefix}-trade-${trade}`}
                    type="checkbox"
                    name="trades"
                    value={trade}
                    defaultChecked={chosen.has(trade.toLowerCase())}
                  />
                  <span>{trade}</span>
                </label>
              ))}
            </fieldset>
            <input
              className={styles.inlineInput}
              name="trades"
              defaultValue={extraTrades.join(', ')}
              placeholder="Anything not on the list, comma separated"
              aria-label="Other trades"
            />
          </div>
          <div className="field full">
            <label htmlFor={`${idPrefix}-skills`}>Skills</label>
            <input
              id={`${idPrefix}-skills`}
              name="skills"
              defaultValue={(profile?.skills ?? []).join(', ')}
              placeholder="Tankless, backflow certified, permit pulling"
            />
            <small className="field-hint">Comma separated. A job request can ask for these on top of the trade.</small>
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>Where and when they work</legend>
        <div className="form-grid">
          <div className="field full">
            <label htmlFor={`${idPrefix}-base`}>Shop or home base</label>
            <AddressAutocomplete
              id={`${idPrefix}-base`}
              name="baseAddress"
              defaultValue={baseAddress}
              placeholder="Where they set out from"
            />
            <small className="field-hint">
              Used to work out how far a job is from them. Without it they still get offers — the list just cannot say
              &ldquo;8 miles away&rdquo;.
            </small>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-area`}>Service area</label>
            <input id={`${idPrefix}-area`} name="serviceArea" defaultValue={profile?.serviceArea ?? ''} placeholder="Oakland &amp; Macomb County" />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-radius`}>Travel radius (miles)</label>
            <input
              id={`${idPrefix}-radius`}
              name="travelRadiusMiles"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue={profile?.travelRadiusMiles ?? ''}
              placeholder="25"
            />
          </div>
          <div className="field full">
            <label htmlFor={`${idPrefix}-availability`}>Availability</label>
            <input
              id={`${idPrefix}-availability`}
              name="availabilityNote"
              defaultValue={profile?.availabilityNote ?? ''}
              placeholder="Weekdays, and Saturdays by arrangement"
            />
          </div>
          <div className="field full">
            <label className="checkbox-row" htmlFor={`${idPrefix}-emergency`}>
              <input
                id={`${idPrefix}-emergency`}
                name="emergencyAvailable"
                type="checkbox"
                defaultChecked={profile?.emergencyAvailable ?? false}
              />
              <span>Takes emergency and out-of-hours calls</span>
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>What they charge</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${idPrefix}-ratePref`}>Preferred pricing</label>
            <select
              id={`${idPrefix}-ratePref`}
              name="ratePreference"
              value={ratePreference}
              onChange={(event) => setRatePreference(event.target.value as typeof ratePreference)}
            >
              {RATE_PREFERENCES.map((option) => (
                <option key={option} value={option}>
                  {RATE_PREFERENCE_LABEL[option]}
                </option>
              ))}
            </select>
            <small className="field-hint">Job requests are sent as a fixed price for now, whatever is chosen here.</small>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-minimum`}>Minimum charge</label>
            <input
              id={`${idPrefix}-minimum`}
              name="minimumCharge"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              defaultValue={profile?.minimumCharge ?? ''}
              placeholder="150"
            />
          </div>
          {/* Both amounts are always rendered, and only the relevant one is
              shown. A hidden-but-present field keeps the saved value when
              somebody switches preference and back, which a conditionally
              MOUNTED field would silently drop. */}
          <div className="field" hidden={ratePreference === 'day_rate'}>
            <label htmlFor={`${idPrefix}-hourly`}>Hourly rate</label>
            <input
              id={`${idPrefix}-hourly`}
              name="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={profile?.hourlyRate || ''}
              placeholder="85"
            />
            <small className="field-hint">Also what an hour of their time costs a job, for margin.</small>
          </div>
          <div className="field" hidden={ratePreference !== 'day_rate'}>
            <label htmlFor={`${idPrefix}-day`}>Day rate</label>
            <input
              id={`${idPrefix}-day`}
              name="dayRate"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              defaultValue={profile?.dayRate ?? ''}
              placeholder="650"
            />
          </div>
          <div className="field full">
            <label htmlFor={`${idPrefix}-terms`}>Payment terms</label>
            <input id={`${idPrefix}-terms`} name="paymentTerms" defaultValue={profile?.paymentTerms ?? ''} placeholder="Net 15 on invoice" />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>Compliance</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${idPrefix}-license`}>License number</label>
            <input id={`${idPrefix}-license`} name="licenseNumber" defaultValue={profile?.licenseNumber ?? ''} placeholder="MI-71-02345" />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-licenseExp`}>License expires</label>
            <input id={`${idPrefix}-licenseExp`} name="licenseExpiresOn" type="date" defaultValue={profile?.licenseExpiresOn ?? ''} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-insurer`}>Insurance carrier</label>
            <input id={`${idPrefix}-insurer`} name="insuranceCarrier" defaultValue={profile?.insuranceCarrier ?? ''} placeholder="Hartford" />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-insuranceExp`}>Insurance expires</label>
            <input id={`${idPrefix}-insuranceExp`} name="insuranceExpiresOn" type="date" defaultValue={profile?.insuranceExpiresOn ?? ''} />
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-w9`}>W-9</label>
            <select id={`${idPrefix}-w9`} name="w9Status" defaultValue={profile?.w9Status ?? 'missing'}>
              {W9_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {W9_STATUS_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-agreement`}>Subcontractor agreement</label>
            <select id={`${idPrefix}-agreement`} name="agreementStatus" defaultValue={profile?.agreementStatus ?? 'missing'}>
              {AGREEMENT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {AGREEMENT_STATUS_LABEL[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className={styles.formNote}>
          A job request can insist on a current license or current insurance. A firm whose paperwork has lapsed is still
          shown in the match list — with the reason, so you know why the box is greyed out.
        </p>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend>Your own notes</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor={`${idPrefix}-status`}>Standing</label>
            <select id={`${idPrefix}-status`} name="subStatus" defaultValue={profile?.subStatus ?? 'active'}>
              {SUB_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {SUB_STATUS_LABEL[option]}
                </option>
              ))}
            </select>
            <small className="field-hint">{SUB_STATUS_HINT[profile?.subStatus ?? 'active']}</small>
          </div>
          <div className="field">
            <label htmlFor={`${idPrefix}-tags`}>Tags</label>
            <input id={`${idPrefix}-tags`} name="tags" defaultValue={(profile?.tags ?? []).join(', ')} placeholder="Nights, big jobs, tidy" />
          </div>
          <div className="field full">
            <label htmlFor={`${idPrefix}-notes`}>Internal notes</label>
            <textarea
              id={`${idPrefix}-notes`}
              name="internalNotes"
              rows={3}
              defaultValue={profile?.internalNotes ?? ''}
              placeholder="Only ever seen by you. Never shown to the subcontractor or the customer."
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}
