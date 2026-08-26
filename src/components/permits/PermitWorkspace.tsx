'use client';

import React, { useState, useEffect } from 'react';
import type { JurisdictionDiscipline } from '@/lib/location-context/types';
import type {
  JobPermitInspection,
  PermitApplicationStatus,
  PermitWorkspaceDto,
} from '@/lib/permit-intel/types';
import type { ExternalPermitRecord } from '@/lib/permit-intel/providers/provider';
import { PermitApplicationModal } from './PermitApplicationModal';
import { PermitSubmissionModal } from './PermitSubmissionModal';
import { InspectionManager } from './InspectionManager';
import { CredentialsVaultModal } from './CredentialsVaultModal';
import { PermitAnalyticsCard } from './PermitAnalyticsCard';
import styles from './PermitWorkspace.module.css';

export type PermitWorkspaceProps = {
  jobId?: string;
  address?: string | null;
  initialData?: PermitWorkspaceDto | null;
  headingLevel?: 3 | 4;
};

const STATUS_STEPS: { key: PermitApplicationStatus; label: string; stepNumber: number }[] = [
  { key: 'draft', label: 'Drafting', stepNumber: 1 },
  { key: 'submitted', label: 'Submitted', stepNumber: 2 },
  { key: 'in_review', label: 'Plan Review', stepNumber: 3 },
  { key: 'issued', label: 'Issued', stepNumber: 4 },
  { key: 'inspection_scheduled', label: 'Inspections', stepNumber: 5 },
  { key: 'closed', label: 'Closed', stepNumber: 6 },
];

