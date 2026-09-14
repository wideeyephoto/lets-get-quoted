'use client';

import { useState, useEffect, useCallback } from 'react';
import { CredentialsVaultModal } from '@/components/permits/CredentialsVaultModal';
import type { ContractorCredential } from '@/lib/permit-intel/credentials-vault';

export default function ContractorLicensingSection() {
  const [credentials, setCredentials] = useState<ContractorCredential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/contractor/credentials');
      const json = await res.json();
      if (res.ok && json.credentials) {
        setCredentials(json.credentials);
      }
    } catch (err) {
      console.error('Failed to load contractor credentials:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const stateLicenses = credentials.filter((c) => c.credentialType === 'state_license');
  const municipalPins = credentials.filter((c) => c.credentialType === 'municipal_registration');
  const insuranceCreds = credentials.filter((c) => c.credentialType === 'liability_insurance' || c.credentialType === 'workers_comp');

  return (
    <section className="panel workspace-section-card" id="licensing" style={{ marginTop: '1.5rem' }}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Trust &amp; Compliance</p>
        <h2>Contractor licensing, registrations &amp; municipal PINs</h2>
      </div>

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        State trade licenses, Master credentials, and municipal portal PINs (AccessMyGov / BS&amp;A).
        These automatically pre-fill permit submittal packets, inspections, and municipal Certificates of Insurance (COI) across your jobs.
      </p>

      <div className="cert-summary is-ok" style={{ marginBottom: '1rem' }}>
        <div className="cert-summary-main">
          <strong>Credentials &amp; Municipal PINs Vault</strong>
          <p className="cert-summary-facts">
            {loading ? (
              'Checking vault records…'
            ) : (
              [
                stateLicenses.length > 0 ? `${stateLicenses.length} trade ${stateLicenses.length === 1 ? 'license' : 'licenses'}` : 'No state licenses yet',
                municipalPins.length > 0 ? `${municipalPins.length} municipal ${municipalPins.length === 1 ? 'PIN' : 'PINs'}` : null,
                insuranceCreds.length > 0 ? 'Insurance linked' : null,
              ].filter(Boolean).join(' · ')
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
                    <strong>{cred.issuingAuthority}</strong> · {cred.credentialType.replace('_', ' ').toUpperCase()}
                    {cred.licenseNumber ? ` · #${cred.licenseNumber}` : ''}
                    {cred.contractorPin ? ` · PIN: ${cred.contractorPin}` : ''}
                    {cred.expiresAt ? ` · Exp: ${cred.expiresAt}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div>
        <button
          type="button"
          onClick={() => setIsVaultOpen(true)}
          className="btn secondary"
        >
          ?? Manage Credentials &amp; Municipal PINs Vault
        </button>
      </div>

      <CredentialsVaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        onCredentialsUpdated={fetchCredentials}
      />
    </section>
  );
}
