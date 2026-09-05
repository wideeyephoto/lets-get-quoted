'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  FileText,
  ShieldCheck,
  Search,
  Check,
  Copy,
  AlertTriangle,
  Activity,
  Calculator,
  HelpCircle,
  Scale,
  Loader2,
  CheckCircle2,
  FolderOpen,
  PlusCircle,
  Save,
  Trash2,
  User,
  Briefcase,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  buildSupplementAnalysis,
  evaluateDamageClaimFeasibilityHeuristic,
  generateAdjusterLetterDraft,
  extractClaimMetadataFromText,
  HOMEOWNER_CLAIM_FAQS,
  type ClaimFeasibilityAssessment,
  type SupplementAnalysisResult,
  type InsuranceClaimRecord,
  type InsuranceClaimStatus,
} from '@/lib/insurance-claims';
import {
  getInsuranceTradeProfile,
  UPPA_COMPLIANCE_RULES,
  type InsuranceTradeProfile,
} from '@/lib/trade-insurance';
import {
  analyzeScopeWithAiAction,
  evaluateFeasibilityWithAiAction,
  getClaimCopilotAnswerAction,
  saveInsuranceClaimAction,
  deleteInsuranceClaimAction,
} from './actions';
import styles from './claims.module.css';

type ClientOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type JobOption = {
  id: string;
  label: string;
  status: string;
  clientId: string | null;
};

type Props = {
  tradeSlug?: string;
  businessName?: string;
  initialSiteClaimsEnabled?: boolean;
  initialClaims?: InsuranceClaimRecord[];
  clients?: ClientOption[];
  jobs?: JobOption[];
  canWrite?: boolean;
};

const SAMPLE_ROOFING_SCOPE = `STATE FARM FIRE AND CASUALTY COMPANY
CLAIM NUMBER: 49-8821-X01
INSURED: Robert & Sarah Jenkins
LOSS LOCATION: 1422 Meadowbrook Lane
DATE OF LOSS: 08/14/2026 - Hail & Wind Storm

SUMMARY OF LOSS:
Line Item 1: Tear off 3-tab shingles (28.33 SQ) - $1,416.50
Line Item 2: 3-tab composition shingles - install (28.33 SQ) - $6,232.60
Line Item 3: Felt underlayment 15 lb (28.33 SQ) - $566.60
Line Item 4: Continuous ridge vent (45 LF) - $495.00
Line Item 5: Paint pipe jack flashing (3 EA) - $90.00

TOTAL REPLACEMENT COST VALUE (RCV): $8,799.70
LESS DEPRECIATION: ($2,400.00)
ACTUAL CASH VALUE (ACV): $6,399.70
LESS DEDUCTIBLE: ($1,500.00)
NET PAYMENT ISSUED: $4,899.70`;