export function PermitWorkspace({
  jobId,
  address,
  initialData,
  headingLevel = 4,
}: PermitWorkspaceProps) {
  const [activeDiscipline, setActiveDiscipline] = useState<JurisdictionDiscipline>('building');
  const [data, setData] = useState<PermitWorkspaceDto | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(!initialData && Boolean(jobId || address));
  const [error, setError] = useState<string | null>(null);

  // Inspections state
  const [inspections, setInspections] = useState<JobPermitInspection[]>(initialData?.inspections || []);

  // Permit application, submission and credentials vault modal states
  const [isAppModalOpen, setIsAppModalOpen] = useState<boolean>(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [isVaultOpen, setIsVaultOpen] = useState<boolean>(false);

  // Permit history state
  const [historyRecords, setHistoryRecords] = useState<ExternalPermitRecord[]>([]);
  const [portalSearchUrl, setPortalSearchUrl] = useState<string | null>(null);

  // Workflow mutations state
  const [currentStatus, setCurrentStatus] = useState<PermitApplicationStatus>('draft');
  const [permitNumber, setPermitNumber] = useState<string>('');
  const [savingStatus, setSavingStatus] = useState<boolean>(false);
  const [savingPermitNum, setSavingPermitNum] = useState<boolean>(false);
  const [permitNumFeedback, setPermitNumFeedback] = useState<string | null>(null);
  const [syncingTasks, setSyncingTasks] = useState<boolean>(false);
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const [loggingFee, setLoggingFee] = useState<boolean>(false);
  const [feeFeedback, setFeeFeedback] = useState<string | null>(null);
  const [customAdminMarkup, setCustomAdminMarkup] = useState<string>('50');
  const [addFeeToInvoice, setAddFeeToInvoice] = useState<boolean>(true);
  const [syncingStatus, setSyncingStatus] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [sendingNotify, setSendingNotify] = useState<boolean>(false);
  const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);
  const [generatingCoi, setGeneratingCoi] = useState<boolean>(false);
  const [coiFeedback, setCoiFeedback] = useState<string | null>(null);
  const [syncingAccounting, setSyncingAccounting] = useState<boolean>(false);
  const [accountingFeedback, setAccountingFeedback] = useState<string | null>(null);

  const H = (headingLevel === 3 ? 'h3' : 'h4') as 'h3' | 'h4';

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setCurrentStatus(initialData.permitCase?.applicationStatus || 'not_started');
      setPermitNumber(initialData.permitCase?.externalPermitNumber || '');
      setLoading(false);
      return;
    }

    if (!jobId && !address) {
      setData(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const url = jobId ? `/api/jobs/${jobId}/permits?discipline=${activeDiscipline}` : null;

    if (url) {
      fetch(url)
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`Permit intelligence returned status ${res.status}`);
          }
          const json = await res.json();
          if (isMounted) {
            setData(json.data ?? null);
            setCurrentStatus(json.data?.permitCase?.applicationStatus || 'not_started');
            setPermitNumber(json.data?.permitCase?.externalPermitNumber || '');
            setInspections(json.data?.inspections || []);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Error resolving permits');
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoading(false);
          }
        });

      // Fetch existing permit history for property
      fetch(`/api/jobs/${jobId}/permits/history`)
        .then(async (res) => {
          if (!res.ok) return;
          const json = await res.json();
          if (isMounted && json.data) {
            setHistoryRecords(json.data.records || []);
            setPortalSearchUrl(json.data.portalSearchUrl || null);
          }
        })
        .catch((err) => console.warn('Could not load permit history:', err));
    } else {
      // Client-only fallback if no jobId
      import('@/lib/permit-intel').then(({ getPermitIntelligence, getPropertyPermitHistory }) => {
        getPermitIntelligence({ address, discipline: activeDiscipline })
          .then((dto) => {
            if (isMounted) {
              setData(dto);
              setCurrentStatus(dto.permitCase?.applicationStatus || 'not_started');
              setPermitNumber(dto.permitCase?.externalPermitNumber || '');
              setLoading(false);
            }
          })
          .catch((err) => {
            if (isMounted) {
              setError(err instanceof Error ? err.message : 'Error resolving permits');
              setLoading(false);
            }
          });

        if (address) {
          getPropertyPermitHistory(address)
            .then((hist) => {
              if (isMounted) {
                setHistoryRecords(hist.records || []);
                setPortalSearchUrl(hist.portalSearchUrl || null);
              }
            })
            .catch((err) => console.warn('Could not load permit history:', err));
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [jobId, address, initialData, activeDiscipline]);

  // Handler: Update permit lifecycle status
  const handleUpdateStatus = async (newStatus: PermitApplicationStatus) => {
    if (!jobId) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          applicationStatus: newStatus,
          externalPermitNumber: permitNumber || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to update permit status');
      const json = await res.json();
      if (json.permitCase) {
        setCurrentStatus(json.permitCase.applicationStatus);
        setPermitNumFeedback('Status updated!');
        setTimeout(() => setPermitNumFeedback(null), 3000);
      }
    } catch (err) {
      console.error(err);
      alert('Could not update permit status. Check permissions.');
    } finally {
      setSavingStatus(false);
    }
  };

  // Handler: Save permit number
  const handleSavePermitNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_status',
          applicationStatus: currentStatus === 'not_started' ? 'issued' : currentStatus,
          externalPermitNumber: permitNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to save permit number');
      setPermitNumFeedback('Saved permit #');
      setTimeout(() => setPermitNumFeedback(null), 3000);
    } catch (err) {
      console.error(err);
      alert('Could not save permit number.');
    } finally {
      setSavingStatus(false);
    }
  };

  // Handler: Sync requirements to job checklist
  const handleSyncTasks = async () => {
    if (!jobId || !data) return;
    setSyncingTasks(true);
    setTaskFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_tasks',
          authorityName: data.authority.name,
          documents: data.requirement.requiredDocuments,
          inspections: data.requirement.requiredInspections,
        }),
      });

      if (!res.ok) throw new Error('Failed to sync checklist tasks');
      const json = await res.json();
      setTaskFeedback(`✓ Synced ${json.added} tasks to Checklist!`);
      setTimeout(() => setTaskFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Failed to sync checklist tasks.');
    } finally {
      setSyncingTasks(false);
    }
  };

  // Handler: Record permit fee to job expenses with markup and invoice sync
  const handleRecordFee = async () => {
    if (!jobId || !data || !data.requirement.estimatedGovernmentFee) return;
    const fee = data.requirement.estimatedGovernmentFee.estimatedTotal;
    const markup = Number(customAdminMarkup) || 0;
    setLoggingFee(true);
    setFeeFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_fee',
          feeAmount: fee,
          markupAmount: markup,
          addToInvoice: addFeeToInvoice,
          authorityName: data.authority.name,
          receiptRef: permitNumber || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to record fee');
      const json = await res.json();
      setFeeFeedback(
        addFeeToInvoice && json.invoiceItem
          ? `✓ Logged $${fee.toFixed(2)} cost & billed $${(fee + markup).toFixed(2)} on invoice!`
          : `✓ Logged $${fee.toFixed(2)} to Job Expenses!`,
      );
      setTimeout(() => setFeeFeedback(null), 5000);
    } catch (err) {
      console.error(err);
      alert('Failed to record fee to job expenses.');
    } finally {
      setLoggingFee(false);
    }
  };

  // Handler: Sync status from municipal provider
  const handleSyncRemoteStatus = async () => {
    if (!jobId) return;
    setSyncingStatus(true);
    setSyncFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/sync`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to sync');
      if (json.data) {
        setCurrentStatus(json.data.currentStatus);
        if (json.data.externalPermitNumber) {
          setPermitNumber(json.data.externalPermitNumber);
        }
        setSyncFeedback(
          json.data.changed ? `✓ Status updated to ${json.data.currentStatus}` : '✓ Status is up to date',
        );
        setTimeout(() => setSyncFeedback(null), 4000);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to refresh status from municipal records.');
    } finally {
      setSyncingStatus(false);
    }
  };

  // Handler: Send homeowner milestone notification via SMS
  const handleSendNotification = async () => {
    if (!jobId || !data) return;
    setSendingNotify(true);
    setNotifyFeedback(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/permits/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType:
            currentStatus === 'issued'
              ? 'issued'
              : currentStatus === 'submitted'
              ? 'submitted'
              : currentStatus === 'closed'
              ? 'closed'
              : 'submitted',
          authorityName: data.authority.name,
          permitNumber: permitNumber || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setNotifyFeedback(json.error === 'missing_phone' ? '⚠️ No client phone' : '⚠️ Failed to send');
      } else {
        setNotifyFeedback('✓ Text sent to client!');
      }
      setTimeout(() => setNotifyFeedback(null), 4000);
    } catch {
      setNotifyFeedback('⚠️ Failed to send');
      setTimeout(() => setNotifyFeedback(null), 4000);
    } finally {
      setSendingNotify(false);
    }
  };

  // Handler: Generate Municipal ACORD 25 Certificate of Insurance
  const handleGenerateCoi = async () => {
    if (!data) return;
    setGeneratingCoi(true);
    setCoiFeedback(null);
    try {
      const res = await fetch('/api/permits/coi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipality: {
            authorityName: data.authority.name,
            agencyName: data.authority.agencyName || `${data.authority.name} Building Dept`,
            city: data.location.address.city || data.location.jurisdiction.cityOrTownship || 'Local City',
            state: data.location.address.state || data.location.jurisdiction.state || 'MI',
            address: data.authority.contact.address,
          },
          projectAddress: address || undefined,
          format: 'html',
        }),
      });

      if (!res.ok) throw new Error('Failed to generate COI');
      const html = await res.text();
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
      }
      setCoiFeedback('✓ COI Generated!');
      setTimeout(() => setCoiFeedback(null), 4000);
    } catch {
      alert('Failed to generate ACORD 25 Certificate of Insurance.');
    } finally {
      setGeneratingCoi(false);
    }
  };

  // Handler: 1-Click Sync to QuickBooks Online / Xero Ledger
  const handleSyncAccounting = async () => {
    if (!jobId) return;
    setSyncingAccounting(true);
    setAccountingFeedback(null);
    try {
      const res = await fetch('/api/accounting/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, platform: 'quickbooks_online' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed to sync ledger');
      const margin = json.ledger?.profitability?.grossMarginPercent ?? 0;
      setAccountingFeedback(`✓ Synced to Accounting (Margin: ${margin}%)`);
      setTimeout(() => setAccountingFeedback(null), 5000);
    } catch {
      alert('Failed to sync to accounting ledger.');
    } finally {
      setSyncingAccounting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingCard} role="status" aria-live="polite">
        <div className={styles.spinner} aria-hidden="true" />
        <p>Resolving jurisdiction and governing building codes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorCard}>
        <p>⚠️ Unable to load permit workspace: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.emptyCard}>
        <p>No address on file to resolve municipal permit requirements.</p>
      </div>
    );
  }

  const { summary, authority, requirement, codes, localAmendments, freshness, work } = data;

  const heroStyle =
    summary.verdict === 'required'
      ? styles.heroRequired
      : summary.verdict === 'not_required'
      ? styles.heroNotRequired
      : styles.heroVerify;

  const badgeStyle =
    summary.verdict === 'required'
      ? styles.badgeRequired
      : summary.verdict === 'not_required'
      ? styles.badgeNotRequired
      : styles.badgeVerify;

  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className={styles.container}>
      {/* Trade Discipline Switcher */}
      <div className={styles.tradeSwitcher} role="tablist" aria-label="Trade Discipline">
        <button
          type="button"
          role="tab"
          aria-selected={activeDiscipline === 'building'}
          onClick={() => setActiveDiscipline('building')}
          className={`${styles.tradeTab} ${activeDiscipline === 'building' ? styles.tradeTabActive : ''}`}
        >
          🔨 Building &amp; Roofing
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeDiscipline === 'electrical'}
          onClick={() => setActiveDiscipline('electrical')}
          className={`${styles.tradeTab} ${activeDiscipline === 'electrical' ? styles.tradeTabActive : ''}`}
        >
          ⚡ Electrical
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeDiscipline === 'mechanical'}
          onClick={() => setActiveDiscipline('mechanical')}
          className={`${styles.tradeTab} ${activeDiscipline === 'mechanical' ? styles.tradeTabActive : ''}`}
        >
          ❄️ Mechanical &amp; HVAC
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeDiscipline === 'plumbing'}
          onClick={() => setActiveDiscipline('plumbing')}
          className={`${styles.tradeTab} ${activeDiscipline === 'plumbing' ? styles.tradeTabActive : ''}`}
        >
          🚿 Plumbing
        </button>
      </div>

      {/* 1. Hero Requirement Verdict Banner */}
      <section className={`${styles.heroBanner} ${heroStyle}`}>
        <div className={styles.heroTop}>
          <span className={`${styles.heroBadge} ${badgeStyle}`}>
            {summary.verdict === 'required' && '● Permit Required'}
            {summary.verdict === 'not_required' && '✓ Permit Not Required'}
            {summary.verdict === 'verify' && '⚡ Verify with Authority'}
          </span>
          <span className={styles.freshnessTag}>
            Source: {freshness.sourceName} · Verified {freshness.effectiveDate || '2026'}
          </span>
        </div>
        <h2 className={styles.heroTitle}>{summary.headline}</h2>
        <p className={styles.heroDescription}>{summary.description}</p>

        {requirement.estimatedGovernmentFee && (
          <div className={styles.feeBox} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <span className={styles.feeLabel}>Estimated Municipal Permit Fee</span>
                <div className={styles.feeAmount}>
                  ${requirement.estimatedGovernmentFee.estimatedTotal.toFixed(2)}
                </div>
              </div>

              {jobId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text)' }}>
                    <span>Admin Surcharge: $</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={customAdminMarkup}
                      onChange={(e) => setCustomAdminMarkup(e.target.value)}
                      style={{ width: '60px', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid var(--line)', background: 'var(--surface)' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={addFeeToInvoice}
                      onChange={(e) => setAddFeeToInvoice(e.target.checked)}
                      style={{ accentColor: '#38bdf8' }}
                    />
                    <span>Add to Active Invoice (${(requirement.estimatedGovernmentFee.estimatedTotal + (Number(customAdminMarkup) || 0)).toFixed(2)})</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleRecordFee}
                    disabled={loggingFee}
                    className={styles.secondaryButton}
                    title="Log cost to job expenses and optionally bill to invoice"
                  >
                    {loggingFee ? 'Recording...' : `Log & Bill ($${requirement.estimatedGovernmentFee.estimatedTotal.toFixed(0)})`}
                  </button>
                </div>
              )}
            </div>
            {feeFeedback && <div className={styles.successFeedback} style={{ alignSelf: 'flex-start' }}>{feeFeedback}</div>}
          </div>
        )}
      </section>

      {/* 2. Internal Permit Case Lifecycle Tracker (Jobs Only) */}
      {jobId && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <H className={styles.cardTitle}>
              <svg className={styles.cardIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Permit Case Lifecycle
            </H>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleSyncRemoteStatus}
                disabled={syncingStatus}
                className={styles.secondaryButton}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                {syncingStatus ? 'Checking...' : '🔄 Check Status'}
              </button>
              {syncFeedback && <span className={styles.successFeedback}>{syncFeedback}</span>}
              {permitNumFeedback && <span className={styles.successFeedback}>{permitNumFeedback}</span>}
            </div>
          </div>

          <div className={styles.stepperWrapper}>
            {STATUS_STEPS.map((step, idx) => {
              const isActive = step.key === currentStatus;
              const isPast = currentStepIndex >= 0 && idx < currentStepIndex;
              const stepClass = isActive
                ? styles.stepActive
                : isPast
                ? styles.stepCompleted
                : '';

              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => handleUpdateStatus(step.key)}
                  disabled={savingStatus}
                  className={`${styles.stepButton} ${stepClass}`}
                >
                  <span className={styles.stepIndicator}>
                    {isPast ? '✓' : step.stepNumber}
                  </span>
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.controlsGrid}>
            <form onSubmit={handleSavePermitNumber} className={styles.controlField}>
              <label className={styles.controlLabel} htmlFor="permit-num-input">
                Official Permit Number
              </label>
              <div className={styles.inputRow}>
                <input
                  id="permit-num-input"
                  type="text"
                  placeholder="e.g. PB-2026-0891"
                  value={permitNumber}
                  onChange={(e) => setPermitNumber(e.target.value)}
                  className={styles.textInput}
                />
                <button
                  type="submit"
                  disabled={savingStatus}
                  className={styles.primaryButton}
                >
                  Save #
                </button>
              </div>
            </form>

            <div className={styles.controlField}>
              <label className={styles.controlLabel}>Checklist Synchronization</label>
              <div className={styles.inputRow}>
                <button
                  type="button"
                  onClick={handleSyncTasks}
                  disabled={syncingTasks}
                  className={styles.secondaryButton}
                >
                  {syncingTasks ? 'Adding Tasks...' : 'Sync Tasks to Checklist →'}
                </button>
                {taskFeedback && <span className={styles.successFeedback}>{taskFeedback}</span>}
              </div>
            </div>

            <div className={styles.controlField}>
              <label className={styles.controlLabel}>Official Submittals &amp; Integrations</label>
              <div className={styles.inputRow}>
                <button
                  type="button"
                  onClick={() => setIsAppModalOpen(true)}
                  className={styles.secondaryButton}
                >
                  📄 Draft Packet...
                </button>
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(true)}
                  className={styles.primaryButton}
                >
                  🚀 Authorize &amp; Submit...
                </button>
                <button
                  type="button"
                  onClick={handleGenerateCoi}
                  disabled={generatingCoi}
                  className={styles.secondaryButton}
                  title="Generate official ACORD 25 Certificate naming municipality as Additional Insured"
                >
                  {generatingCoi ? 'Generating...' : coiFeedback || '🛡️ Municipal COI'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsVaultOpen(true)}
                  className={styles.secondaryButton}
                >
                  🔐 Credentials &amp; PINs...
                </button>
                <button
                  type="button"
                  onClick={handleSendNotification}
                  disabled={sendingNotify}
                  className={styles.secondaryButton}
                  title="Send milestone SMS update to the client phone on file"
                >
                  {sendingNotify ? 'Sending...' : notifyFeedback || '📢 Text Client Update'}
                </button>
                {jobId && (
                  <button
                    type="button"
                    onClick={handleSyncAccounting}
                    disabled={syncingAccounting}
                    className={styles.secondaryButton}
                    title="Sync job invoice, permit fees, and PO material expenses to QuickBooks/Xero"
                  >
                    {syncingAccounting ? 'Syncing...' : accountingFeedback || '📊 Sync Accounting'}
                  </button>
                )}
                {jobId && (
                  <a
                    href={`/api/jobs/${jobId}/permits/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.secondaryButton}
                    title="Generate and download official PDF application packet"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                  >
                    📥 Download PDF
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2.5 Municipal Inspection Milestones (Jobs Only) */}
      {jobId && inspections.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <H className={styles.cardTitle}>
              <svg
                className={styles.cardIcon}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Municipal Inspection Milestones
            </H>
            <span className={styles.freshnessTag}>
              {inspections.filter((i) => i.status === 'passed').length} of {inspections.length} Passed
            </span>
          </div>

          <InspectionManager
            jobId={jobId}
            inspections={inspections}
            onInspectionUpdated={() => {
              fetch(`/api/jobs/${jobId}/permits/inspections`)
                .then((r) => r.json())
                .then((j) => {
                  if (j.inspections) setInspections(j.inspections);
                })
                .catch(console.warn);
            }}
          />
        </section>
      )}

      {/* 3. Authority & Official Portal Action */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <H className={styles.cardTitle}>
            <svg
              className={styles.cardIcon}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            Enforcing Authority
          </H>
          <span className={styles.freshnessTag}>
            Discipline: {authority.discipline.toUpperCase()}
          </span>
        </div>

        <dl className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <dt>Jurisdiction</dt>
            <dd>{authority.name}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Agency / Division</dt>
            <dd>{authority.agencyName}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Office Phone</dt>
            <dd>
              {authority.contact.phone ? (
                <a href={`tel:${authority.contact.phone.replace(/[^\d]/g, '')}`}>
                  {authority.contact.phone}
                </a>
              ) : (
                'Not listed'
              )}
            </dd>
          </div>
          <div className={styles.metaItem}>
            <dt>Office Hours</dt>
            <dd>{authority.contact.officeHours || 'Standard Municipal Hours'}</dd>
          </div>
          {authority.contact.inspectorHours && (
            <div className={styles.metaItem}>
              <dt>Inspector Call-in Hours</dt>
              <dd>{authority.contact.inspectorHours}</dd>
            </div>
          )}
          <div className={styles.metaItem}>
            <dt>Project Scope</dt>
            <dd>
              {work.trade.toUpperCase()} · {work.scope} ({work.roofSquares || 22} squares)
            </dd>
          </div>
        </dl>

        {authority.portalAction && (
          <div className={styles.portalActionBox}>
            <a
              href={authority.portalAction.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.portalButton}
            >
              {authority.portalAction.label} ↗
            </a>
            {authority.portalAction.pinInstructions && (
              <p className={styles.portalNotice}>
                ℹ️ {authority.portalAction.pinInstructions}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 4. Required Documents & Inspections */}
      {requirement.decision !== 'not_required' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <H className={styles.cardTitle}>
              <svg
                className={styles.cardIcon}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              Requirements &amp; Submittals
            </H>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            <div>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 600 }}>
                Required Documents
              </dt>
              <ul className={styles.checkList}>
                {requirement.requiredDocuments.map((doc, i) => (
                  <li key={i} className={styles.checkListItem}>
                    <span className={styles.checkIcon} aria-hidden="true">✓</span>
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <dt style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 600 }}>
                Required Inspection Milestones
              </dt>
              <ul className={styles.checkList}>
                {requirement.requiredInspections.map((insp, i) => (
                  <li key={i} className={styles.checkListItem}>
                    <span className={styles.checkIcon} aria-hidden="true">🔍</span>
                    <span>{insp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 5. Governing Codes & Local Amendments */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <H className={styles.cardTitle}>
            <svg
              className={styles.cardIcon}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            Applicable Codes &amp; Standards
          </H>
        </div>

        <div className={styles.codeList}>
          {codes.flatMap((c) => c.references).map((ref, i) => (
            <div key={`code-${i}`} className={styles.codeItem}>
              <div className={styles.codeItemTop}>
                <span className={styles.codeSection}>
                  {ref.codeFamily} § {ref.section}
                </span>
                <span className={styles.codeTitle}>{ref.title}</span>
              </div>
              <p className={styles.codeSummary}>{ref.plainEnglishSummary}</p>
              {ref.citationUrl && (
                <a
                  href={ref.citationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.codeLink}
                >
                  View official code reference ↗
                </a>
              )}
            </div>
          ))}

          {localAmendments.map((amend, i) => (
            <div key={`amend-${i}`} className={styles.codeItem}>
              <div className={styles.codeItemTop}>
                <span className={styles.codeSection} style={{ color: '#fbbf24' }}>
                  Local Ordinance · {amend.section}
                </span>
                <span className={styles.codeTitle}>{amend.title}</span>
              </div>
              <p className={styles.codeSummary}>{amend.plainEnglishSummary}</p>
              {amend.citationUrl && (
                <a
                  href={amend.citationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.codeLink}
                >
                  View municipal ordinance ↗
                </a>
              )}
            </div>
          ))}
        </div>

        <p className={styles.disclaimer}>{requirement.disclaimer}</p>
      </section>

      {/* 5.5 Municipal Turnaround Times & Analytics */}
      <PermitAnalyticsCard />

      {/* 6. Existing Permit History for Property */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <H className={styles.cardTitle}>
            <svg
              className={styles.cardIcon}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Existing Permit History
          </H>
          {portalSearchUrl && (
            <a
              href={portalSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.codeLink}
            >
              Search Municipal Database ↗
            </a>
          )}
        </div>

        {historyRecords.length > 0 ? (
          <div className={styles.historyTableWrapper}>
            <table className={styles.historyTable}>
              <thead>
                <tr>
                  <th>Permit #</th>
                  <th>Type / Trade</th>
                  <th>Issue Date</th>
                  <th>Status</th>
                  <th>Valuation</th>
                  <th>Contractor</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map((rec) => (
                  <tr key={rec.permitNumber}>
                    <td style={{ fontWeight: 600, color: '#38bdf8' }}>{rec.permitNumber}</td>
                    <td>{rec.permitType}</td>
                    <td>{rec.issueDate || '—'}</td>
                    <td>
                      <span className={styles.historyStatusBadge}>
                        {rec.status}
                      </span>
                    </td>
                    <td>{rec.valuation ? `$${rec.valuation.toLocaleString()}` : '—'}</td>
                    <td style={{ color: '#cbd5e1' }}>{rec.contractorName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.historyEmpty}>
            No prior public permits returned for this address. Use the search link above to check the municipal archive directly.
          </div>
        )}
      </section>

      {jobId && (
        <>
          <PermitApplicationModal
            jobId={jobId}
            isOpen={isAppModalOpen}
            onClose={() => setIsAppModalOpen(false)}
          />
          {data && (
            <PermitSubmissionModal
              jobId={jobId}
              isOpen={isSubmitModalOpen}
              onClose={() => setIsSubmitModalOpen(false)}
              workspaceData={data}
              onSubmitted={(subResult) => {
                setCurrentStatus(subResult.status);
                setPermitNumber(subResult.externalReferenceNumber);
              }}
            />
          )}
          <CredentialsVaultModal
            isOpen={isVaultOpen}
            onClose={() => setIsVaultOpen(false)}
          />
        </>
      )}
    </div>
  );
}
