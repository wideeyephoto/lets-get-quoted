'use client';

import React, { useState, useEffect } from 'react';
import type {
  ContractorCredential,
  ContractorCredentialType,
} from '@/lib/permit-intel/credentials-vault';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';
import styles from './CredentialsVaultModal.module.css';

export type CredentialsVaultModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCredentialsUpdated?: () => void;
};

export function CredentialsVaultModal({
  isOpen,
  onClose,
  onCredentialsUpdated,
}: CredentialsVaultModalProps) {
  const [credentials, setCredentials] = useState<ContractorCredential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  // New credential form state
  const [credentialType, setCredentialType] = useState<ContractorCredentialType>('state_license');
  const [tradeDiscipline, setTradeDiscipline] = useState<JurisdictionDiscipline | 'general'>('building');
  const [holderName, setHolderName] = useState<string>('');
  const [licenseNumber, setLicenseNumber] = useState<string>('');
  const [issuingAuthority, setIssuingAuthority] = useState<string>('Michigan LARA BCC');
  const [contractorPin, setContractorPin] = useState<string>('');
  const [insuranceCarrier, setInsuranceCarrier] = useState<string>('');
  const [policyNumber, setPolicyNumber] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadCredentials();
    }
  }, [isOpen]);

  const loadCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/contractor/credentials');
      const json = await res.json();
      if (res.ok && json.credentials) {
        setCredentials(json.credentials);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/contractor/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialType,
          tradeDiscipline,
          holderName,
          licenseNumber: licenseNumber || undefined,
          issuingAuthority,
          contractorPin: contractorPin || undefined,
          insuranceCarrier: insuranceCarrier || undefined,
          policyNumber: policyNumber || undefined,
          expiresAt: expiresAt || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');

      setCredentials((prev) => [json.credential, ...prev]);
      setShowAddForm(false);
      resetForm();
      if (onCredentialsUpdated) onCredentialsUpdated();
    } catch (err) {
      console.error(err);
      alert('Error saving credential.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this credential?')) return;
    try {
      const res = await fetch(`/api/contractor/credentials/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
        if (onCredentialsUpdated) onCredentialsUpdated();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete credential.');
    }
  };

  const resetForm = () => {
    setHolderName('');
    setLicenseNumber('');
    setContractorPin('');
    setInsuranceCarrier('');
    setPolicyNumber('');
    setExpiresAt('');
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#38bdf8">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Contractor Licensing, PINs &amp; Insurance Vault
          </h3>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#94a3b8' }}>Loading credentials...</p>
          ) : (
            <>
              <div className={styles.cardList}>
                {credentials.map((cred) => {
                  const tagClass =
                    cred.status === 'active'
                      ? styles.tagActive
                      : cred.status === 'expiring_soon'
                      ? styles.tagExpiring
                      : styles.tagExpired;

                  return (
                    <div key={cred.id} className={styles.credentialCard}>
                      <div className={styles.cardContent}>
                        <div className={styles.cardHeaderTitle}>
                          <span>{cred.holderName}</span>
                          <span className={`${styles.tag} ${tagClass}`}>
                            {cred.status === 'active' && 'Active'}
                            {cred.status === 'expiring_soon' && 'Expiring Soon'}
                            {cred.status === 'expired' && 'Expired'}
                          </span>
                        </div>
                        <div className={styles.cardSubtitle}>
                          <strong>{cred.issuingAuthority}</strong> · {cred.credentialType.replace('_', ' ').toUpperCase()}
                          {cred.licenseNumber && ` · #${cred.licenseNumber}`}
                          {cred.contractorPin && ` · PIN: ${cred.contractorPin}`}
                          {cred.expiresAt && ` · Exp: ${cred.expiresAt}`}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(cred.id)}
                        className={styles.deleteButton}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}

                {credentials.length === 0 && !showAddForm && (
                  <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                    No credentials registered yet. Add your State Builder license, Master trade license, or municipal AccessMyGov PIN to auto-populate permit filings.
                  </p>
                )}
              </div>

              {showAddForm ? (
                <form onSubmit={handleCreateCredential} className={styles.formBox}>
                  <h4 style={{ margin: 0, fontSize: '0.9375rem', color: '#38bdf8' }}>
                    Add Credential or Municipal PIN
                  </h4>

                  <div className={styles.fieldGrid}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="cred-type-input">Credential Type</label>
                      <select
                        id="cred-type-input"
                        value={credentialType}
                        onChange={(e) => setCredentialType(e.target.value as ContractorCredentialType)}
                        className={styles.selectInput}
                      >
                        <option value="state_license">State Trade License (Builder / Master)</option>
                        <option value="municipal_registration">Municipal Registration / Portal PIN</option>
                        <option value="liability_insurance">General Liability Insurance</option>
                        <option value="workers_comp">Workers’ Compensation</option>
                      </select>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="trade-disc-input">Trade Discipline</label>
                      <select
                        id="trade-disc-input"
                        value={tradeDiscipline}
                        onChange={(e) => setTradeDiscipline(e.target.value as any)}
                        className={styles.selectInput}
                      >
                        <option value="building">Building / Roofing</option>
                        <option value="electrical">Electrical</option>
                        <option value="mechanical">Mechanical / HVAC</option>
                        <option value="plumbing">Plumbing</option>
                        <option value="general">General / All Trades</option>
                      </select>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="holder-name-input">Qualifying Licensee / Carrier</label>
                      <input
                        id="holder-name-input"
                        type="text"
                        required
                        placeholder="e.g. Master Builder LLC"
                        value={holderName}
                        onChange={(e) => setHolderName(e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="auth-name-input">Issuing Authority / City</label>
                      <input
                        id="auth-name-input"
                        type="text"
                        required
                        placeholder="e.g. Michigan LARA or City of Royal Oak"
                        value={issuingAuthority}
                        onChange={(e) => setIssuingAuthority(e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="lic-num-input">License / Policy Number</label>
                      <input
                        id="lic-num-input"
                        type="text"
                        placeholder="e.g. 2101234567"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="pin-input">Municipal Portal PIN (AccessMyGov / BS&A)</label>
                      <input
                        id="pin-input"
                        type="text"
                        placeholder="e.g. 8492"
                        value={contractorPin}
                        onChange={(e) => setContractorPin(e.target.value)}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel} htmlFor="exp-date-input">Expiration Date</label>
                      <input
                        id="exp-date-input"
                        type="date"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                        className={styles.textInput}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className={styles.secondaryButton}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className={styles.primaryButton}
                    >
                      {saving ? 'Saving...' : 'Save Credential'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className={styles.secondaryButton}
                  style={{ alignSelf: 'flex-start' }}
                >
                  + Add License, PIN or Insurance
                </button>
              )}
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <div />
          <button type="button" onClick={onClose} className={styles.primaryButton}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