export default function InsuranceClaimsClient({
  tradeSlug = 'roofers',
  businessName = 'Our Company',
  initialSiteClaimsEnabled = true,
  initialClaims = [],
  clients = [],
  jobs = [],
  canWrite = true,
}: Props) {
  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(tradeSlug);

  const [activeTab, setActiveTab] = useState<'supplements' | 'claims_list' | 'feasibility' | 'copilot'>('supplements');
  const [siteClaimsEnabled, setSiteClaimsEnabled] = useState(initialSiteClaimsEnabled);
  const [isPending, startTransition] = useTransition();

  // Claims persistence state
  const [claims, setClaims] = useState<InsuranceClaimRecord[]>(initialClaims);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState<InsuranceClaimStatus>('draft');
  const [isSavingClaim, setIsSavingClaim] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Tab 1: Scope & Supplement Finder State
  const [scopeInput, setScopeInput] = useState('');
  const [analysis, setAnalysis] = useState<SupplementAnalysisResult>(() =>
    buildSupplementAnalysis('', tradeSlug)
  );
  const [claimNumber, setClaimNumber] = useState('');
  const [policyholder, setPolicyholder] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [adjusterName, setAdjusterName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [dateOfLoss, setDateOfLoss] = useState('');
  const [copiedLetter, setCopiedLetter] = useState(false);
  const [isSampleLoaded, setIsSampleLoaded] = useState(false);

  // Tab 2: Feasibility State
  const [damageDesc, setDamageDesc] = useState(
    'Hail storm on Thursday dented the gutters, bruised shingle granules, and caused a leak into the ceiling above the master bedroom.'
  );
  const [perilType, setPerilType] = useState('Hail & Windstorm');
  const [roofAge, setRoofAge] = useState(12);
  const [deductible, setDeductible] = useState(1000);
  const [feasibility, setFeasibility] = useState<ClaimFeasibilityAssessment>(() =>
    evaluateDamageClaimFeasibilityHeuristic({
      tradeSlug,
      damageDescription: damageDesc,
      reportedPeril: perilType,
      approxAgeYears: roofAge,
      knownDeductible: deductible,
    })
  );

  // Tab 3: Custom AI Copilot Question State
  const [customQuestion, setCustomQuestion] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [isAskingCopilot, setIsAskingCopilot] = useState(false);

  // P1 Fix: Reactively derive adjuster letter so it NEVER goes stale when metadata fields change
  const activeLetterDraft = useMemo(() => {
    return generateAdjusterLetterDraft({
      tradeSlug,
      claimNumber: claimNumber.trim() || '[Claim #]',
      policyholderName: policyholder.trim() || '[Policyholder Name]',
      propertyAddress: propertyAddress.trim() || '[Property Address]',
      adjusterName: adjusterName.trim() || 'Adjuster Team',
      carrierName: carrierName.trim() || '[Insurance Carrier]',
      dateOfLoss: dateOfLoss.trim() || '[Date of Loss]',
      discrepancies: analysis.discrepancies,
      initialRcv: analysis.parsedFigures.rcv,
    });
  }, [
    tradeSlug,
    claimNumber,
    policyholder,
    propertyAddress,
    adjusterName,
    carrierName,
    dateOfLoss,
    analysis.discrepancies,
    analysis.parsedFigures.rcv,
  ]);

  // Auto-extract metadata from scope text if fields are blank
  const maybeExtractMetadata = (text: string) => {
    const meta = extractClaimMetadataFromText(text);
    if (meta.claimNumber && !claimNumber) setClaimNumber(meta.claimNumber);
    if (meta.policyholderName && !policyholder) setPolicyholder(meta.policyholderName);
    if (meta.propertyAddress && !propertyAddress) setPropertyAddress(meta.propertyAddress);
    if (meta.carrierName && !carrierName) setCarrierName(meta.carrierName);
    if (meta.dateOfLoss && !dateOfLoss) setDateOfLoss(meta.dateOfLoss);
    if (meta.adjusterName && !adjusterName) setAdjusterName(meta.adjusterName);
  };

  const loadSampleScope = () => {
    setScopeInput(SAMPLE_ROOFING_SCOPE);
    setClaimNumber('49-8821-X01');
    setPolicyholder('Robert & Sarah Jenkins');
    setPropertyAddress('1422 Meadowbrook Lane');
    setAdjusterName('Adjuster Team');
    setCarrierName('State Farm');
    setDateOfLoss('08/14/2026 - Hail & Wind Storm');
    setIsSampleLoaded(true);
    startTransition(() => {
      const res = buildSupplementAnalysis(SAMPLE_ROOFING_SCOPE, tradeSlug);
      setAnalysis(res);
    });
  };

  const clearScope = () => {
    setScopeInput('');
    setClaimNumber('');
    setPolicyholder('');
    setPropertyAddress('');
    setAdjusterName('');
    setCarrierName('');
    setDateOfLoss('');
    setSelectedClaimId(null);
    setSelectedClientId(null);
    setSelectedJobId(null);
    setClaimStatus('draft');
    setIsSampleLoaded(false);
    startTransition(() => {
      const res = buildSupplementAnalysis('', tradeSlug);
      setAnalysis(res);
    });
  };

  // Toggle single discrepancy checkbox
  const toggleDiscrepancy = (id: string) => {
    const updatedDiscrepancies = analysis.discrepancies.map((d) =>
      d.id === id ? { ...d, selected: !d.selected } : d
    );
    const totalSupplement = updatedDiscrepancies
      .filter((d) => d.selected)
      .reduce((sum, d) => sum + d.estimatedCost, 0);

    const adjustedRcv = analysis.parsedFigures.rcv
      ? analysis.parsedFigures.rcv + totalSupplement
      : null;

    setAnalysis({
      ...analysis,
      discrepancies: updatedDiscrepancies,
      totalEstimatedSupplement: totalSupplement,
      adjustedTotalRcv: adjustedRcv,
    });
  };

  const runScopeAnalysis = async () => {
    if (!scopeInput.trim()) {
      clearScope();
      return;
    }

    maybeExtractMetadata(scopeInput);

    startTransition(async () => {
      try {
        const res = await analyzeScopeWithAiAction({ scopeText: scopeInput, tradeSlug });
        setAnalysis(res);
      } catch {
        const res = buildSupplementAnalysis(scopeInput, tradeSlug);
        setAnalysis(res);
      }
    });
  };

  const runFeasibilityEvaluation = async () => {
    startTransition(async () => {
      try {
        const res = await evaluateFeasibilityWithAiAction({
          tradeSlug,
          damageDescription: damageDesc,
          reportedPeril: perilType,
          approxAgeYears: roofAge,
          knownDeductible: deductible,
        });
        setFeasibility(res);
      } catch {
        const res = evaluateDamageClaimFeasibilityHeuristic({
          tradeSlug,
          damageDescription: damageDesc,
          reportedPeril: perilType,
          approxAgeYears: roofAge,
          knownDeductible: deductible,
        });
        setFeasibility(res);
      }
    });
  };

  const handleAskCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim() || isAskingCopilot) return;

    setIsAskingCopilot(true);
    try {
      const answer = await getClaimCopilotAnswerAction({
        question: customQuestion,
        tradeSlug,
      });
      setCopilotAnswer(answer);
    } catch {
      setCopilotAnswer(
        'As your contractor, we provide detailed physical damage documentation and itemized repair estimates to support your property restoration. Please consult your insurance adjuster for specific policy coverage limits and endorsements.'
      );
    } finally {
      setIsAskingCopilot(false);
    }
  };

  const copyLetterToClipboard = () => {
    navigator.clipboard.writeText(activeLetterDraft);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2500);
  };

  // Client dropdown auto-fill
  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId || null);
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      if (!policyholder || policyholder === '[Policyholder Name]') {
        setPolicyholder(client.name);
      }
      if (client.address && (!propertyAddress || propertyAddress === '[Property Address]')) {
        setPropertyAddress(client.address);
      }
    }
  };

  // Job dropdown auto-fill
  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId || null);
    if (!jobId) return;
    const job = jobs.find((j) => j.id === jobId);
    if (job && job.clientId && !selectedClientId) {
      handleSelectClient(job.clientId);
    }
  };

  // Save / Update Claim persistence action
  const handleSaveClaim = async () => {
    if (!canWrite) {
      setSaveFeedback({ type: 'error', message: 'You need jobs.write permission to save claims.' });
      setTimeout(() => setSaveFeedback(null), 3000);
      return;
    }

    setIsSavingClaim(true);
    try {
      const res = await saveInsuranceClaimAction({
        id: selectedClaimId || undefined,
        clientId: selectedClientId || null,
        jobId: selectedJobId || null,
        claimNumber: claimNumber.trim() || null,
        policyholderName: policyholder.trim() || null,
        propertyAddress: propertyAddress.trim() || null,
        carrierName: carrierName.trim() || null,
        adjusterName: adjusterName.trim() || null,
        dateOfLoss: dateOfLoss.trim() || null,
        scopeText: scopeInput,
        parsedFigures: analysis.parsedFigures,
        discrepancies: analysis.discrepancies,
        totalSupplementAmount: analysis.totalEstimatedSupplement,
        revisedRcvAmount: analysis.adjustedTotalRcv,
        justificationLetter: activeLetterDraft,
        status: claimStatus,
        tradeSlug,
      });

      if (res.ok) {
        setSelectedClaimId(res.claim.id);
        setClaims((prev) => {
          const idx = prev.findIndex((c) => c.id === res.claim.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.claim;
            return next;
          }
          return [res.claim, ...prev];
        });
        setSaveFeedback({ type: 'success', message: 'Claim saved successfully!' });
      } else {
        setSaveFeedback({ type: 'error', message: res.message });
      }
    } catch (err) {
      setSaveFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error saving claim',
      });
    } finally {
      setIsSavingClaim(false);
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  // Load a claim from the list into the studio
  const handleLoadClaim = (claim: InsuranceClaimRecord) => {
    setSelectedClaimId(claim.id);
    setSelectedClientId(claim.client_id);
    setSelectedJobId(claim.job_id);
    setClaimNumber(claim.claim_number || '');
    setPolicyholder(claim.policyholder_name || '');
    setPropertyAddress(claim.property_address || '');
    setCarrierName(claim.carrier_name || '');
    setAdjusterName(claim.adjuster_name || '');
    setDateOfLoss(claim.date_of_loss || '');
    setClaimStatus(claim.status);
    setScopeInput(claim.scope_text || '');
    setAnalysis({
      tradeSlug: claim.trade_slug,
      parsedFigures: claim.parsed_figures || { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
      rawScopeSummary: claim.scope_text ? `Loaded saved claim with ${claim.discrepancies?.length || 0} line items.` : 'Loaded claim.',
      discrepancies: claim.discrepancies || [],
      totalEstimatedSupplement: claim.total_supplement_amount,
      adjustedTotalRcv: claim.revised_rcv_amount,
      justificationDraft: claim.justification_letter || '',
    });
    setActiveTab('supplements');
  };

  // Delete claim
  const handleDeleteClaim = async (claimId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    if (!confirm('Are you sure you want to delete this saved claim?')) return;

    try {
      const res = await deleteInsuranceClaimAction(claimId);
      if (res.ok) {
        setClaims((prev) => prev.filter((c) => c.id !== claimId));
        if (selectedClaimId === claimId) {
          clearScope();
        }
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete claim');
    }
  };

  return (
    <div className={styles.container}>
      {/* Toast Notification */}
      {copiedLetter && (
        <div className={styles.toast}>
          <Check size={16} />
          <span>Adjuster justification letter copied to clipboard!</span>
        </div>
      )}

      {saveFeedback && (
        <div
          className={styles.toast}
          style={{
            background: saveFeedback.type === 'success' ? '#065f46' : '#991b1b',
            borderColor: saveFeedback.type === 'success' ? '#34d399' : '#f87171',
          }}
        >
          {saveFeedback.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Insurance Claims &amp; Supplement Studio</h1>
            <span className={styles.tradeBadge}>{profile.name}</span>
            {businessName && businessName !== 'Our Company' && (
              <span className={styles.tradeBadge}>{businessName}</span>
            )}
          </div>
          <p className={styles.subtitle}>
            Scan adjuster scopes, uncover missed building code items, calculate supplements, and draft UPPA-compliant justification letters.
          </p>
        </div>

        <div>
          <span className={styles.complianceBadge}>
            <ShieldCheck size={15} />
            UPPA Compliant Estimator
          </span>
        </div>
      </div>

      {/* Dead flag wiring: Ineligible trade warning banner */}
      {!siteClaimsEnabled && (
        <div className={styles.ineligibleBanner}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <strong>Notice: Insurance Claims Studio is off by default for {profile.name}</strong>
            <span>
              This workspace trade is currently configured as <code>{tradeSlug}</code>. Insurance claims, Xactimate scope parsing, and supplement drafting are typically utilized by storm restoration, roofing, water mitigation, and structural contractors.
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() => setSiteClaimsEnabled(true)}
                className={styles.btnSecondary}
                style={{ width: 'fit-content', marginTop: '0.35rem' }}
              >
                Enable Insurance Claims Studio for this Session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className={styles.tabNavWrapper}>
        <nav className={styles.tabNav} aria-label="Insurance studio sections">
          <button
            type="button"
            onClick={() => setActiveTab('supplements')}
            className={`${styles.tabButton} ${activeTab === 'supplements' ? styles.tabButtonActive : ''}`}
          >
            <FileText size={16} />
            <span>Scope &amp; Supplement Studio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('claims_list')}
            className={`${styles.tabButton} ${activeTab === 'claims_list' ? styles.tabButtonActive : ''}`}
          >
            <FolderOpen size={16} />
            <span>Saved Claims ({claims.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('feasibility')}
            className={`${styles.tabButton} ${activeTab === 'feasibility' ? styles.tabButtonActive : ''}`}
          >
            <Activity size={16} />
            <span>Claim Feasibility Rater</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={`${styles.tabButton} ${activeTab === 'copilot' ? styles.tabButtonActive : ''}`}
          >
            <HelpCircle size={16} />
            <span>Homeowner FAQ &amp; Co-Pilot</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: SCOPE PARSER & SUPPLEMENT STUDIO */}
      {activeTab === 'supplements' && (
        <div className={styles.column}>
          {/* Top Save & Context Bar */}
          <div className={styles.saveBar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>
                {selectedClaimId ? (
                  <>Editing Claim: <strong>{claimNumber || policyholder || 'Saved Record'}</strong></>
                ) : (
                  'New Claim Estimate (Unsaved)'
                )}
              </span>

              <select
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value as InsuranceClaimStatus)}
                className={styles.select}
                style={{ width: 'auto', minWidth: '150px', height: '34px', padding: '0.2rem 0.6rem' }}
              >
                <option value="draft">Draft</option>
                <option value="scope_received">Scope Received</option>
                <option value="supplement_pending">Supplement Pending</option>
                <option value="approved">Approved</option>
                <option value="invoiced">Invoiced</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className={styles.saveBarActions}>
              {selectedClaimId && (
                <button
                  type="button"
                  onClick={clearScope}
                  className={styles.btnSecondary}
                  style={{ height: '34px', padding: '0.2rem 0.75rem' }}
                >
                  <PlusCircle size={14} />
                  <span>New Blank Claim</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveClaim}
                disabled={isSavingClaim || !canWrite}
                className={styles.btnPrimary}
                style={{ width: 'auto', height: '34px', padding: '0.2rem 1rem' }}
                title={!canWrite ? 'Requires jobs.write capability' : 'Save claim to database'}
              >
                {isSavingClaim ? (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>{selectedClaimId ? 'Update Claim' : 'Save Claim'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className={styles.mainGrid}>
            {/* Left Column: Scope Input & Metadata */}
            <div className={styles.column}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>
                    <FileText size={16} />
                    Adjuster Scope of Loss
                  </h2>

                  <div className={styles.cardActions}>
                    {!isSampleLoaded && (
                      <button
                        type="button"
                        onClick={loadSampleScope}
                        className={styles.btnSecondary}
                        title="Load an authentic sample scope to test parser"
                      >
                        Load Sample Scope
                      </button>
                    )}
                    {scopeInput && (
                      <button
                        type="button"
                        onClick={clearScope}
                        className={styles.btnSecondary}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="scope-input" className={styles.fieldLabel}>
                    Pasted Adjuster Scope / Xactimate Text
                  </label>
                  <textarea
                    id="scope-input"
                    value={scopeInput}
                    onChange={(e) => {
                      setScopeInput(e.target.value);
                      if (isSampleLoaded) setIsSampleLoaded(false);
                      maybeExtractMetadata(e.target.value);
                    }}
                    rows={10}
                    placeholder="Paste the insurance adjuster's estimate or Xactimate line items here..."
                    className={styles.textarea}
                  />
                </div>

                {/* Client and Job Linkers */}
                <div className={styles.formGrid}>
                  {clients.length > 0 && (
                    <div className={styles.formField}>
                      <label htmlFor="client-link" className={styles.fieldLabel}>
                        <User size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Link to Existing Client
                      </label>
                      <select
                        id="client-link"
                        value={selectedClientId || ''}
                        onChange={(e) => handleSelectClient(e.target.value)}
                        className={styles.select}
                      >
                        <option value="">-- No linked client --</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.address ? `(${c.address})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {jobs.length > 0 && (
                    <div className={styles.formField}>
                      <label htmlFor="job-link" className={styles.fieldLabel}>
                        <Briefcase size={13} style={{ display: 'inline', marginRight: 4 }} />
                        Link to Existing Job
                      </label>
                      <select
                        id="job-link"
                        value={selectedJobId || ''}
                        onChange={(e) => handleSelectJob(e.target.value)}
                        className={styles.select}
                      >
                        <option value="">-- No linked job --</option>
                        {jobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Claim Metadata Fields */}
                <div className={styles.formGrid}>
                  <div className={`${styles.formField} ${styles.formColFull}`}>
                    <label htmlFor="property-address" className={styles.fieldLabel}>Property / Loss Address</label>
                    <input
                      id="property-address"
                      type="text"
                      value={propertyAddress}
                      onChange={(e) => setPropertyAddress(e.target.value)}
                      placeholder="e.g. 1422 Meadowbrook Lane"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="claim-number" className={styles.fieldLabel}>Claim Number</label>
                    <input
                      id="claim-number"
                      type="text"
                      value={claimNumber}
                      onChange={(e) => setClaimNumber(e.target.value)}
                      placeholder="e.g. 49-8821-X01"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="carrier-name" className={styles.fieldLabel}>Carrier</label>
                    <input
                      id="carrier-name"
                      type="text"
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      placeholder="e.g. State Farm"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="policyholder-name" className={styles.fieldLabel}>Policyholder</label>
                    <input
                      id="policyholder-name"
                      type="text"
                      value={policyholder}
                      onChange={(e) => setPolicyholder(e.target.value)}
                      placeholder="e.g. Robert &amp; Sarah Jenkins"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="adjuster-name" className={styles.fieldLabel}>Adjuster Name</label>
                    <input
                      id="adjuster-name"
                      type="text"
                      value={adjusterName}
                      onChange={(e) => setAdjusterName(e.target.value)}
                      placeholder="e.g. Desk Adjuster"
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="date-of-loss" className={styles.fieldLabel}>Date of Loss</label>
                    <input
                      id="date-of-loss"
                      type="text"
                      value={dateOfLoss}
                      onChange={(e) => setDateOfLoss(e.target.value)}
                      placeholder="e.g. 08/14/2026 - Storm"
                      className={styles.input}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={runScopeAnalysis}
                  disabled={isPending || !scopeInput.trim() || !canWrite}
                  className={styles.btnPrimary}
                  title={!canWrite ? 'Requires jobs.write capability' : 'Analyze scope with AI'}
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className={styles.spinner} />
                      <span>Analyzing Scope...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span>Scan for Missing Code Items &amp; Supplements</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Financial Cards, Checklist & Reactive Justification Letter */}
            <div className={styles.column}>
              {/* Financial Summary KPI Cards */}
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                  <span className={styles.kpiLabel}>Initial Adjuster RCV</span>
                  <p className={styles.kpiValue}>
                    {analysis.parsedFigures.rcv != null
                      ? `$${analysis.parsedFigures.rcv.toLocaleString()}`
                      : 'N/A'}
                  </p>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiCardEmerald}`}>
                  <span className={styles.kpiLabel}>Recoverable Supplement</span>
                  <p className={`${styles.kpiValue} ${styles.kpiValueEmerald}`}>
                    +${analysis.totalEstimatedSupplement.toLocaleString()}
                  </p>
                </div>
                <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
                  <span className={styles.kpiLabel}>Revised Total RCV</span>
                  <p className={`${styles.kpiValue} ${styles.kpiValueAccent}`}>
                    {analysis.adjustedTotalRcv != null
                      ? `$${analysis.adjustedTotalRcv.toLocaleString()}`
                      : analysis.totalEstimatedSupplement > 0
                      ? `$${analysis.totalEstimatedSupplement.toLocaleString()}`
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Omitted Items Checklist */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <CheckCircle2 size={16} />
                    Omitted Code Items &amp; Supplements ({analysis.discrepancies.filter((d) => d.selected).length} selected)
                  </h3>
                  <span className={styles.tradeBadge}>
                    Total: +${analysis.totalEstimatedSupplement.toLocaleString()}
                  </span>
                </div>

                <div className={styles.checklist}>
                  {analysis.discrepancies.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: '0.86rem', margin: '0.5rem 0' }}>
                      No items detected yet. Paste an adjuster scope and click scan to identify building code omissions.
                    </p>
                  ) : (
                    analysis.discrepancies.map((item) => (
                      <label key={item.id} className={styles.checkItem}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => toggleDiscrepancy(item.id)}
                          className={styles.checkbox}
                        />
                        <div className={styles.itemMeta}>
                          <div className={styles.itemTitleRow}>
                            <span className={styles.itemName}>{item.item}</span>
                            <span className={styles.itemCost}>+${item.estimatedCost.toLocaleString()}</span>
                          </div>
                          <span className={styles.itemReason}>{item.reason}</span>
                          {item.codeCitation && (
                            <span className={styles.citationBadge}>{item.codeCitation}</span>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Formatted Adjuster Letter Output (P1: reactive to metadata fields) */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <FileText size={16} />
                    Adjuster Justification Letter (Live Preview)
                  </h3>
                  <button
                    type="button"
                    onClick={copyLetterToClipboard}
                    className={styles.btnSecondary}
                  >
                    {copiedLetter ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Letter</>}
                  </button>
                </div>

                <div className={styles.disclaimerBanner}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Contractor Notice &amp; Scope Disclaimer:</strong> This draft is generated as a technical construction estimate based on code/manufacturer specifications. It is for contractor scope review and does not constitute legal advice, insurance adjusting, or public adjuster representation.
                  </div>
                </div>

                <pre className={styles.letterPre}>
                  {activeLetterDraft}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SAVED CLAIMS LIST */}
      {activeTab === 'claims_list' && (
        <div className={styles.claimsListContainer}>
          <div className={styles.cardHeader} style={{ background: 'var(--bg-2)', padding: '1rem 1.25rem', borderRadius: 12, border: '1px solid var(--line)' }}>
            <div>
              <h2 className={styles.cardTitle}>
                <FolderOpen size={18} />
                Saved Insurance Claims ({claims.length})
              </h2>
              <p className={styles.subtitle} style={{ marginTop: '0.2rem' }}>
                All adjuster scopes, supplement requests, and dispute letters saved to this workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                clearScope();
                setActiveTab('supplements');
              }}
              className={styles.btnPrimary}
              style={{ width: 'auto', padding: '0.5rem 1.15rem' }}
            >
              <PlusCircle size={15} />
              <span>Create New Claim</span>
            </button>
          </div>

          {claims.length === 0 ? (
            <div className={styles.emptyClaims}>
              <FolderOpen size={36} style={{ opacity: 0.5 }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text)' }}>No insurance claims saved yet</h3>
              <p style={{ margin: 0, fontSize: '0.88rem', maxWidth: 460 }}>
                Scan an adjuster scope in the Studio, adjust the discrepancy items, and click <strong>Save Claim</strong> to persist your work.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('supplements')}
                className={styles.btnSecondary}
                style={{ marginTop: '0.5rem' }}
              >
                Go to Scope Studio
              </button>
            </div>
          ) : (
            <div className={styles.claimsGrid}>
              {claims.map((c) => {
                const badgeClass =
                  c.status === 'approved'
                    ? styles.badgeApproved
                    : c.status === 'supplement_pending' || c.status === 'scope_received'
                    ? styles.badgePending
                    : styles.badgeDraft;

                return (
                  <div
                    key={c.id}
                    onClick={() => handleLoadClaim(c)}
                    className={styles.claimCard}
                  >
                    <div className={styles.claimCardHeader}>
                      <div>
                        <h3 className={styles.claimCardTitle}>
                          {c.policyholder_name || 'Unnamed Policyholder'}
                        </h3>
                        <span className={styles.claimCardSub}>
                          {c.claim_number ? `Claim #${c.claim_number}` : 'No Claim #'} · {c.carrier_name || 'Carrier Unspecified'}
                        </span>
                      </div>

                      <span className={`${styles.claimBadge} ${badgeClass}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>

                    {c.property_address && (
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)' }}>
                        📍 {c.property_address}
                      </p>
                    )}

                    <div className={styles.claimMetaRow}>
                      <div className={styles.claimMetaItem}>
                        <strong>Supplement:</strong>
                        <span style={{ color: 'var(--good, #3dd68c)', fontWeight: 700 }}>
                          +${c.total_supplement_amount.toLocaleString()}
                        </span>
                      </div>

                      {c.parsed_figures?.rcv != null && (
                        <div className={styles.claimMetaItem}>
                          <strong>RCV:</strong> ${c.parsed_figures.rcv.toLocaleString()}
                        </div>
                      )}

                      <div className={styles.claimMetaItem} style={{ marginLeft: 'auto' }}>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClaim(c.id, e)}
                            className={styles.btnSecondary}
                            style={{ padding: '0.2rem 0.5rem', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
                            title="Delete this claim"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.78rem', color: 'var(--accent)' }}>
                          Edit <ExternalLink size={11} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLAIM FEASIBILITY RATER */}
      {activeTab === 'feasibility' && (
        <div className={styles.mainGrid}>
          {/* Left Column: Intake inputs */}
          <div className={styles.column}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <Activity size={16} />
                  Homeowner Damage Symptoms
                </h2>
              </div>

              <div className={styles.formField}>
                <label htmlFor="damage-desc" className={styles.fieldLabel}>Damage Description</label>
                <textarea
                  id="damage-desc"
                  rows={4}
                  value={damageDesc}
                  onChange={(e) => setDamageDesc(e.target.value)}
                  className={styles.textarea}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="peril-type" className={styles.fieldLabel}>Reported Peril / Event</label>
                <input
                  id="peril-type"
                  type="text"
                  value={perilType}
                  onChange={(e) => setPerilType(e.target.value)}
                  className={styles.input}
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label htmlFor="roof-age" className={styles.fieldLabel}>Property / Roof Age (Yrs)</label>
                  <input
                    id="roof-age"
                    type="number"
                    value={roofAge}
                    onChange={(e) => setRoofAge(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="deductible" className={styles.fieldLabel}>Deductible ($)</label>
                  <input
                    id="deductible"
                    type="number"
                    value={deductible}
                    onChange={(e) => setDeductible(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={runFeasibilityEvaluation}
                disabled={isPending || !canWrite}
                className={styles.btnPrimary}
                title={!canWrite ? 'Requires jobs.write capability' : 'Calculate claim viability'}
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <Calculator size={16} />
                    <span>Calculate Claim Viability</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Assessment Output */}
          <div className={styles.column}>
            <div className={styles.card}>
              <div className={styles.scoreHero}>
                <div>
                  <span className={styles.kpiLabel}>Insurance Viability Score</span>
                  <div className={styles.scoreValueWrap}>
                    <span className={styles.scoreNumber}>{feasibility.feasibilityScore}</span>
                    <span className={styles.scoreMax}>/ 100</span>
                  </div>
                </div>

                <span
                  className={
                    feasibility.probability === 'high'
                      ? styles.probBadgeHigh
                      : feasibility.probability === 'moderate'
                      ? styles.probBadgeModerate
                      : styles.probBadgeLow
                  }
                >
                  {feasibility.probability.toUpperCase()} PROBABILITY
                </span>
              </div>

              <div className={styles.recommendationCallout}>
                <strong>Recommendation: </strong>
                {feasibility.recommendation === 'file_claim' && (
                  <span style={{ color: 'var(--good, #3dd68c)', fontWeight: 700 }}>
                    Proceed with formal insurance claim &amp; on-site inspection.
                  </span>
                )}
                {feasibility.recommendation === 'inspection_first' && (
                  <span style={{ color: 'var(--warn, #fdb022)', fontWeight: 700 }}>
                    Perform physical damage inspection before filing claim to verify scope exceeds deductible.
                  </span>
                )}
                {feasibility.recommendation === 'out_of_pocket_maintenance' && (
                  <span style={{ color: 'var(--bad, #fd8a7a)', fontWeight: 700 }}>
                    Quote as out-of-pocket maintenance (likely excluded wear-and-tear).
                  </span>
                )}
              </div>

              <div className={styles.formField}>
                <span className={styles.fieldLabel}>Estimated Scope Range</span>
                <p style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, margin: 0, fontSize: '1.05rem', color: 'var(--text)' }}>
                  ${feasibility.estimatedDamageRange.min.toLocaleString()} – ${feasibility.estimatedDamageRange.max.toLocaleString()}
                </p>
              </div>

              <div className={styles.formField}>
                <span className={styles.fieldLabel}>Detected Perils</span>
                <div className={styles.tagsWrap}>
                  {feasibility.detectedPerils.map((p) => (
                    <span key={p} className={styles.perilTag}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.formField}>
                <span className={styles.fieldLabel}>Key Observations</span>
                <ul className={styles.bulletList}>
                  {feasibility.observedDamagePoints.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>

              {feasibility.riskFactors.length > 0 && (
                <div className={styles.formField}>
                  <span className={styles.fieldLabel} style={{ color: 'var(--warn, #fdb022)' }}>
                    Potential Adjuster Scrutiny / Risk
                  </span>
                  <ul className={styles.riskBulletList}>
                    {feasibility.riskFactors.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.talkingPointBox}>
                <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>
                  Homeowner Talking Point Summary:
                </strong>
                <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
                  {feasibility.homeownerSummary}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOMEOWNER CLAIM COPILOT & FAQS */}
      {activeTab === 'copilot' && (
        <div className={styles.column}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>
                  <HelpCircle size={16} />
                  Homeowner Claims Knowledge Base &amp; Talking Points
                </h2>
                <p className={styles.subtitle} style={{ marginTop: '0.25rem' }}>
                  Use these explanations when homeowners ask confusing questions about deductibles, depreciation release, or insurance rights.
                </p>
              </div>
            </div>

            <div className={styles.faqGrid}>
              {HOMEOWNER_CLAIM_FAQS.map((faq, i) => (
                <div key={i} className={styles.faqCard}>
                  <span className={styles.faqCategory}>{faq.category}</span>
                  <h3 className={styles.faqQuestion}>{faq.question}</h3>
                  <p className={styles.faqShortAnswer}>{faq.shortAnswer}</p>
                  <p className={styles.faqDetail}>{faq.detailedExplanation}</p>
                </div>
              ))}
            </div>

            {/* Interactive Ask Copilot Box */}
            <div className={styles.copilotBox}>
              <div>
                <h3 className={styles.cardTitle}>
                  <Sparkles size={16} />
                  Ask the Claims AI Co-Pilot
                </h3>
                <p className={styles.subtitle} style={{ marginTop: '0.2rem' }}>
                  Ask any homeowner question to get a plain-English, UPPA-compliant response.
                </p>
              </div>
              <form onSubmit={handleAskCopilot} className={styles.copilotForm}>
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="e.g. Can the insurance company force me to use their preferred contractor?"
                  className={styles.input}
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={isAskingCopilot || !customQuestion.trim() || !canWrite}
                  className={styles.btnPrimary}
                  style={{ width: 'auto', minWidth: '140px' }}
                  title={!canWrite ? 'Requires jobs.write capability' : 'Ask AI copilot'}
                >
                  {isAskingCopilot ? (
                    <>
                      <Loader2 size={15} className={styles.spinner} />
                      <span>Thinking...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Ask Co-Pilot</span>
                    </>
                  )}
                </button>
              </form>

              {copilotAnswer && (
                <div className={styles.copilotAnswer}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text)' }}>
                    AI Co-Pilot Answer:
                  </strong>
                  <p style={{ margin: 0, color: 'var(--text)' }}>{copilotAnswer}</p>
                </div>
              )}
            </div>
          </div>

          {/* UPPA Legal Guidelines Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle} style={{ color: 'var(--warn, #fdb022)' }}>
                <Scale size={16} />
                Unauthorized Practice of Public Adjusting (UPPA) Compliance Checklist
              </h3>
            </div>
            <div className={styles.uppaGrid}>
              {UPPA_COMPLIANCE_RULES.map((rule, i) => (
                <div key={i} className={styles.uppaCard}>
                  <p className={styles.uppaRule}>{rule.rule}</p>
                  <p className={styles.uppaGuideline}>{rule.guideline}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
