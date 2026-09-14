'use client';

import { useState, useEffect, useCallback } from 'react';
import { CredentialsVaultModal } from '@/components/permits/CredentialsVaultModal';
import type { ContractorCredential } from '@/lib/permit-intel/credentials-vault';
import { updateContractorComplianceAction } from './actions';

export type ContractorComplianceData = {
  licenseType?: string;
  stateEmployerNumber?: string;
  fein?: string;
  maskedFein?: string;
  hasFein?: boolean;
};

export type ContractorLicensingSectionProps = {
  initialCompliance?: ContractorComplianceData;
};

export default function ContractorLicensingSection({
  initialCompliance,
}: ContractorLicensingSectionProps) {
  const [credentials, setCredentials] = useState<ContractorCredential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);

  // Compliance state
  const [licenseType, setLicenseType] = useState<string>(initialCompliance?.licenseType || '');
  const [stateEmployerNumber, setStateEmployerNumber] = useState<string>(initialCompliance?.stateEmployerNumber || '');
  const [fein, setFein] = useState<string>(initialCompliance?.maskedFein || initialCompliance?.fein || '');
  const [hasFein, setHasFein] = useState<boolean>(Boolean(initialCompliance?.hasFein || initialCompliance?.fein));
  const [complianceSaving, setComplianceSaving] = useState<boolean>(false);
  const [complianceNotice, setComplianceNotice] = useState<string | null>(null);
  const [complianceError, setComplianceError] = useState<string | null>(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/contractor/credentials');
      const json = await res.json();
      if (res.ok && json.credentials) {
        setCredentials(json.credentials);
      }
      if (res.ok && json.compliance) {
        if (!initialCompliance?.licenseType && json.compliance.licenseType) {
          setLicenseType(json.compliance.licenseType);
        }
        if (!initialCompliance?.stateEmployerNumber && json.compliance.stateEmployerNumber) {
          setStateEmployerNumber(json.compliance.stateEmployerNumber);
        }
        if (!initialCompliance?.fein && json.compliance.fein) {
          setFein(json.compliance.fein);
          setHasFein(json.compliance.hasFein);
        }
      }
    } catch (err) {
      console.error('Failed to load contractor credentials:', err);
    } finally {
      setLoading(false);
    }
  }, [initialCompliance]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const stateLicenses = credentials.filter((c) => c.credentialType === 'state_license');
  const municipalPins = credentials.filter((c) => c.credentialType === 'municipal_registration');
  const insuranceCreds = credentials.filter((c) => c.credentialType === 'liability_insurance' || c.credentialType === 'workers_comp');

  const handleSaveCompliance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setComplianceSaving(true);
    setComplianceNotice(null);
    setComplianceError(null);

    try {
      const formData = new FormData(e.currentTarget);
      await updateContractorComplianceAction(formData);
      setComplianceNotice('? Contractor compliance identity updated successfully.');
      setTimeout(() => setComplianceNotice(null), 4000);
    } catch (err: any) {
      setComplianceError(err?.message || 'Could not save contractor compliance information.');
    } finally {
      setComplianceSaving(false);
    }
  };

  return (
    <section className="panel workspace-section-card" id="licensing" style={{ marginTop: '1.5rem' }}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Trust &amp; Compliance</p>
        <h2>Contractor licensing, registrations &amp; municipal PINs</h2>
      </div>

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        State trade licenses, Master credentials, and municipal portal PINs (BS&amp;A / Municipal Portals).
        These automatically pre-fill permit submittal packets, inspections, and municipal Certificates of Insurance (COI) across your jobs.
      </p>

      <div className="cert-summary is-ok" style={{ marginBottom: '1rem' }}>
        <div className="cert-summary-main">
          <strong>Credentials &amp; Municipal PINs Vault</strong>
          <p className="cert-summary-facts">
            {loading ? (
              'Checking vault records�'
            ) : (
              [
                stateLicenses.length > 0 ? `${stateLicenses.length} trade ${stateLicenses.length === 1 ? 'license' : 'licenses'}` : 'No state licenses yet',
                municipalPins.length > 0 ? `${municipalPins.length} municipal ${municipalPins.length === 1 ? 'PIN' : 'PINs'}` : null,
                insuranceCreds.length > 0 ? 'Insurance linked' : null,
              ].filter(Boolean).join(' � ')
            )}
          </p>
          <p className="cert-summary-state">
            Mirrored with your Account business profile and shared across all job permit filings.
          </p>
        </div>
        <span className="cert-summary-chip">
          {credentials.length > 0 ? `${credentials.length} Vaulted` : 'Vault Empty'}
        </span>
      </div>

      {credentials.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
          {credentials.map((cred) => {
            const isSynced = cred.id === 'account-insurance-sync';
            return (
              <div
                key={cred.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line, #334155)',
                  background: 'var(--surface, rgba(255, 255, 255, 0.03))',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text, #f8fafc)' }}>
                      {cred.holderName}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        background:
                          cred.status === 'active'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : cred.status === 'expiring_soon'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        color:
                          cred.status === 'active'
                            ? '#4ade80'
                            : cred.status === 'expiring_soon'
                            ? '#facc15'
                            : '#f87171',
                      }}
                    >
                      {cred.status === 'active' ? 'Active' : cred.status === 'expiring_soon' ? 'Expiring Soon' : 'Expired'}
                    </span>
                    {isSynced && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                        }}
                      >
                        ? Synced with Account
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted, #94a3b8)' }}>
                    <strong>{cred.issuingAuthority}</strong> � {cred.credentialType.replace('_', ' ').toUpperCase()}
                    {cred.licenseNumber ? ` � #${cred.licenseNumber}` : ''}
                    {cred.contractorPin ? ` � PIN: ${cred.contractorPin}` : ''}
                    {cred.expiresAt ? ` � Exp: ${cred.expiresAt}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setIsVaultOpen(true)}
          className="btn secondary"
        >
          ?? Manage Credentials &amp; Municipal PINs Vault
        </button>
      </div>

      <div id="contractor-compliance" style={{ borderTop: '1px solid var(--line, #334155)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text, #f8fafc)', marginBottom: '0.4rem' }}>
          Contractor Compliance &amp; Tax Identifiers
        </h3>
        <p className="workspace-details-copy" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          Required legal identity facts for municipal building permits. Stored securely on your account and never printed on customer quotes.
        </p>

        {complianceNotice && (
          <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #4ade80', borderRadius: '6px', color: '#4ade80', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {complianceNotice}
          </div>
        )}
        {complianceError && (
          <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #f87171', borderRadius: '6px', color: '#f87171', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {complianceError}
          </div>
        )}

        <form onSubmit={handleSaveCompliance} className="form-grid compact-form">
          <div className="form-row">
            <label htmlFor="compliance-license-type">
              Trade License Type
              <span className="hint">e.g. Residential Builder, Master Electrician, Mechanical Contractor</span>
            </label>
            <input
              id="compliance-license-type"
              name="license_type"
              type="text"
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value)}
              placeholder="State of Michigan Residential Builder"
              className="input"
            />
          </div>

          <div className="form-row">
            <label htmlFor="compliance-mesc-num">
              State Employer Number (MESC / UIA #)
              <span className="hint">Required for Michigan and municipal workers&apos; comp validation</span>
            </label>
            <input
              id="compliance-mesc-num"
              name="state_employer_number"
              type="text"
              value={stateEmployerNumber}
              onChange={(e) => setStateEmployerNumber(e.target.value)}
              placeholder="00-1234567"
              className="input"
            />
          </div>

          <div className="form-row">
            <label htmlFor="compliance-fein">
              Federal Employer ID (FEIN)
              <span className="hint">9 digits (XX-XXXXXXX). Treated as sensitive tax identity data</span>
            </label>
            <input
              id="compliance-fein"
              name="fein"
              type="text"
              value={fein}
              onFocus={() => {
                if (fein.includes('�')) {
                  setFein('');
                }
              }}
              onChange={(e) => setFein(e.target.value)}
              placeholder="12-3456789"
              className="input"
              pattern="^\d{2}-?\d{7}$|^�.*"
              title="FEIN must be a 9-digit Federal Employer Identification Number (XX-XXXXXXX)"
            />
          </div>

          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button
              type="submit"
              disabled={complianceSaving}
              className="btn primary"
            >
              {complianceSaving ? 'Saving�' : 'Save Compliance Settings'}
            </button>
          </div>
        </form>
      </div>

      <CredentialsVaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onCredentialsUpdated={fetchCredentials}
      />
    </section>
  );
}
