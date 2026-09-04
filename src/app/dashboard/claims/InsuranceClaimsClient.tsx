'use client';

import { useState, useTransition } from 'react';
import {
  FileText,
  ShieldCheck,
  Gauge,
  MessageSquare,
  Sparkles,
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
} from 'lucide-react';
import {
  buildSupplementAnalysis,
  evaluateDamageClaimFeasibilityHeuristic,
  generateAdjusterLetterDraft,
  HOMEOWNER_CLAIM_FAQS,
  type ClaimFeasibilityAssessment,
  type SupplementAnalysisResult,
} from '@/lib/insurance-claims';
import {
  getInsuranceTradeProfile,
  isInsuranceEligibleTrade,
  UPPA_COMPLIANCE_RULES,
  type InsuranceTradeProfile,
} from '@/lib/trade-insurance';
import {
  analyzeScopeWithAiAction,
  evaluateFeasibilityWithAiAction,
  getClaimCopilotAnswerAction,
} from './actions';
import styles from './claims.module.css';

type Props = {
  tradeSlug?: string;
  businessName?: string;
  initialSiteClaimsEnabled?: boolean;
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
  initialSiteClaimsEnabled: _initialSiteClaimsEnabled = true,
}: Props) {
  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(tradeSlug);
  const eligible = isInsuranceEligibleTrade(tradeSlug);

  const [activeTab, setActiveTab] = useState<'supplements' | 'feasibility' | 'copilot'>('supplements');
  const [isPending, startTransition] = useTransition();

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

  const loadSampleScope = () => {
    setScopeInput(SAMPLE_ROOFING_SCOPE);
    setClaimNumber('49-8821-X01');
    setPolicyholder('Robert & Sarah Jenkins');
    setPropertyAddress('1422 Meadowbrook Lane');
    setAdjusterName('Adjuster Team');
    setCarrierName('State Farm');
    setIsSampleLoaded(true);
    startTransition(() => {
      const res = buildSupplementAnalysis(SAMPLE_ROOFING_SCOPE, tradeSlug);
      const letter = generateAdjusterLetterDraft({
        tradeSlug,
        claimNumber: '49-8821-X01',
        policyholderName: 'Robert & Sarah Jenkins',
        propertyAddress: '1422 Meadowbrook Lane',
        adjusterName: 'Adjuster Team',
        carrierName: 'State Farm',
        discrepancies: res.discrepancies,
        initialRcv: res.parsedFigures.rcv,
      });
      setAnalysis({ ...res, justificationDraft: letter });
    });
  };

  const clearScope = () => {
    setScopeInput('');
    setClaimNumber('');
    setPolicyholder('');
    setPropertyAddress('');
    setAdjusterName('');
    setCarrierName('');
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

    const letter = generateAdjusterLetterDraft({
      tradeSlug,
      claimNumber: claimNumber || '[Claim #]',
      policyholderName: policyholder || '[Policyholder Name]',
      propertyAddress: propertyAddress || '[Property Address]',
      adjusterName: adjusterName || 'Adjuster Team',
      carrierName: carrierName || '[Insurance Carrier]',
      discrepancies: updatedDiscrepancies,
      initialRcv: analysis.parsedFigures.rcv,
    });

    setAnalysis({
      ...analysis,
      discrepancies: updatedDiscrepancies,
      totalEstimatedSupplement: totalSupplement,
      adjustedTotalRcv: adjustedRcv,
      justificationDraft: letter,
    });
  };

  const runScopeAnalysis = async () => {
    if (!scopeInput.trim()) {
      clearScope();
      return;
    }
    startTransition(async () => {
      try {
        const res = await analyzeScopeWithAiAction({ scopeText: scopeInput, tradeSlug });
        const letter = generateAdjusterLetterDraft({
          tradeSlug,
          claimNumber: claimNumber || '[Claim #]',
          policyholderName: policyholder || '[Policyholder Name]',
          propertyAddress: propertyAddress || '[Property Address]',
          adjusterName: adjusterName || 'Adjuster Team',
          carrierName: carrierName || '[Insurance Carrier]',
          discrepancies: res.discrepancies,
          initialRcv: res.parsedFigures.rcv,
        });
        setAnalysis({ ...res, justificationDraft: letter });
      } catch {
        const res = buildSupplementAnalysis(scopeInput, tradeSlug);
        const letter = generateAdjusterLetterDraft({
          tradeSlug,
          claimNumber: claimNumber || '[Claim #]',
          policyholderName: policyholder || '[Policyholder Name]',
          propertyAddress: propertyAddress || '[Property Address]',
          adjusterName: adjusterName || 'Adjuster Team',
          carrierName: carrierName || '[Insurance Carrier]',
          discrepancies: res.discrepancies,
          initialRcv: res.parsedFigures.rcv,
        });
        setAnalysis({ ...res, justificationDraft: letter });
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
      setCopilotAnswer('As your contractor, we provide detailed physical damage documentation and itemized repair estimates to support your property restoration. Please consult your insurance adjuster for specific policy coverage limits and endorsements.');
    } finally {
      setIsAskingCopilot(false);
    }
  };

  const copyLetterToClipboard = () => {
    navigator.clipboard.writeText(analysis.justificationDraft);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2500);
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

      {!eligible && (
        <div className={styles.ineligibleBanner}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Note:</strong> Your trade profile (<code>{tradeSlug}</code>) is not categorized as a primary insurance restoration trade. Claims tools are typically used for roofing, tree removal, water/fire restoration, and storm repairs. You can still use these tools if you perform storm or damage restoration.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabNavWrapper}>
        <nav className={styles.tabNav} aria-label="Claims Studio Sections">
          <button
            type="button"
            onClick={() => setActiveTab('supplements')}
            className={`${styles.tabButton} ${activeTab === 'supplements' ? styles.tabButtonActive : ''}`}
          >
            <FileText size={16} />
            <span>AI Scope &amp; Supplement Finder</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('feasibility')}
            className={`${styles.tabButton} ${activeTab === 'feasibility' ? styles.tabButtonActive : ''}`}
          >
            <Gauge size={16} />
            <span>Damage Feasibility Rater</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('copilot')}
            className={`${styles.tabButton} ${activeTab === 'copilot' ? styles.tabButtonActive : ''}`}
          >
            <MessageSquare size={16} />
            <span>Homeowner Claim Co-Pilot &amp; FAQs</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: AI SCOPE & SUPPLEMENT FINDER */}
      {activeTab === 'supplements' && (
        <div className={styles.mainGrid}>
          {/* Left Column: Scope Input & Claim Metadata */}
          <div className={styles.column}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <FileText size={16} />
                  Adjuster Scope Text / OCR
                </h2>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    onClick={loadSampleScope}
                    className={styles.btnLink}
                  >
                    <Sparkles size={13} />
                    Load Sample Scope
                  </button>
                  {scopeInput && (
                    <button
                      type="button"
                      onClick={clearScope}
                      className={styles.btnGhost}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {isSampleLoaded && (
                <div className={styles.demoBanner}>
                  <Sparkles size={15} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Demo Mode:</strong> Showing sample insurance scope data for testing. Replace with actual property scope or paste adjuster text below.
                  </span>
                </div>
              )}

              <div className={styles.formField}>
                <label htmlFor="scope-input" className={styles.fieldLabel}>
                  Adjuster Estimate / Xactimate Line Items
                </label>
                <textarea
                  id="scope-input"
                  value={scopeInput}
                  onChange={(e) => {
                    setScopeInput(e.target.value);
                    if (isSampleLoaded) setIsSampleLoaded(false);
                  }}
                  rows={10}
                  placeholder="Paste the insurance adjuster's estimate or Xactimate line items here..."
                  className={styles.textarea}
                />
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
                    placeholder="e.g. Robert & Sarah Jenkins"
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
              </div>

              <button
                type="button"
                onClick={runScopeAnalysis}
                disabled={isPending || !scopeInput.trim()}
                className={styles.btnPrimary}
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

          {/* Right Column: Financial Cards, Checklist & Justification Letter */}
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
                  <div className={styles.emptyState}>
                    <p>Paste an insurance adjuster estimate on the left or click{' '}
                      <button
                        type="button"
                        onClick={loadSampleScope}
                        className={styles.btnLink}
                      >
                        Load Sample Scope
                      </button>{' '}
                      to scan for omitted building code items and supplement opportunities.
                    </p>
                  </div>
                ) : (
                  analysis.discrepancies.map((item) => (
                    <label
                      key={item.id}
                      className={`${styles.checkItem} ${item.selected ? styles.checkItemSelected : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleDiscrepancy(item.id)}
                        className={styles.checkbox}
                      />
                      <div className={styles.checkContent}>
                        <div className={styles.checkItemHeader}>
                          <span className={styles.checkItemTitle}>{item.item}</span>
                          <span className={styles.checkItemCost}>+${item.estimatedCost.toLocaleString()}</span>
                        </div>
                        <p className={styles.checkItemReason}>{item.reason}</p>
                        {item.codeCitation && (
                          <span className={styles.citationBadge}>
                            Authority: {item.codeCitation}
                          </span>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Formatted Adjuster Letter Output */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <FileText size={16} />
                  Adjuster Justification Letter (Ready to Send)
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
                {analysis.justificationDraft}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLAIM FEASIBILITY RATER */}
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
                disabled={isPending}
                className={styles.btnPrimary}
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

      {/* TAB 3: HOMEOWNER CLAIM COPILOT & FAQS */}
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
                  disabled={isAskingCopilot || !customQuestion.trim()}
                  className={styles.btnPrimary}
                  style={{ width: 'auto', minWidth: '140px' }}
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
