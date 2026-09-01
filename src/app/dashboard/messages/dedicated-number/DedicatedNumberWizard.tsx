'use client';

import React, { useState, type ChangeEvent } from 'react';
import styles from './registration.module.css';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
] as const;

export type DedicatedNumberFormDefaults = {
  legalBusinessName: string;
  dbaName: string;
  businessType: string;
  websiteUrl: string;
  businessEmail: string;
  businessPhone: string;
  authorizedContactName: string;
  authorizedContactTitle: string;
  authorizedContactEmail: string;
  authorizedContactPhone: string;
  messagingSupportEmail: string;
  messagingSupportPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  desiredAreaCode: string;
  messagingUseCase: string;
  estimatedMonthlyMessages: number;
  optInDescription: string;
  optInEvidenceUrl: string;
  sampleMessages: readonly string[];
  privacyPolicyUrl: string;
  termsUrl: string;
};

export default function DedicatedNumberWizard({
  defaults,
}: {
  defaults: DedicatedNumberFormDefaults;
}) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Form state tracked for client review & "Same as business contact" copy
  const [formValues, setFormValues] = useState({
    legalBusinessName: defaults.legalBusinessName,
    dbaName: defaults.dbaName,
    businessType: defaults.businessType,
    ein: '',
    websiteUrl: defaults.websiteUrl,
    businessEmail: defaults.businessEmail,
    businessPhone: defaults.businessPhone,
    addressLine1: defaults.addressLine1,
    addressLine2: defaults.addressLine2,
    city: defaults.city,
    region: defaults.region || 'MI',
    postalCode: defaults.postalCode,
    authorizedContactName: defaults.authorizedContactName,
    authorizedContactTitle: defaults.authorizedContactTitle || 'Owner',
    authorizedContactEmail: defaults.authorizedContactEmail || defaults.businessEmail,
    authorizedContactPhone: defaults.authorizedContactPhone || defaults.businessPhone,
    desiredAreaCode: defaults.desiredAreaCode || '248',
  });

  const [useBusinessContact, setUseBusinessContact] = useState(false);
  const isSoleProp = formValues.businessType === 'sole_proprietor';

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (stepError) setStepError(null);
  };

  const handleToggleSameContact = (e: ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setUseBusinessContact(checked);
    if (checked) {
      setFormValues((prev) => ({
        ...prev,
        authorizedContactEmail: prev.businessEmail,
        authorizedContactPhone: prev.businessPhone,
      }));
    }
  };

  const validateStep1 = () => {
    if (!formValues.legalBusinessName.trim()) return 'Enter your legal business name.';
    if (!isSoleProp) {
      const digits = formValues.ein.replace(/\D/g, '');
      if (digits.length !== 9) return 'Enter a valid 9-digit Tax ID / EIN (e.g. 12-3456789).';
    } else if (formValues.ein.trim()) {
      const digits = formValues.ein.replace(/\D/g, '');
      if (digits.length !== 9) return 'EIN must be 9 digits if provided.';
    }
    if (!formValues.websiteUrl.trim()) return 'Enter your business website URL.';
    if (!formValues.businessEmail.trim()) return 'Enter a valid business email address.';
    if (!formValues.businessPhone.trim()) return 'Enter your business phone number.';
    if (!formValues.addressLine1.trim()) return 'Enter your physical business street address.';
    if (!formValues.city.trim()) return 'Enter your city.';
    if (!formValues.region.trim()) return 'Select your US state.';
    if (!formValues.postalCode.trim()) return 'Enter your 5-digit ZIP code.';
    return null;
  };

  const validateStep2 = () => {
    if (!formValues.authorizedContactName.trim()) return 'Enter the authorized representative name.';
    if (!formValues.authorizedContactTitle.trim()) return 'Enter the authorized representative title.';
    if (!formValues.authorizedContactEmail.trim()) return 'Enter the authorized contact email address.';
    if (!formValues.authorizedContactPhone.trim()) return 'Enter the authorized contact phone number.';
    if (!/^[2-9][0-9]{2}$/.test(formValues.desiredAreaCode.trim())) {
      return 'Enter a valid 3-digit US area code (e.g. 248, 313, 616).';
    }
    return null;
  };

  const goToStep2 = () => {
    const error = validateStep1();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setCurrentStep(2);
  };

  const goToStep3 = () => {
    const error = validateStep2();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setCurrentStep(3);
  };

  return (
    <div className={styles.wizardRoot}>
      {/* Step Navigation Indicator */}
      <div className={styles.stepperBar} role="tablist" aria-label="Application Progress">
        <button
          type="button"
          role="tab"
          aria-selected={currentStep === 1}
          className={`${styles.stepTab} ${currentStep === 1 ? styles.activeTab : ''} ${currentStep > 1 ? styles.completedTab : ''}`}
          onClick={() => {
            if (currentStep > 1) {
              setStepError(null);
              setCurrentStep(1);
            }
          }}
        >
          <span className={styles.tabNumber}>1</span>
          <span className={styles.tabLabel}>Business Details</span>
        </button>

        <span className={styles.stepDivider} aria-hidden="true">›</span>

        <button
          type="button"
          role="tab"
          aria-selected={currentStep === 2}
          className={`${styles.stepTab} ${currentStep === 2 ? styles.activeTab : ''} ${currentStep > 2 ? styles.completedTab : ''}`}
          onClick={() => {
            if (currentStep === 3) {
              setStepError(null);
              setCurrentStep(2);
            } else if (currentStep === 1) {
              goToStep2();
            }
          }}
        >
          <span className={styles.tabNumber}>2</span>
          <span className={styles.tabLabel}>Contact &amp; Number</span>
        </button>

        <span className={styles.stepDivider} aria-hidden="true">›</span>

        <button
          type="button"
          role="tab"
          aria-selected={currentStep === 3}
          className={`${styles.stepTab} ${currentStep === 3 ? styles.activeTab : ''}`}
          onClick={() => {
            if (currentStep === 2) {
              goToStep3();
            } else if (currentStep === 1) {
              const err1 = validateStep1();
              if (err1) {
                setStepError(err1);
                return;
              }
              const err2 = validateStep2();
              if (err2) {
                setStepError(err2);
                setCurrentStep(2);
                return;
              }
              setStepError(null);
              setCurrentStep(3);
            }
          }}
        >
          <span className={styles.tabNumber}>3</span>
          <span className={styles.tabLabel}>Review &amp; Submit</span>
        </button>
      </div>

      {stepError ? (
        <div className={`${styles.banner} ${styles.error}`} role="alert">
          {stepError}
        </div>
      ) : null}

      {/* Hidden 10DLC compliance payloads automatically managed by LGQ platform */}
      <input type="hidden" name="messagingUseCase" value={defaults.messagingUseCase} />
      <input type="hidden" name="optInDescription" value={defaults.optInDescription} />
      <input
        type="hidden"
        name="optInEvidenceUrl"
        value={defaults.optInEvidenceUrl || (formValues.websiteUrl ? `${formValues.websiteUrl.replace(/\/+$/, '')}/#quote` : 'https://example.com/#quote')}
      />
      <input
        type="hidden"
        name="messagingSupportEmail"
        value={defaults.messagingSupportEmail || formValues.businessEmail || formValues.authorizedContactEmail}
      />
      <input
        type="hidden"
        name="messagingSupportPhone"
        value={defaults.messagingSupportPhone || formValues.businessPhone || formValues.authorizedContactPhone}
      />
      <input type="hidden" name="estimatedMonthlyMessages" value={String(defaults.estimatedMonthlyMessages)} />
      <input type="hidden" name="sampleMessage1" value={defaults.sampleMessages[0] ?? ''} />
      <input type="hidden" name="sampleMessage2" value={defaults.sampleMessages[1] ?? ''} />
      <input type="hidden" name="sampleMessage3" value={defaults.sampleMessages[2] ?? ''} />
      <input
        type="hidden"
        name="privacyPolicyUrl"
        value={defaults.privacyPolicyUrl || (formValues.websiteUrl ? `${formValues.websiteUrl.replace(/\/+$/, '')}/privacy` : 'https://example.com/privacy')}
      />
      <input
        type="hidden"
        name="termsUrl"
        value={defaults.termsUrl || (formValues.websiteUrl ? `${formValues.websiteUrl.replace(/\/+$/, '')}/terms` : 'https://example.com/terms')}
      />

      {/* STEP 1: Business Identity */}
      <div style={{ display: currentStep === 1 ? 'grid' : 'none', gap: '1.25rem' }}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.stepBadge}>Step 1 of 3</span>
            <div>
              <h2>Business identity</h2>
              <p className={styles.subtext}>
                US mobile carriers require verified business entity details for 10DLC brand registration.
              </p>
            </div>
          </div>

          <div className={styles.grid}>
            <label>
              <span>Legal business name <small className={styles.req}>(Required)</small></span>
              <input
                name="legalBusinessName"
                value={formValues.legalBusinessName}
                onChange={handleInputChange}
                placeholder="e.g. Acme Roofing LLC"
                required
              />
            </label>

            <label>
              <span>DBA / public name <small className={styles.opt}>(Optional)</small></span>
              <input
                name="dbaName"
                value={formValues.dbaName}
                onChange={handleInputChange}
                placeholder="e.g. Acme Roofs"
              />
            </label>

            <label>
              <span>Business entity type <small className={styles.req}>(Required)</small></span>
              <select
                name="businessType"
                value={formValues.businessType}
                onChange={handleInputChange}
                required
              >
                <option value="llc">LLC (Limited Liability Company)</option>
                <option value="sole_proprietor">Sole Proprietorship</option>
                <option value="corporation">Corporation</option>
                <option value="partnership">Partnership</option>
                <option value="nonprofit">Nonprofit (501c3)</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <span>
                Tax ID / EIN {isSoleProp ? <small className={styles.opt}>(Optional for Sole Prop)</small> : <small className={styles.req}>(Required for LLC/Corp)</small>}
              </span>
              <input
                name="ein"
                value={formValues.ein}
                onChange={handleInputChange}
                placeholder="12-3456789"
                pattern="[0-9]{2}-?[0-9]{7}"
                title="9-digit Employer Identification Number (e.g. 12-3456789)"
                inputMode="numeric"
                maxLength={10}
                required={!isSoleProp}
              />
            </label>

            <label>
              <span>Business website <small className={styles.req}>(Required)</small></span>
              <input
                name="websiteUrl"
                type="url"
                value={formValues.websiteUrl}
                onChange={handleInputChange}
                placeholder="https://example.com"
                required
              />
            </label>

            <label>
              <span>Business email <small className={styles.req}>(Required)</small></span>
              <input
                name="businessEmail"
                type="email"
                value={formValues.businessEmail}
                onChange={handleInputChange}
                placeholder="contact@yourbusiness.com"
                required
              />
            </label>

            <label>
              <span>Business phone <small className={styles.req}>(Required)</small></span>
              <input
                name="businessPhone"
                type="tel"
                value={formValues.businessPhone}
                onChange={handleInputChange}
                placeholder="(248) 555-0140"
                required
              />
            </label>

            <label className={styles.fullWidth}>
              <span>Physical street address <small className={styles.req}>(Required, no P.O. boxes)</small></span>
              <input
                name="addressLine1"
                value={formValues.addressLine1}
                onChange={handleInputChange}
                placeholder="123 Main Street"
                required
              />
            </label>

            <label>
              <span>Suite / unit <small className={styles.opt}>(Optional)</small></span>
              <input
                name="addressLine2"
                value={formValues.addressLine2}
                onChange={handleInputChange}
                placeholder="Suite 100"
              />
            </label>

            <label>
              <span>City <small className={styles.req}>(Required)</small></span>
              <input
                name="city"
                value={formValues.city}
                onChange={handleInputChange}
                placeholder="Detroit"
                required
              />
            </label>

            <label>
              <span>State <small className={styles.req}>(Required)</small></span>
              <select
                name="region"
                value={formValues.region}
                onChange={handleInputChange}
                required
              >
                {US_STATES.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.name} ({st.code})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>ZIP code <small className={styles.req}>(Required)</small></span>
              <input
                name="postalCode"
                value={formValues.postalCode}
                onChange={handleInputChange}
                placeholder="48201"
                maxLength={10}
                required
              />
            </label>
          </div>

          <div className={styles.wizardActions}>
            <button type="button" className="btn primary" onClick={goToStep2}>
              Continue to Contact &amp; Area Code →
            </button>
          </div>
        </section>
      </div>

      {/* STEP 2: Authorized Contact & Preferences */}
      <div style={{ display: currentStep === 2 ? 'grid' : 'none', gap: '1.25rem' }}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.stepBadge}>Step 2 of 3</span>
            <div>
              <h2>Authorized contact &amp; number preferences</h2>
              <p className={styles.subtext}>
                The designated business representative for carrier registration and your preferred local area code.
              </p>
            </div>
          </div>

          <label className={styles.shortcutCheckbox}>
            <input
              type="checkbox"
              checked={useBusinessContact}
              onChange={handleToggleSameContact}
            />
            <span>Use business email and phone for authorized contact</span>
          </label>

          <div className={styles.grid}>
            <label>
              <span>Full name <small className={styles.req}>(Required)</small></span>
              <input
                name="authorizedContactName"
                value={formValues.authorizedContactName}
                onChange={handleInputChange}
                placeholder="Jane Doe"
                required
              />
            </label>

            <label>
              <span>Title / role <small className={styles.req}>(Required)</small></span>
              <input
                name="authorizedContactTitle"
                value={formValues.authorizedContactTitle}
                onChange={handleInputChange}
                placeholder="Owner / Managing Director"
                required
              />
            </label>

            <label>
              <span>Email <small className={styles.req}>(Required)</small></span>
              <input
                name="authorizedContactEmail"
                type="email"
                value={formValues.authorizedContactEmail}
                onChange={handleInputChange}
                placeholder="jane@yourbusiness.com"
                required
              />
            </label>

            <label>
              <span>Phone <small className={styles.req}>(Required)</small></span>
              <input
                name="authorizedContactPhone"
                type="tel"
                value={formValues.authorizedContactPhone}
                onChange={handleInputChange}
                placeholder="(248) 555-0140"
                required
              />
            </label>

            <label>
              <span>Preferred local area code <small className={styles.req}>(Required, 3 digits)</small></span>
              <input
                name="desiredAreaCode"
                value={formValues.desiredAreaCode}
                onChange={handleInputChange}
                placeholder="248"
                inputMode="numeric"
                maxLength={3}
                required
              />
            </label>
          </div>

          <p className={styles.note}>
            10DLC mobile carrier vetting requires verified business tax identity. To protect your business privacy, LGQ stores only the verified last four digits and provider registration IDs in restricted compliance storage.
          </p>

          <div className={styles.wizardActions}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setStepError(null);
                setCurrentStep(1);
              }}
            >
              ← Back
            </button>
            <button type="button" className="btn primary" onClick={goToStep3}>
              Continue to Review &amp; Compliance →
            </button>
          </div>
        </section>
      </div>

      {/* STEP 3: Review & Carrier Compliance */}
      <div style={{ display: currentStep === 3 ? 'grid' : 'none', gap: '1.25rem' }}>
        {/* Review Summary */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.stepBadge}>Step 3 of 3</span>
            <div>
              <h2>Review details</h2>
              <p className={styles.subtext}>
                Please confirm your business information before submitting for carrier brand registration.
              </p>
            </div>
          </div>

          <div className={styles.reviewGrid}>
            <div className={styles.reviewSection}>
              <div className={styles.reviewSectionHead}>
                <strong>Business entity</strong>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => {
                    setStepError(null);
                    setCurrentStep(1);
                  }}
                >
                  Edit
                </button>
              </div>
              <p><b>Name:</b> {formValues.legalBusinessName} {formValues.dbaName ? `(DBA: ${formValues.dbaName})` : ''}</p>
              <p><b>Type:</b> {formValues.businessType.toUpperCase()}</p>
              <p><b>Tax ID / EIN:</b> {formValues.ein ? `XX-XXX${formValues.ein.replace(/\D/g, '').slice(-4)}` : 'None (Sole Proprietor)'}</p>
              <p><b>Website:</b> {formValues.websiteUrl}</p>
              <p><b>Email:</b> {formValues.businessEmail}</p>
              <p><b>Phone:</b> {formValues.businessPhone}</p>
              <p><b>Address:</b> {formValues.addressLine1} {formValues.addressLine2 ? `, ${formValues.addressLine2}` : ''}, {formValues.city}, {formValues.region} {formValues.postalCode}</p>
            </div>

            <div className={styles.reviewSection}>
              <div className={styles.reviewSectionHead}>
                <strong>Authorized contact &amp; number</strong>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => {
                    setStepError(null);
                    setCurrentStep(2);
                  }}
                >
                  Edit
                </button>
              </div>
              <p><b>Representative:</b> {formValues.authorizedContactName} ({formValues.authorizedContactTitle})</p>
              <p><b>Contact Email:</b> {formValues.authorizedContactEmail}</p>
              <p><b>Contact Phone:</b> {formValues.authorizedContactPhone}</p>
              <p><b>Preferred Area Code:</b> ({formValues.desiredAreaCode})</p>
            </div>
          </div>
        </section>

        {/* Platform Managed 10DLC Compliance */}
        <section className={`${styles.card} ${styles.complianceCard}`}>
          <div className={styles.cardHeader}>
            <div className={styles.complianceHeaderRow}>
              <h2>Platform-managed carrier compliance (10DLC)</h2>
              <span className={styles.badgePill}>100% Automated by LGQ</span>
            </div>
            <p className={styles.subtext}>
              Because Let&rsquo;s Get Quoted powers your quote forms, 2-way inbox, and transactional customer notifications,
              we configure and manage carrier vetting rules for you.
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>✓</div>
              <div>
                <strong>Customer Care &amp; Operations</strong>
                <p>Pre-configured for estimate links, appointment reminders, dispatch notices, 2-way homeowner replies, and invoices. No spam.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>✓</div>
              <div>
                <strong>Active Website Opt-In Consent</strong>
                <p>Your Let&rsquo;s Get Quoted website quote form automatically displays carrier-mandated SMS consent disclosures.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>✓</div>
              <div>
                <strong>Automated STOP &amp; HELP Handlers</strong>
                <p>Instant carrier-compliant opt-out and help auto-responders are active on your dedicated business number.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>✓</div>
              <div>
                <strong>Linked Privacy Policy &amp; Terms</strong>
                <p>Automatically references your active Let&rsquo;s Get Quoted site policies for carrier auditing.</p>
              </div>
            </div>
          </div>

          <details className={styles.complianceDetails}>
            <summary>View pre-configured carrier registration payload</summary>
            <div className={styles.detailsContent}>
              <div className={styles.detailRow}>
                <span>Use Case / Campaign Scope</span>
                <p>{defaults.messagingUseCase}</p>
              </div>
              <div className={styles.detailRow}>
                <span>Opt-In Consent Flow</span>
                <p>{defaults.optInDescription}</p>
              </div>
              <div className={styles.detailRow}>
                <span>Opt-In Evidence URL</span>
                <p><code>{defaults.optInEvidenceUrl || (formValues.websiteUrl ? `${formValues.websiteUrl.replace(/\/+$/, '')}/#quote` : 'https://example.com/#quote')}</code></p>
              </div>
              <div className={styles.detailRow}>
                <span>Sample Customer Care Messages</span>
                <ul>
                  {defaults.sampleMessages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </section>

        {/* Setup Fee Summary */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.complianceHeaderRow}>
              <h2>Setup fee summary</h2>
              <span className={styles.badgePill} style={{ background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }}>
                $49.99 One-Time
              </span>
            </div>
            <p className={styles.subtext}>
              Covers complete US mobile carrier 10DLC registration, campaign vetting, and dedicated business number provisioning.
            </p>
          </div>

          <div style={{ background: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '10px', padding: '16px 20px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
              <span>TCR Standard Brand Registration &amp; Carrier Vetting</span>
              <span style={{ fontWeight: 600 }}>Included</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
              <span>Dedicated Local Business Phone Number Provisioning</span>
              <span style={{ fontWeight: 600 }}>Included</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '14px' }}>
              <span>2-Way Customer Messaging &amp; AI Voice Receptionist Setup</span>
              <span style={{ fontWeight: 600 }}>Included</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontSize: '16px', fontWeight: 700 }}>
              <span>Total One-Time Due Upon Application</span>
              <span style={{ color: 'var(--accent, #ff6a24)' }}>$49.99</span>
            </div>
          </div>
        </section>

        {/* Attestation & Submit */}
        <section className={styles.card}>
          <label className={styles.attestation}>
            <input type="checkbox" name="attested" required />
            <span>
              I confirm this information is accurate; recipients provide their phone numbers and consent; messages identify my business;
              opt-outs will be honored; and purchased contact lists will not be used.
            </span>
          </label>

          <div className={styles.wizardActions}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setStepError(null);
                setCurrentStep(2);
              }}
            >
              ← Back to Contact
            </button>
            <button type="submit" className="btn primary">
              Pay $49.99 &amp; Submit Application →
            </button>
          </div>
          <p className={styles.note}>
            Submission charges the $49.99 one-time carrier registration and setup fee and begins immediate staff and carrier review.
          </p>
        </section>
      </div>
    </div>
  );
}
