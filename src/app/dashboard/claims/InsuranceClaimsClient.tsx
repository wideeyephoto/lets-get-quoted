'use client';

import { useState, useTransition } from 'react';
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
  businessName: _businessName = 'Our Company',
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
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Insurance Claims & Supplement Studio
            </h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              {profile.name}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600">
            Scan adjuster scopes, uncover missed building code items, calculate supplements, and draft UPPA-compliant justification letters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            🛡️ UPPA Compliant Estimator
          </span>
        </div>
      </div>

      {!eligible && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Note:</strong> Your trade profile (<code>{tradeSlug}</code>) is not categorized as a primary insurance restoration trade. Claims tools are typically used for roofing, tree removal, water/fire restoration, and storm repairs. You can still use these tools if you perform storm or damage restoration.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-stone-200">
        <button
          type="button"
          onClick={() => setActiveTab('supplements')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'supplements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <span>📋</span> AI Scope & Supplement Finder
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('feasibility')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'feasibility'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <span>🎯</span> Damage Feasibility Rater
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('copilot')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'copilot'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-stone-500 hover:text-stone-700'
          }`}
        >
          <span>💬</span> Homeowner Claim Co-Pilot & FAQs
        </button>
      </div>

      {/* TAB 1: AI SCOPE & SUPPLEMENT FINDER */}
      {activeTab === 'supplements' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Scope Input & Claim Info */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between pb-3">
                <h2 className="text-sm font-semibold text-stone-800">Adjuster Scope Text / OCR</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={loadSampleScope}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Load Sample Scope
                  </button>
                  {scopeInput && (
                    <button
                      type="button"
                      onClick={clearScope}
                      className="text-xs font-medium text-stone-400 hover:text-stone-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {isSampleLoaded && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <span className="font-semibold">💡 Demo Mode:</span> Showing sample insurance scope data for testing. Replace with actual property scope or paste adjuster text above.
                </div>
              )}

              <textarea
                value={scopeInput}
                onChange={(e) => {
                  setScopeInput(e.target.value);
                  if (isSampleLoaded) setIsSampleLoaded(false);
                }}
                rows={10}
                placeholder="Paste the insurance adjuster's estimate or Xactimate line items here..."
                className="w-full rounded-lg border border-stone-300 p-3 font-mono text-xs text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Claim Metadata Fields */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2">
                  <label className="font-medium text-stone-600">Property / Loss Address</label>
                  <input
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    placeholder="e.g. 1422 Meadowbrook Lane"
                    className="mt-1 w-full rounded border border-stone-300 p-1.5"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-600">Claim Number</label>
                  <input
                    type="text"
                    value={claimNumber}
                    onChange={(e) => setClaimNumber(e.target.value)}
                    placeholder="e.g. 49-8821-X01"
                    className="mt-1 w-full rounded border border-stone-300 p-1.5"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-600">Carrier</label>
                  <input
                    type="text"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="e.g. State Farm"
                    className="mt-1 w-full rounded border border-stone-300 p-1.5"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-600">Policyholder</label>
                  <input
                    type="text"
                    value={policyholder}
                    onChange={(e) => setPolicyholder(e.target.value)}
                    placeholder="e.g. Robert & Sarah Jenkins"
                    className="mt-1 w-full rounded border border-stone-300 p-1.5"
                  />
                </div>
                <div>
                  <label className="font-medium text-stone-600">Adjuster Name</label>
                  <input
                    type="text"
                    value={adjusterName}
                    onChange={(e) => setAdjusterName(e.target.value)}
                    placeholder="e.g. Desk Adjuster"
                    className="mt-1 w-full rounded border border-stone-300 p-1.5"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={runScopeAnalysis}
                disabled={isPending || !scopeInput.trim()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Analyzing Scope...' : '🔍 Scan for Missing Code Items & Supplements'}
              </button>
            </div>
          </div>

          {/* Right Column: Financial Cards, Discrepancy Checklist & Justification Letter */}
          <div className="space-y-4 lg:col-span-7">
            {/* Financial Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
                <span className="text-xs font-medium text-stone-500">Initial Adjuster RCV</span>
                <p className="mt-1 text-lg font-bold text-stone-800">
                  {analysis.parsedFigures.rcv != null
                    ? `$${analysis.parsedFigures.rcv.toLocaleString()}`
                    : 'N/A'}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                <span className="text-xs font-medium text-emerald-800">Recoverable Supplement</span>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  +${analysis.totalEstimatedSupplement.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-sm">
                <span className="text-xs font-medium text-blue-800">Revised Total RCV</span>
                <p className="mt-1 text-lg font-bold text-blue-900">
                  {analysis.adjustedTotalRcv != null
                    ? `$${analysis.adjustedTotalRcv.toLocaleString()}`
                    : analysis.totalEstimatedSupplement > 0
                    ? `$${analysis.totalEstimatedSupplement.toLocaleString()}`
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Omitted Items Checklist */}
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h3 className="text-sm font-semibold text-stone-800">
                  Omitted Code Items & Supplements ({analysis.discrepancies.filter((d) => d.selected).length} selected)
                </h3>
                <span className="text-xs font-medium text-stone-500">
                  Total: +${analysis.totalEstimatedSupplement.toLocaleString()}
                </span>
              </div>

              <div className="mt-3 space-y-2.5">
                {analysis.discrepancies.length === 0 ? (
                  <div className="py-6 text-center text-xs text-stone-500">
                    Paste an insurance adjuster estimate on the left or click{' '}
                    <button
                      type="button"
                      onClick={loadSampleScope}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      Load Sample Scope
                    </button>{' '}
                    to scan for omitted building code items and supplement opportunities.
                  </div>
                ) : (
                  analysis.discrepancies.map((item) => (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 text-xs transition ${
                        item.selected
                          ? 'border-blue-300 bg-blue-50/40'
                          : 'border-stone-200 bg-stone-50/60 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleDiscrepancy(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-blue-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between font-semibold text-stone-900">
                          <span>{item.item}</span>
                          <span className="font-mono text-emerald-700">+${item.estimatedCost}</span>
                        </div>
                        <p className="mt-0.5 text-stone-600">{item.reason}</p>
                        {item.codeCitation && (
                          <span className="mt-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
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
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h3 className="text-sm font-semibold text-stone-800">
                  Adjuster Justification Letter (Ready to Send)
                </h3>
                <button
                  type="button"
                  onClick={copyLetterToClipboard}
                  className="rounded bg-stone-800 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-stone-900"
                >
                  {copiedLetter ? '✓ Copied!' : 'Copy Letter'}
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] leading-relaxed text-amber-900">
                <span className="font-semibold">⚠️ Contractor Notice & Scope Disclaimer:</span> This draft is generated as a technical construction estimate based on code/manufacturer specifications. It is for contractor scope review and does not constitute legal advice, insurance adjusting, or public adjuster representation.
              </div>

              <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-mono text-xs text-stone-800">
                {analysis.justificationDraft}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLAIM FEASIBILITY RATER */}
      {activeTab === 'feasibility' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Intake inputs */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-stone-800">Homeowner Damage Symptoms</h2>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <label className="font-medium text-stone-700">Damage Description</label>
                  <textarea
                    rows={4}
                    value={damageDesc}
                    onChange={(e) => setDamageDesc(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-medium text-stone-700">Reported Peril / Event</label>
                  <input
                    type="text"
                    value={perilType}
                    onChange={(e) => setPerilType(e.target.value)}
                    className="mt-1 w-full rounded border border-stone-300 p-2 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-medium text-stone-700">Property / Roof Age (Yrs)</label>
                    <input
                      type="number"
                      value={roofAge}
                      onChange={(e) => setRoofAge(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-stone-300 p-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-medium text-stone-700">Deductible ($)</label>
                    <input
                      type="number"
                      value={deductible}
                      onChange={(e) => setDeductible(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-stone-300 p-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={runFeasibilityEvaluation}
                disabled={isPending}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Evaluating...' : '🎯 Calculate Claim Viability'}
              </button>
            </div>
          </div>

          {/* Assessment Output */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Insurance Viability Score
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-stone-900">
                      {feasibility.feasibilityScore}
                    </span>
                    <span className="text-xs text-stone-500">/ 100</span>
                  </div>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    feasibility.probability === 'high'
                      ? 'bg-emerald-100 text-emerald-800'
                      : feasibility.probability === 'moderate'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {feasibility.probability.toUpperCase()} PROBABILITY
                </span>
              </div>

              <div className="mt-4 rounded-lg bg-stone-50 p-3.5 text-xs text-stone-800">
                <span className="font-semibold text-stone-900">Recommendation: </span>
                {feasibility.recommendation === 'file_claim' && (
                  <span className="text-emerald-700 font-semibold">
                    Proceed with formal insurance claim & on-site inspection.
                  </span>
                )}
                {feasibility.recommendation === 'inspection_first' && (
                  <span className="text-amber-700 font-semibold">
                    Perform physical damage inspection before filing claim to verify scope exceeds deductible.
                  </span>
                )}
                {feasibility.recommendation === 'out_of_pocket_maintenance' && (
                  <span className="text-red-700 font-semibold">
                    Quote as out-of-pocket maintenance (likely excluded wear-and-tear).
                  </span>
                )}
              </div>

              {/* Breakdown */}
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-stone-700">Estimated Scope Range:</span>
                  <p className="text-stone-800 font-mono font-medium">
                    ${feasibility.estimatedDamageRange.min.toLocaleString()} – ${feasibility.estimatedDamageRange.max.toLocaleString()}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-stone-700">Detected Perils:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {feasibility.detectedPerils.map((p) => (
                      <span key={p} className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-stone-700">Key Observations:</span>
                  <ul className="mt-1 list-inside list-disc text-stone-600">
                    {feasibility.observedDamagePoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>

                {feasibility.riskFactors.length > 0 && (
                  <div>
                    <span className="font-semibold text-amber-700">Potential Adjuster Scrutiny / Risk:</span>
                    <ul className="mt-1 list-inside list-disc text-amber-800">
                      {feasibility.riskFactors.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <span className="font-semibold text-blue-900">Homeowner Talking Point Summary:</span>
                  <p className="mt-1 text-blue-800 leading-relaxed">{feasibility.homeownerSummary}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOMEOWNER CLAIM COPILOT & FAQS */}
      {activeTab === 'copilot' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-stone-900">
              Homeowner Claims Knowledge Base & Talking Points
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Use these explanations when homeowners ask confusing questions about deductibles, depreciation release, or insurance rights.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {HOMEOWNER_CLAIM_FAQS.map((faq, i) => (
                <div key={i} className="rounded-lg border border-stone-200 p-4 transition hover:border-blue-300">
                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600">
                    {faq.category}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-stone-900">{faq.question}</h3>
                  <p className="mt-1 text-xs font-semibold text-blue-700">{faq.shortAnswer}</p>
                  <p className="mt-2 text-xs leading-relaxed text-stone-600">{faq.detailedExplanation}</p>
                </div>
              ))}
            </div>

            {/* Interactive Ask Copilot Box */}
            <div className="mt-6 border-t border-stone-100 pt-5">
              <h3 className="text-sm font-bold text-stone-900">Ask the Claims AI Co-Pilot</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Ask any homeowner question to get a plain-English, UPPA-compliant response.
              </p>
              <form onSubmit={handleAskCopilot} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="e.g. Can the insurance company force me to use their preferred contractor?"
                  className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isAskingCopilot || !customQuestion.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isAskingCopilot ? 'Thinking...' : 'Ask Co-Pilot'}
                </button>
              </form>

              {copilotAnswer && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs leading-relaxed text-blue-900">
                  <span className="font-bold text-blue-950">AI Co-Pilot Answer:</span>
                  <p className="mt-1">{copilotAnswer}</p>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* UPPA Legal Guidelines Card */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚖️</span>
              <h3 className="text-sm font-bold text-amber-900">
                Unauthorized Practice of Public Adjusting (UPPA) Compliance Checklist
              </h3>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
              {UPPA_COMPLIANCE_RULES.map((rule, i) => (
                <div key={i} className="rounded-lg border border-amber-200/80 bg-white p-3 shadow-xs">
                  <p className="font-semibold text-amber-950">{rule.rule}</p>
                  <p className="mt-1 text-stone-600 leading-relaxed">{rule.guideline}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
