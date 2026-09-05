'use client';

import { useState, useTransition, useMemo, useEffect, useRef } from 'react';
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
  Sparkles,
  MapPin,
  Mail,
  Phone,
  Printer,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Clock,
  Info,
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
  type InsuranceClaimSummary,
  type InsuranceClaimStatus,
  type ScopeDiscrepancy,
} from '@/lib/insurance-claims';
import {
  getInsuranceTradeProfile,
  UPPA_COMPLIANCE_RULES,
  type InsuranceTradeProfile,
} from '@/lib/trade-insurance';
import { formatMoneyExact } from '@/lib/jobs';
import {
  analyzeScopeWithAiAction,
  evaluateFeasibilityWithAiAction,
  getClaimCopilotAnswerAction,
  saveInsuranceClaimAction,
  deleteInsuranceClaimAction,
  loadInsuranceClaimAction,
  setSiteInsuranceClaimsEnabledAction,
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
  initialClaims?: InsuranceClaimSummary[];
  clients?: ClientOption[];
  jobs?: JobOption[];
  canWrite?: boolean;
  initialAiCredits?: number | null;
  initialClaimId?: string | null;
  initialActiveClaim?: InsuranceClaimRecord | null;
};

const SAMPLE_ROOFING_SCOPE = `STATE FARM FIRE AND CASUALTY COMPANY
CLAIM NUMBER: 49-8821-X01
INSURED: Robert & Sarah Jenkins
LOSS LOCATION: 1422 Meadowbrook Lane
DATE OF LOSS: 08/14/2026 - Hail & Wind Storm
ADJUSTER: John Smith (Desk Examiner)
EMAIL: claims@statefarm.example.com
PHONE: (800) 555-0199

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
  initialAiCredits = null,
  initialClaimId = null,
  initialActiveClaim = null,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'supplements' | 'saved' | 'feasibility' | 'copilot'>('supplements');
  const [siteClaimsEnabled, setSiteClaimsEnabled] = useState(initialSiteClaimsEnabled);
  const [aiCredits, setAiCredits] = useState<number | null>(initialAiCredits);

  // Persistence list of saved claims
  const [claims, setClaims] = useState<InsuranceClaimSummary[]>(initialClaims);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(initialClaimId);
  const [currentClaimUpdatedAt, setCurrentClaimUpdatedAt] = useState<string | null>(initialActiveClaim?.updated_at ?? null);

  // Active claim form metadata
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialActiveClaim?.client_id ?? null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialActiveClaim?.job_id ?? null);
  const [claimNumber, setClaimNumber] = useState(initialActiveClaim?.claim_number || '');
  const [policyholder, setPolicyholder] = useState(initialActiveClaim?.policyholder_name || '');
  const [propertyAddress, setPropertyAddress] = useState(initialActiveClaim?.property_address || '');
  const [carrierName, setCarrierName] = useState(initialActiveClaim?.carrier_name || '');
  const [adjusterName, setAdjusterName] = useState(initialActiveClaim?.adjuster_name || '');
  const [adjusterEmail, setAdjusterEmail] = useState(initialActiveClaim?.adjuster_email || '');
  const [adjusterPhone, setAdjusterPhone] = useState(initialActiveClaim?.adjuster_phone || '');
  const [dateOfLoss, setDateOfLoss] = useState(initialActiveClaim?.date_of_loss || '');
  const [claimStatus, setClaimStatus] = useState<InsuranceClaimStatus>(initialActiveClaim?.status || 'draft');

  // Scope & Supplement Analysis State
  const [scopeInput, setScopeInput] = useState(initialActiveClaim?.scope_text || '');
  const [analysis, setAnalysis] = useState<SupplementAnalysisResult>(() => {
    if (initialActiveClaim) {
      return {
        tradeSlug: initialActiveClaim.trade_slug,
        parsedFigures: initialActiveClaim.parsed_figures || { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
        rawScopeSummary: `Loaded claim with ${initialActiveClaim.discrepancies?.length || 0} line items.`,
        discrepancies: initialActiveClaim.discrepancies || [],
        totalEstimatedSupplement: initialActiveClaim.total_supplement_amount,
        adjustedTotalRcv: initialActiveClaim.revised_rcv_amount,
        justificationDraft: initialActiveClaim.justification_letter || '',
        analysisMethod: initialActiveClaim.analysis_method || 'heuristic',
      };
    }
    return {
      tradeSlug,
      parsedFigures: { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
      rawScopeSummary: 'Paste an adjuster scope text or sample scope to begin building code analysis.',
      discrepancies: [],
      totalEstimatedSupplement: 0,
      adjustedTotalRcv: null,
      justificationDraft: 'No scope text parsed yet.',
      analysisMethod: 'heuristic',
    };
  });

  // Track user edits for unsaved-changes guard
  const [isDirty, setIsDirty] = useState(false);

  // Custom supplement builder state
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCost, setCustomItemCost] = useState('');
  const [customItemCitation, setCustomItemCitation] = useState('');
  const [customItemReason, setCustomItemReason] = useState('');

  // Feasibility Rater State
  const [damageDesc, setDamageDesc] = useState('');
  const [perilType, setPerilType] = useState('Hail & Wind');
  const [roofAge, setRoofAge] = useState<number>(8);
  const [deductible, setDeductible] = useState<number>(1000);
  const [feasibility, setFeasibility] = useState<ClaimFeasibilityAssessment | null>(null);

  // Homeowner Co-Pilot State
  const [customQuestion, setCustomQuestion] = useState('');
  const [copilotAnswer, setCopilotAnswer] = useState<string | null>(null);
  const [isAskingCopilot, setIsAskingCopilot] = useState(false);

  // Feedback, toasts, & modals
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>>([]);
  const [modalConfirm, setModalConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [isSavingClaim, setIsSavingClaim] = useState(false);

  // Search, filter, and pagination for Saved Claims
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'supplement_high' | 'rcv_high'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const claimsPerPage = 8;

  // Searchable Comboboxes
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobDropdown, setShowJobDropdown] = useState(false);

  // Timers cleanup ref
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const addTimeout = (fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timersRef.current.push(t);
    return t;
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const pushToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    addTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Draft auto-save to localStorage
  const draftKey = `lgq_claims_draft_${tradeSlug}`;
  useEffect(() => {
    if (!isDirty || !scopeInput.trim()) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            scopeInput,
            claimNumber,
            policyholder,
            propertyAddress,
            carrierName,
            adjusterName,
            adjusterEmail,
            adjusterPhone,
            dateOfLoss,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        // LocalStorage quota or privacy mode guard
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [isDirty, scopeInput, claimNumber, policyholder, propertyAddress, carrierName, adjusterName, adjusterEmail, adjusterPhone, dateOfLoss, draftKey]);

  // Restore draft banner if present and workspace is clean
  const [draftAvailable, setDraftAvailable] = useState<string | null>(null);
  useEffect(() => {
    if (selectedClaimId || scopeInput.trim()) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.scopeInput && parsed.savedAt) {
          setDraftAvailable(parsed.savedAt);
        }
      }
    } catch {
      // Ignore
    }
  }, [selectedClaimId, scopeInput, draftKey]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setScopeInput(parsed.scopeInput || '');
        setClaimNumber(parsed.claimNumber || '');
        setPolicyholder(parsed.policyholder || '');
        setPropertyAddress(parsed.propertyAddress || '');
        setCarrierName(parsed.carrierName || '');
        setAdjusterName(parsed.adjusterName || '');
        setAdjusterEmail(parsed.adjusterEmail || '');
        setAdjusterPhone(parsed.adjusterPhone || '');
        setDateOfLoss(parsed.dateOfLoss || '');
        setDraftAvailable(null);
        setIsDirty(true);
        pushToast('Draft restored from local session.', 'info');
      }
    } catch {
      pushToast('Could not restore draft.', 'error');
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      setDraftAvailable(null);
    } catch {
      // Ignore
    }
  };

  // Re-run metadata extraction on paste or blur only
  const handleScopeBlurOrPaste = (text: string) => {
    const meta = extractClaimMetadataFromText(text);
    if (meta.claimNumber && !claimNumber) setClaimNumber(meta.claimNumber);
    if (meta.policyholderName && !policyholder) setPolicyholder(meta.policyholderName);
    if (meta.propertyAddress && !propertyAddress) setPropertyAddress(meta.propertyAddress);
    if (meta.carrierName && !carrierName) setCarrierName(meta.carrierName);
    if (meta.dateOfLoss && !dateOfLoss) setDateOfLoss(meta.dateOfLoss);
    if (meta.adjusterName && !adjusterName) setAdjusterName(meta.adjusterName);
  };

  // Supplement toggling with cent calculation
  const toggleDiscrepancy = (id: string) => {
    setIsDirty(true);
    setAnalysis((prev) => {
      const updated = prev.discrepancies.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d));
      // Cent summation
      const totalEstimatedSupplement = Math.round(
        updated
          .filter((d) => d.selected)
          .reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
      ) / 100;

      // Fix != null so 0 is not treated as unparsed
      const adjustedTotalRcv = prev.parsedFigures.rcv != null
        ? Math.round((Math.round(prev.parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
        : null;

      const updatedDraft = generateAdjusterLetterDraft({
        tradeSlug,
        claimNumber: claimNumber || '[Claim #]',
        policyholderName: policyholder || '[Policyholder Name]',
        propertyAddress: propertyAddress || '[Property Address]',
        carrierName: carrierName || '[Insurance Carrier]',
        adjusterName: adjusterName || 'Adjuster Team',
        dateOfLoss: dateOfLoss || '[Date of Loss]',
        discrepancies: updated,
        initialRcv: prev.parsedFigures.rcv,
      });

      return {
        ...prev,
        discrepancies: updated,
        totalEstimatedSupplement,
        adjustedTotalRcv,
        justificationDraft: updatedDraft,
      };
    });
  };

  // Update item cost, quantity, or unit price
  const updateDiscrepancyCost = (id: string, newCost: number, newQty?: number, newUnitPrice?: number) => {
    setIsDirty(true);
    setAnalysis((prev) => {
      const updated = prev.discrepancies.map((d) => {
        if (d.id !== id) return d;
        return {
          ...d,
          estimatedCost: Math.max(0, Math.round(newCost * 100) / 100),
          quantity: newQty !== undefined ? newQty : d.quantity,
          unitPrice: newUnitPrice !== undefined ? newUnitPrice : d.unitPrice,
        };
      });

      const totalEstimatedSupplement = Math.round(
        updated
          .filter((d) => d.selected)
          .reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
      ) / 100;

      const adjustedTotalRcv = prev.parsedFigures.rcv != null
        ? Math.round((Math.round(prev.parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
        : null;

      return {
        ...prev,
        discrepancies: updated,
        totalEstimatedSupplement,
        adjustedTotalRcv,
        justificationDraft: generateAdjusterLetterDraft({
          tradeSlug,
          claimNumber,
          policyholderName: policyholder,
          propertyAddress,
          carrierName,
          adjusterName,
          dateOfLoss,
          discrepancies: updated,
          initialRcv: prev.parsedFigures.rcv,
        }),
      };
    });
  };

  // Add custom supplement
  const handleAddCustomSupplement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customItemName.trim()) return;
    const cost = parseFloat(customItemCost.replace(/[^0-9.]/g, '')) || 500;
    const newItem: ScopeDiscrepancy = {
      id: `custom-${Date.now()}`,
      item: customItemName.trim(),
      codeCitation: customItemCitation.trim() || 'Manufacturer Specification',
      reason: customItemReason.trim() || 'Required for code-compliant property restoration.',
      category: 'missed_scope',
      estimatedCost: Math.round(cost * 100) / 100,
      selected: true, // Affirmative addition by user
      quantity: 1,
      unit: 'EA',
      unitPrice: Math.round(cost * 100) / 100,
      confidence: 'high',
      detectionSource: 'custom',
    };

    setAnalysis((prev) => {
      const updated = [...prev.discrepancies, newItem];
      const totalEstimatedSupplement = Math.round(
        updated
          .filter((d) => d.selected)
          .reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
      ) / 100;
      const adjustedTotalRcv = prev.parsedFigures.rcv != null
        ? Math.round((Math.round(prev.parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
        : null;

      return {
        ...prev,
        discrepancies: updated,
        totalEstimatedSupplement,
        adjustedTotalRcv,
        justificationDraft: generateAdjusterLetterDraft({
          tradeSlug,
          claimNumber,
          policyholderName: policyholder,
          propertyAddress,
          carrierName,
          adjusterName,
          dateOfLoss,
          discrepancies: updated,
          initialRcv: prev.parsedFigures.rcv,
        }),
      };
    });

    setCustomItemName('');
    setCustomItemCost('');
    setCustomItemCitation('');
    setCustomItemReason('');
    setShowAddCustom(false);
    setIsDirty(true);
    pushToast('Custom supplement line added.', 'success');
  };

  // Delete discrepancy
  const handleDeleteDiscrepancy = (id: string) => {
    setIsDirty(true);
    setAnalysis((prev) => {
      const updated = prev.discrepancies.filter((d) => d.id !== id);
      const totalEstimatedSupplement = Math.round(
        updated
          .filter((d) => d.selected)
          .reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
      ) / 100;
      const adjustedTotalRcv = prev.parsedFigures.rcv != null
        ? Math.round((Math.round(prev.parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
        : null;

      return {
        ...prev,
        discrepancies: updated,
        totalEstimatedSupplement,
        adjustedTotalRcv,
        justificationDraft: generateAdjusterLetterDraft({
          tradeSlug,
          claimNumber,
          policyholderName: policyholder,
          propertyAddress,
          carrierName,
          adjusterName,
          dateOfLoss,
          discrepancies: updated,
          initialRcv: prev.parsedFigures.rcv,
        }),
      };
    });
  };

  // Reactive letter body updating with metadata
  const activeLetterDraft = useMemo(() => {
    return generateAdjusterLetterDraft({
      tradeSlug,
      claimNumber: claimNumber || '[Claim #]',
      policyholderName: policyholder || '[Policyholder Name]',
      propertyAddress: propertyAddress || '[Property Address]',
      adjusterName: adjusterName || 'Adjuster Team',
      carrierName: carrierName || '[Insurance Carrier]',
      dateOfLoss: dateOfLoss || '[Date of Loss]',
      discrepancies: analysis.discrepancies,
      initialRcv: analysis.parsedFigures.rcv,
    });
  }, [tradeSlug, claimNumber, policyholder, propertyAddress, adjusterName, carrierName, dateOfLoss, analysis.discrepancies, analysis.parsedFigures.rcv]);

  // Run Scope Analysis (Preserves prior user edits and custom items across scans)
  const runScopeAnalysis = async () => {
    if (!scopeInput.trim()) {
      pushToast('Paste or upload adjuster scope text first.', 'error');
      return;
    }

    handleScopeBlurOrPaste(scopeInput);

    startTransition(async () => {
      try {
        const res = await analyzeScopeWithAiAction({ scopeText: scopeInput, tradeSlug });

        // Merge to preserve user-selected states or custom items
        setAnalysis((prev) => {
          const prevSelectedIds = new Set(prev.discrepancies.filter((d) => d.selected).map((d) => d.item.toLowerCase()));
          const customItems = prev.discrepancies.filter((d) => d.detectionSource === 'custom');

          const mergedDiscrepancies = res.discrepancies.map((item) => ({
            ...item,
            selected: prevSelectedIds.has(item.item.toLowerCase()),
          }));

          const allDiscrepancies = [...mergedDiscrepancies, ...customItems];
          const totalEstimatedSupplement = Math.round(
            allDiscrepancies.filter((d) => d.selected).reduce((sum, d) => sum + Math.round(d.estimatedCost * 100), 0)
          ) / 100;
          const adjustedTotalRcv = res.parsedFigures.rcv != null
            ? Math.round((Math.round(res.parsedFigures.rcv * 100) + Math.round(totalEstimatedSupplement * 100))) / 100
            : null;

          return {
            ...res,
            discrepancies: allDiscrepancies,
            totalEstimatedSupplement,
            adjustedTotalRcv,
          };
        });

        if (aiCredits !== null && res.analysisMethod === 'ai') {
          setAiCredits((prev) => (prev && prev > 0 ? prev - 1 : 0));
        }

        if (res.sourceNotice) {
          pushToast(res.sourceNotice, 'info');
        } else {
          pushToast('Scope parsed with AI model.', 'success');
        }

        // Transition status suggestion
        if (claimStatus === 'draft') {
          setClaimStatus('scope_received');
        }
      } catch (err) {
        const res = buildSupplementAnalysis(scopeInput, tradeSlug);
        setAnalysis(res);
        pushToast('Parsed using building code heuristics (AI unavailable).', 'info');
      }
    });
  };

  const loadSampleScope = () => {
    setScopeInput(SAMPLE_ROOFING_SCOPE);
    handleScopeBlurOrPaste(SAMPLE_ROOFING_SCOPE);
    const result = buildSupplementAnalysis(SAMPLE_ROOFING_SCOPE, tradeSlug);
    setAnalysis(result);
    setClaimStatus('scope_received');
    setIsDirty(true);
    pushToast('Sample roofing scope loaded.', 'info');
  };

  const clearScope = (skipConfirm = false) => {
    if (!skipConfirm && isDirty) {
      setModalConfirm({
        title: 'Discard In-Progress Edits?',
        message: 'You have unsaved changes in the scope studio. Are you sure you want to clear and start fresh?',
        onConfirm: () => {
          setModalConfirm(null);
          clearScope(true);
        },
      });
      return;
    }

    setSelectedClaimId(null);
    setCurrentClaimUpdatedAt(null);
    setSelectedClientId(null);
    setSelectedJobId(null);
    setClaimNumber('');
    setPolicyholder('');
    setPropertyAddress('');
    setCarrierName('');
    setAdjusterName('');
    setAdjusterEmail('');
    setAdjusterPhone('');
    setDateOfLoss('');
    setClaimStatus('draft');
    setScopeInput('');
    setIsDirty(false);
    clearDraft();
    setAnalysis({
      tradeSlug,
      parsedFigures: { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
      rawScopeSummary: 'Paste an adjuster scope text or sample scope to begin building code analysis.',
      discrepancies: [],
      totalEstimatedSupplement: 0,
      adjustedTotalRcv: null,
      justificationDraft: 'No scope text provided.',
      analysisMethod: 'heuristic',
    });
    pushToast('Scope studio cleared.', 'info');
  };

  // Run Feasibility Evaluation (jobs.read)
  const runFeasibilityEvaluation = async () => {
    if (!damageDesc.trim()) {
      pushToast('Enter a brief damage description first.', 'error');
      return;
    }

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

  // Co-Pilot Question (jobs.read)
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

  // Clipboard copy with fallback
  const copyLetterToClipboard = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(activeLetterDraft);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = activeLetterDraft;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      pushToast('Justification letter copied to clipboard!', 'success');
      if (claimStatus === 'scope_received') {
        setClaimStatus('supplement_pending');
      }
    } catch {
      pushToast('Unable to copy automatically. Select text and press Ctrl+C.', 'error');
    }
  };

  // Email to adjuster
  const emailAdjuster = () => {
    const subject = encodeURIComponent(`Supplement Request & Building Code Scope Clarification — ${claimNumber || propertyAddress || 'Claim on File'}`);
    const body = encodeURIComponent(activeLetterDraft);
    const recipient = adjusterEmail ? encodeURIComponent(adjusterEmail) : '';
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
    if (claimStatus === 'scope_received') {
      setClaimStatus('supplement_pending');
    }
  };

  // Print / PDF download
  const printLetter = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Supplement Justification Letter - ${claimNumber || 'Draft'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; line-height: 1.6; color: #111; max-width: 800px; margin: 0 auto; }
            pre { white-space: pre-wrap; font-family: inherit; font-size: 13.5px; }
            hr { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
          </style>
        </head>
        <body>
          <pre>${activeLetterDraft.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Save / Update Claim persistence action
  const handleSaveClaim = async () => {
    if (!canWrite) {
      pushToast('You need jobs.write permission to save or update claims.', 'error');
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
        adjusterEmail: adjusterEmail.trim() || null,
        adjusterPhone: adjusterPhone.trim() || null,
        dateOfLoss: dateOfLoss.trim() || null,
        scopeText: scopeInput,
        parsedFigures: analysis.parsedFigures,
        discrepancies: analysis.discrepancies,
        totalSupplementAmount: analysis.totalEstimatedSupplement,
        revisedRcvAmount: analysis.adjustedTotalRcv,
        justificationLetter: activeLetterDraft,
        status: claimStatus,
        tradeSlug,
        analysisMethod: analysis.analysisMethod,
        updatedAt: currentClaimUpdatedAt || undefined,
      });

      if (res.ok) {
        setSelectedClaimId(res.claim.id);
        setCurrentClaimUpdatedAt(res.claim.updated_at);
        setIsDirty(false);
        clearDraft();

        const summaryItem: InsuranceClaimSummary = {
          id: res.claim.id,
          account_id: res.claim.account_id,
          client_id: res.claim.client_id,
          job_id: res.claim.job_id,
          claim_number: res.claim.claim_number,
          policyholder_name: res.claim.policyholder_name,
          property_address: res.claim.property_address,
          carrier_name: res.claim.carrier_name,
          adjuster_name: res.claim.adjuster_name,
          total_supplement_amount: res.claim.total_supplement_amount,
          revised_rcv_amount: res.claim.revised_rcv_amount,
          status: res.claim.status,
          trade_slug: res.claim.trade_slug,
          created_at: res.claim.created_at,
          updated_at: res.claim.updated_at,
          parsed_figures: res.claim.parsed_figures,
          analysis_method: res.claim.analysis_method,
        };

        setClaims((prev) => {
          const idx = prev.findIndex((c) => c.id === res.claim.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = summaryItem;
            return next;
          }
          return [summaryItem, ...prev];
        });

        pushToast('Claim saved.', 'success');
      } else {
        pushToast(res.message, 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error saving claim', 'error');
    } finally {
      setIsSavingClaim(false);
    }
  };

  // Load a claim from the list into the studio
  const handleLoadClaim = async (claimSummary: InsuranceClaimSummary, skipConfirm = false) => {
    if (!skipConfirm && isDirty) {
      setModalConfirm({
        title: 'Discard In-Progress Changes?',
        message: 'You have unsaved changes in the scope studio. Opening this claim will overwrite them.',
        onConfirm: () => {
          setModalConfirm(null);
          handleLoadClaim(claimSummary, true);
        },
      });
      return;
    }

    try {
      const fullClaim = await loadInsuranceClaimAction(claimSummary.id);
      if (!fullClaim) {
        pushToast('Failed to load full claim details.', 'error');
        return;
      }

      setSelectedClaimId(fullClaim.id);
      setCurrentClaimUpdatedAt(fullClaim.updated_at);
      setSelectedClientId(fullClaim.client_id);
      setSelectedJobId(fullClaim.job_id);
      setClaimNumber(fullClaim.claim_number || '');
      setPolicyholder(fullClaim.policyholder_name || '');
      setPropertyAddress(fullClaim.property_address || '');
      setCarrierName(fullClaim.carrier_name || '');
      setAdjusterName(fullClaim.adjuster_name || '');
      setAdjusterEmail(fullClaim.adjuster_email || '');
      setAdjusterPhone(fullClaim.adjuster_phone || '');
      setDateOfLoss(fullClaim.date_of_loss || '');
      setClaimStatus(fullClaim.status);
      setScopeInput(fullClaim.scope_text || '');
      setIsDirty(false);

      setAnalysis({
        tradeSlug: fullClaim.trade_slug,
        parsedFigures: fullClaim.parsed_figures || { rcv: null, acv: null, depreciation: null, deductible: null, netClaim: null },
        rawScopeSummary: fullClaim.scope_text ? `Loaded saved claim with ${fullClaim.discrepancies?.length || 0} line items.` : 'Loaded claim.',
        discrepancies: fullClaim.discrepancies || [],
        totalEstimatedSupplement: fullClaim.total_supplement_amount,
        adjustedTotalRcv: fullClaim.revised_rcv_amount,
        justificationDraft: fullClaim.justification_letter || '',
        analysisMethod: fullClaim.analysis_method || 'heuristic',
      });

      setActiveTab('supplements');
      pushToast(`Opened claim #${fullClaim.claim_number || fullClaim.id.slice(0, 8)}`, 'info');
    } catch (err) {
      pushToast('Error loading claim details.', 'error');
    }
  };

  // Delete claim with modal confirmation
  const confirmDeleteClaim = (claimId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;

    setModalConfirm({
      title: 'Move Claim to Trash?',
      message: 'This claim will be soft-deleted. You can restore it within 30 days.',
      onConfirm: async () => {
        setModalConfirm(null);
        try {
          const res = await deleteInsuranceClaimAction(claimId);
          if (res.ok) {
            setClaims((prev) => prev.filter((c) => c.id !== claimId));
            if (selectedClaimId === claimId) {
              clearScope(true);
            }
            pushToast('Claim moved to trash.', 'info');
          } else {
            pushToast(res.message, 'error');
          }
        } catch (err) {
          pushToast(err instanceof Error ? err.message : 'Failed to delete claim', 'error');
        }
      },
    });
  };

  // Enable claims studio persistently
  const handleEnableStudio = async () => {
    startTransition(async () => {
      try {
        const res = await setSiteInsuranceClaimsEnabledAction(true);
        if (res.ok) {
          setSiteClaimsEnabled(true);
          pushToast('Insurance Claims Studio enabled for this account.', 'success');
        } else {
          pushToast(res.message, 'error');
        }
      } catch {
        pushToast('Failed to update site settings.', 'error');
      }
    });
  };

  // Net-to-Homeowner Math
  const netHomeownerCalculation = useMemo(() => {
    const rcv = analysis.parsedFigures.rcv;
    const depr = analysis.parsedFigures.depreciation;
    const ded = analysis.parsedFigures.deductible;
    if (rcv == null || depr == null || ded == null) return null;

    const currentRevisedRcv = analysis.adjustedTotalRcv != null ? analysis.adjustedTotalRcv : rcv;
    const netExpected = Math.round((currentRevisedRcv - depr - ded) * 100) / 100;
    return {
      revisedRcv: currentRevisedRcv,
      depreciation: depr,
      deductible: ded,
      netExpected,
    };
  }, [analysis.parsedFigures, analysis.adjustedTotalRcv]);

  // Saved claims filtering and sorting
  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (c.claim_number && c.claim_number.toLowerCase().includes(q)) ||
        (c.policyholder_name && c.policyholder_name.toLowerCase().includes(q)) ||
        (c.carrier_name && c.carrier_name.toLowerCase().includes(q)) ||
        (c.property_address && c.property_address.toLowerCase().includes(q))
      );
    });
  }, [claims, statusFilter, searchQuery]);

  const sortedClaims = useMemo(() => {
    const list = [...filteredClaims];
    if (sortBy === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'supplement_high') {
      list.sort((a, b) => b.total_supplement_amount - a.total_supplement_amount);
    } else if (sortBy === 'rcv_high') {
      list.sort((a, b) => (b.revised_rcv_amount || 0) - (a.revised_rcv_amount || 0));
    }
    return list;
  }, [filteredClaims, sortBy]);

  const paginatedClaims = useMemo(() => {
    const start = (currentPage - 1) * claimsPerPage;
    return sortedClaims.slice(start, start + claimsPerPage);
  }, [sortedClaims, currentPage]);

  const totalPages = Math.max(1, Math.ceil(sortedClaims.length / claimsPerPage));

  // Pipeline aggregate
  const totalPendingSupplements = useMemo(() => {
    return claims
      .filter((c) => c.status === 'supplement_pending' || c.status === 'scope_received')
      .reduce((sum, c) => sum + (c.total_supplement_amount || 0), 0);
  }, [claims]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: claims.length };
    for (const c of claims) {
      counts[c.status] = (counts[c.status] || 0) + 1;
    }
    return counts;
  }, [claims]);

  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(tradeSlug);

  return (
    <div className={styles.container}>
      {/* Toast Stack */}
      <div className={styles.toastStack} role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={styles.toast}>
            {t.type === 'success' ? <Check size={16} /> : <Info size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* In-app Confirmation Modal */}
      {modalConfirm && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <AlertTriangle size={20} color="var(--warn, #fdb022)" />
              <span>{modalConfirm.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text)' }}>
              {modalConfirm.message}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setModalConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={modalConfirm.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only Banner for jobs.read role */}
      {!canWrite && (
        <div className={styles.readOnlyBanner}>
          <Info size={18} color="var(--accent)" />
          <div>
            <strong>Read-only mode:</strong> You can parse scopes, run building code inspections, and use the claims co-pilot. Saving or deleting claims requires <code>jobs.write</code> permission.
          </div>
        </div>
      )}

      {/* Trade Gate Notice */}
      {!siteClaimsEnabled && (
        <div className={styles.readOnlyBanner} style={{ borderColor: 'rgba(253, 176, 34, 0.4)' }}>
          <AlertTriangle size={18} color="var(--warn, #fdb022)" />
          <div style={{ flex: 1 }}>
            Insurance claims tools are currently disabled for this workspace trade.
          </div>
          {canWrite && (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleEnableStudio}
              disabled={isPending}
            >
              Enable for Account
            </button>
          )}
        </div>
      )}

      {/* Draft Auto-recovery notification */}
      {draftAvailable && (
        <div className={styles.readOnlyBanner} style={{ borderColor: 'rgba(61, 214, 140, 0.4)' }}>
          <Clock size={18} color="var(--good, #3dd68c)" />
          <div style={{ flex: 1 }}>
            An unsaved scope draft from {new Date(draftAvailable).toLocaleTimeString()} is available.
          </div>
          <button type="button" className={styles.btnSecondary} onClick={restoreDraft}>
            Restore Draft
          </button>
          <button type="button" className={styles.btnSecondary} onClick={clearDraft}>
            Dismiss
          </button>
        </div>
      )}

      {/* Hero Header */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Insurance Claims &amp; Supplement Studio</h1>
            <span className={styles.tradeBadge}>{profile.name}</span>
            {selectedClaimId && (
              <span className={styles.codeBadge} style={{ background: 'rgba(255, 122, 33, 0.15)', color: 'var(--accent)' }}>
                Claim #{claimNumber || selectedClaimId.slice(0, 8)}
              </span>
            )}
          </div>
          <p className={styles.subtitle}>
            Analyze adjuster scopes, identify omitted building code mandates (IRC / OSHA / Manufacturer Specs), and generate formal dispute justification letters for {businessName}.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={loadSampleScope}
            title="Load sample State Farm hail & wind claim"
          >
            Load Sample Scope
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => clearScope(false)}
            title="Reset form and start new claim"
          >
            <PlusCircle size={15} /> New Claim
          </button>
        </div>
      </header>

      {/* Navigation Tabs with full ARIA contract */}
      <nav className={styles.tabs} role="tablist" aria-label="Claims Studio Sections">
        <button
          type="button"
          role="tab"
          id="tab-supplements"
          aria-selected={activeTab === 'supplements'}
          aria-controls="panel-supplements"
          className={`${styles.tabBtn} ${activeTab === 'supplements' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('supplements')}
        >
          <Scale size={16} /> Scope &amp; Supplement Studio
        </button>

        <button
          type="button"
          role="tab"
          id="tab-saved"
          aria-selected={activeTab === 'saved'}
          aria-controls="panel-saved"
          className={`${styles.tabBtn} ${activeTab === 'saved' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <FolderOpen size={16} /> Saved Claims ({claims.length})
        </button>

        <button
          type="button"
          role="tab"
          id="tab-feasibility"
          aria-selected={activeTab === 'feasibility'}
          aria-controls="panel-feasibility"
          className={`${styles.tabBtn} ${activeTab === 'feasibility' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('feasibility')}
        >
          <Activity size={16} /> Feasibility Rater
        </button>

        <button
          type="button"
          role="tab"
          id="tab-copilot"
          aria-selected={activeTab === 'copilot'}
          aria-controls="panel-copilot"
          className={`${styles.tabBtn} ${activeTab === 'copilot' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('copilot')}
        >
          <HelpCircle size={16} /> Claims Co-Pilot Q&amp;A
        </button>
      </nav>

      {/* =========================================================================
          TAB 1: SCOPE & SUPPLEMENT STUDIO
          ========================================================================= */}
      {activeTab === 'supplements' && (
        <section
          id="panel-supplements"
          role="tabpanel"
          aria-labelledby="tab-supplements"
          className={styles.mainGrid}
        >
          {/* Left Column: Scope Input & Metadata Form */}
          <div className={styles.leftCol}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <FileText size={16} /> Adjuster Scope Input
                </h2>
                <span className={styles.codeBadge}>
                  {analysis.analysisMethod === 'ai' ? 'AI Model' : 'Code Heuristics'}
                </span>
              </div>

              {/* Paste or Upload Text Area */}
              <div className={styles.formField}>
                <label htmlFor="scope-input" className={styles.fieldLabel}>
                  Pasted Estimate / Xactimate Scope Text
                </label>
                <textarea
                  id="scope-input"
                  rows={10}
                  className={styles.textarea}
                  placeholder="Paste raw scope text from insurance adjuster estimate, PDF OCR, or Xactimate line items..."
                  value={scopeInput}
                  onChange={(e) => {
                    setScopeInput(e.target.value);
                    setIsDirty(true);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted) handleScopeBlurOrPaste(pasted);
                  }}
                  onBlur={() => handleScopeBlurOrPaste(scopeInput)}
                />
              </div>

              {/* File upload shortcut for .txt / scope extracts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  <UploadCloud size={14} /> Upload Scope File (.txt, .pdf)
                  <input
                    type="file"
                    accept=".txt,.pdf,.text"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const content = ev.target?.result as string;
                        if (content) {
                          setScopeInput(content);
                          handleScopeBlurOrPaste(content);
                          setIsDirty(true);
                          pushToast(`Loaded scope file: ${file.name}`, 'info');
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </label>

                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={runScopeAnalysis}
                  disabled={isPending || !scopeInput.trim()}
                >
                  {isPending ? (
                    <>
                      <Loader2 size={15} className={styles.spinner} aria-label="Analyzing scope" /> Scanning...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} /> Scan Adjuster Scope {aiCredits !== null ? `(${aiCredits} left)` : ''}
                    </>
                  )}
                </button>
              </div>

              {/* Raw scope summary note */}
              {analysis.rawScopeSummary && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {analysis.rawScopeSummary}
                </p>
              )}
            </div>

            {/* Claim Metadata Form */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <ShieldCheck size={16} /> Claim &amp; Policy Metadata
                </h3>
              </div>

              <div className={styles.formGrid}>
                {/* Searchable Client Selector */}
                <div className={styles.formField}>
                  <label htmlFor="client-search" className={styles.fieldLabel}>
                    <User size={12} /> Link to Client
                  </label>
                  <div className={styles.comboboxWrapper}>
                    <input
                      id="client-search"
                      type="text"
                      className={styles.input}
                      placeholder={selectedClientId ? clients.find((c) => c.id === selectedClientId)?.name || 'Search client...' : 'Search or select client...'}
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                    />
                    {showClientDropdown && (
                      <div className={styles.comboboxDropdown}>
                        <div
                          className={styles.comboboxOption}
                          onClick={() => {
                            setSelectedClientId(null);
                            setClientSearch('');
                            setShowClientDropdown(false);
                          }}
                        >
                          <em>-- None / Unlinked --</em>
                        </div>
                        {clients
                          .filter((c) => !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                          .slice(0, 15)
                          .map((c) => (
                            <div
                              key={c.id}
                              className={styles.comboboxOption}
                              onClick={() => {
                                setSelectedClientId(c.id);
                                setClientSearch(c.name);
                                setShowClientDropdown(false);
                                if (!policyholder) setPolicyholder(c.name);
                                if (c.address && !propertyAddress) setPropertyAddress(c.address);
                                setIsDirty(true);
                              }}
                            >
                              <strong>{c.name}</strong> {c.address ? `(${c.address})` : ''}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Searchable Job Selector */}
                <div className={styles.formField}>
                  <label htmlFor="job-search" className={styles.fieldLabel}>
                    <Briefcase size={12} /> Link to Job
                  </label>
                  <div className={styles.comboboxWrapper}>
                    <input
                      id="job-search"
                      type="text"
                      className={styles.input}
                      placeholder={selectedJobId ? jobs.find((j) => j.id === selectedJobId)?.label || 'Search jobs...' : 'Search or select job...'}
                      value={jobSearch}
                      onChange={(e) => {
                        setJobSearch(e.target.value);
                        setShowJobDropdown(true);
                      }}
                      onFocus={() => setShowJobDropdown(true)}
                    />
                    {showJobDropdown && (
                      <div className={styles.comboboxDropdown}>
                        <div
                          className={styles.comboboxOption}
                          onClick={() => {
                            setSelectedJobId(null);
                            setJobSearch('');
                            setShowJobDropdown(false);
                          }}
                        >
                          <em>-- None / Unlinked --</em>
                        </div>
                        {jobs
                          .filter((j) => !jobSearch || j.label.toLowerCase().includes(jobSearch.toLowerCase()))
                          .slice(0, 15)
                          .map((j) => (
                            <div
                              key={j.id}
                              className={styles.comboboxOption}
                              onClick={() => {
                                setSelectedJobId(j.id);
                                setJobSearch(j.label);
                                setShowJobDropdown(false);
                                if (j.clientId && !selectedClientId) {
                                  setSelectedClientId(j.clientId);
                                }
                                setIsDirty(true);
                              }}
                            >
                              {j.label}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="claim-number-input" className={styles.fieldLabel}>Claim Number</label>
                  <input
                    id="claim-number-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. 49-8821-X01"
                    value={claimNumber}
                    onChange={(e) => {
                      setClaimNumber(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="policyholder-input" className={styles.fieldLabel}>Policyholder Name</label>
                  <input
                    id="policyholder-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Robert & Sarah Jenkins"
                    value={policyholder}
                    onChange={(e) => {
                      setPolicyholder(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="property-address-input" className={styles.fieldLabel}>Property / Risk Address</label>
                  <input
                    id="property-address-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. 1422 Meadowbrook Lane"
                    value={propertyAddress}
                    onChange={(e) => {
                      setPropertyAddress(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="carrier-name-input" className={styles.fieldLabel}>Insurance Carrier</label>
                  <input
                    id="carrier-name-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. State Farm, Travelers, USAA"
                    value={carrierName}
                    onChange={(e) => {
                      setCarrierName(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="adjuster-name-input" className={styles.fieldLabel}>Adjuster Name</label>
                  <input
                    id="adjuster-name-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Desk Examiner John Smith"
                    value={adjusterName}
                    onChange={(e) => {
                      setAdjusterName(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="adjuster-email-input" className={styles.fieldLabel}>Adjuster Email</label>
                  <input
                    id="adjuster-email-input"
                    type="email"
                    className={styles.input}
                    placeholder="e.g. claims@carrier.example.com"
                    value={adjusterEmail}
                    onChange={(e) => {
                      setAdjusterEmail(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="adjuster-phone-input" className={styles.fieldLabel}>Adjuster Phone</label>
                  <input
                    id="adjuster-phone-input"
                    type="tel"
                    className={styles.input}
                    placeholder="e.g. (800) 555-0199"
                    value={adjusterPhone}
                    onChange={(e) => {
                      setAdjusterPhone(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="date-of-loss-input" className={styles.fieldLabel}>Date of Loss</label>
                  <input
                    id="date-of-loss-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. 08/14/2026 - Storm"
                    value={dateOfLoss}
                    onChange={(e) => {
                      setDateOfLoss(e.target.value);
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="claim-status-select" className={styles.fieldLabel}>Claim Workflow Status</label>
                  <select
                    id="claim-status-select"
                    className={styles.select}
                    value={claimStatus}
                    onChange={(e) => {
                      setClaimStatus(e.target.value as InsuranceClaimStatus);
                      setIsDirty(true);
                    }}
                  >
                    <option value="draft">Draft Scope</option>
                    <option value="scope_received">Scope Received</option>
                    <option value="supplement_pending">Supplement Pending</option>
                    <option value="approved">Supplement Approved</option>
                    <option value="invoiced">Invoiced / Certificate of Completion</option>
                    <option value="closed">Closed Claim</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Calculations, Checklists & Dispute Letter */}
          <div className={styles.rightCol}>
            {/* Reconciliation Warning Callout if figures don't add up */}
            {analysis.reconciliationWarning && (
              <div className={styles.reconciliationBanner}>
                <AlertTriangle size={18} />
                <span>{analysis.reconciliationWarning}</span>
              </div>
            )}

            {/* Financial Summary KPI Cards (Exact cents formatting) */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Initial Adjuster RCV</span>
                <p className={styles.kpiValue}>
                  {analysis.parsedFigures.rcv != null
                    ? formatMoneyExact(analysis.parsedFigures.rcv)
                    : 'N/A'}
                </p>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiCardEmerald}`}>
                <span className={styles.kpiLabel}>Recoverable Supplement</span>
                <p className={`${styles.kpiValue} ${styles.kpiValueEmerald}`}>
                  +{formatMoneyExact(analysis.totalEstimatedSupplement)}
                </p>
              </div>

              <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
                <span className={styles.kpiLabel}>Revised Total RCV</span>
                <p className={`${styles.kpiValue} ${styles.kpiValueAccent}`}>
                  {analysis.adjustedTotalRcv != null
                    ? formatMoneyExact(analysis.adjustedTotalRcv)
                    : analysis.parsedFigures.rcv == null
                    ? 'Pending Base RCV'
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Secondary Financial Figures Row (Deductible, ACV, Depreciation, Net Claim) */}
            <div className={styles.kpiGrid} style={{ marginTop: '0.75rem' }}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Policy Deductible</span>
                <p className={styles.kpiValue} style={{ color: 'var(--warn, #fdb022)' }}>
                  {analysis.parsedFigures.deductible != null
                    ? formatMoneyExact(analysis.parsedFigures.deductible)
                    : '—'}
                </p>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Initial ACV Payment</span>
                <p className={styles.kpiValue}>
                  {analysis.parsedFigures.acv != null
                    ? formatMoneyExact(analysis.parsedFigures.acv)
                    : '—'}
                </p>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Withheld Depreciation</span>
                <p className={styles.kpiValue}>
                  {analysis.parsedFigures.depreciation != null
                    ? formatMoneyExact(analysis.parsedFigures.depreciation)
                    : '—'}
                </p>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Net Check Issued</span>
                <p className={styles.kpiValue}>
                  {analysis.parsedFigures.netClaim != null
                    ? formatMoneyExact(analysis.parsedFigures.netClaim)
                    : '—'}
                </p>
              </div>
            </div>

            {/* Net-to-Homeowner Math Breakdown */}
            {netHomeownerCalculation && (
              <div className={styles.netMathCallout}>
                <div className={styles.netMathHeader}>
                  <span>Net Expected Recovery (Contractor to Homeowner Math)</span>
                  <span style={{ color: 'var(--good, #3dd68c)', fontWeight: 700 }}>
                    {formatMoneyExact(netHomeownerCalculation.netExpected)}
                  </span>
                </div>
                <div className={styles.netMathFormula}>
                  <span>Revised RCV ({formatMoneyExact(netHomeownerCalculation.revisedRcv)})</span>
                  <span>−</span>
                  <span>Depreciation ({formatMoneyExact(netHomeownerCalculation.depreciation)})</span>
                  <span>−</span>
                  <span>Deductible ({formatMoneyExact(netHomeownerCalculation.deductible)})</span>
                  <span>=</span>
                  <strong>{formatMoneyExact(netHomeownerCalculation.netExpected)} Net to Restoration</strong>
                </div>
              </div>
            )}

            {/* Omitted Items Checklist */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <CheckCircle2 size={16} />
                  Omitted Code Items &amp; Supplements ({analysis.discrepancies.filter((d) => d.selected).length} selected)
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                    onClick={() => setShowAddCustom(!showAddCustom)}
                  >
                    <PlusCircle size={13} /> Add Custom Item
                  </button>
                  <span className={styles.tradeBadge}>
                    Total: +{formatMoneyExact(analysis.totalEstimatedSupplement)}
                  </span>
                </div>
              </div>

              {/* Custom Item Form */}
              {showAddCustom && (
                <form onSubmit={handleAddCustomSupplement} className={styles.customItemForm}>
                  <input
                    type="text"
                    className={styles.customItemInput}
                    placeholder="Supplement description (e.g. Starter course)..."
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className={styles.customItemCostInput}
                    placeholder="$ Cost"
                    value={customItemCost}
                    onChange={(e) => setCustomItemCost(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className={styles.customItemInput}
                    placeholder="Code citation (e.g. IRC R905.2.5)..."
                    value={customItemCitation}
                    onChange={(e) => setCustomItemCitation(e.target.value)}
                  />
                  <button type="submit" className={styles.btnPrimary} style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                    Add
                  </button>
                </form>
              )}

              <div className={styles.checklist}>
                {analysis.discrepancies.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '0.86rem', margin: '0.5rem 0' }}>
                    No building code omissions detected yet. Paste an adjuster scope and click scan to evaluate.
                  </p>
                ) : (
                  analysis.discrepancies.map((item) => (
                    <div key={item.id} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleDiscrepancy(item.id)}
                        className={styles.checkbox}
                        id={`check-${item.id}`}
                      />
                      <label htmlFor={`check-${item.id}`} className={styles.itemMeta} style={{ cursor: 'pointer' }}>
                        <div className={styles.itemTitleRow}>
                          <span className={styles.itemName}>{item.item}</span>
                          <span className={styles.itemCost}>+{formatMoneyExact(item.estimatedCost)}</span>
                        </div>
                        <span className={styles.itemReason}>{item.reason}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                          {item.codeCitation && (
                            <span className={styles.citationBadge}>{item.codeCitation}</span>
                          )}
                          <span className={styles.codeBadge} style={{ fontSize: '0.72rem' }}>
                            {item.detectionSource === 'code_mandate'
                              ? 'Code Mandate'
                              : item.detectionSource === 'ai_identified'
                              ? 'AI Identified'
                              : 'Custom Item'}
                          </span>
                        </div>
                      </label>

                      {/* Item Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
                        <input
                          type="number"
                          className={styles.input}
                          style={{ width: '80px', padding: '0.2rem 0.4rem', fontSize: '0.78rem', height: '28px' }}
                          value={item.estimatedCost}
                          onChange={(e) => updateDiscrepancyCost(item.id, parseFloat(e.target.value) || 0)}
                          title="Edit estimated dollar cost"
                        />
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          style={{ padding: '0.25rem 0.4rem', color: 'var(--danger, #f87171)' }}
                          onClick={() => handleDeleteDiscrepancy(item.id)}
                          aria-label={`Delete ${item.item}`}
                          title="Remove item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Adjuster Letter Output */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <FileText size={16} /> Generated Adjuster Dispute Letter
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={copyLetterToClipboard}
                    title="Copy letter to clipboard"
                  >
                    <Copy size={13} /> Copy
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={emailAdjuster}
                    title="Open draft email to adjuster"
                  >
                    <Mail size={13} /> Email Adjuster
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={printLetter}
                    title="Print or export as PDF"
                  >
                    <Printer size={13} /> Print / PDF
                  </button>
                </div>
              </div>

              <pre
                tabIndex={0}
                role="region"
                aria-label="Generated justification letter"
                className={styles.letterPre}
              >
                {activeLetterDraft}
              </pre>

              {/* Save Claim Persistence Bar */}
              <div className={styles.saveBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--muted)' }}>
                    {selectedClaimId ? `Updating saved record (${selectedClaimId.slice(0, 8)})` : 'New unsaved claim record'}
                  </span>
                  {isDirty && (
                    <span style={{ color: 'var(--warn, #fdb022)', fontWeight: 600 }}>• Unsaved edits</span>
                  )}
                </div>

                <div className={styles.saveBarActions}>
                  {canWrite ? (
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={handleSaveClaim}
                      disabled={isSavingClaim}
                    >
                      {isSavingClaim ? (
                        <>
                          <Loader2 size={14} className={styles.spinner} aria-label="Saving claim" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save size={14} /> {selectedClaimId ? 'Update Claim' : 'Save Claim'}
                        </>
                      )}
                    </button>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Save disabled (requires jobs.write)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 2: SAVED CLAIMS
          ========================================================================= */}
      {activeTab === 'saved' && (
        <section
          id="panel-saved"
          role="tabpanel"
          aria-labelledby="tab-saved"
          className={styles.card}
        >
          {/* Header & Pipeline Metrics */}
          <div className={styles.savedClaimsBar}>
            <div>
              <h2 className={styles.cardTitle} style={{ fontSize: '1.15rem' }}>
                <FolderOpen size={18} /> Saved Workspace Claims
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--muted)' }}>
                {claims.length} total saved insurance claims and building code supplement packages.
              </p>
            </div>

            <div className={styles.pipelineMetric}>
              <span>Total Supplements Pending:</span>
              <strong>+{formatMoneyExact(totalPendingSupplements)}</strong>
            </div>
          </div>

          {/* Search, Filter Pills & Sort Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
            <div className={styles.filterChips}>
              {(['all', 'draft', 'scope_received', 'supplement_pending', 'approved', 'invoiced', 'closed'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`${styles.filterChip} ${statusFilter === status ? styles.filterChipActive : ''}`}
                  onClick={() => {
                    setStatusFilter(status);
                    setCurrentPage(1);
                  }}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ')} ({statusCounts[status] || 0})
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative', width: '220px' }}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Search claims, insured, carrier..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{ paddingLeft: '2rem', height: '34px', fontSize: '0.82rem' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              </div>

              <select
                aria-label="Sort insurance claims"
                className={styles.select}
                style={{ width: '160px', height: '34px', minHeight: '34px', fontSize: '0.82rem', padding: '0.2rem 0.5rem' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="supplement_high">Highest Supplement</option>
                <option value="rcv_high">Highest RCV</option>
              </select>
            </div>
          </div>

          {/* Claims Grid */}
          {paginatedClaims.length === 0 ? (
            <div className={styles.emptyClaims}>
              <FolderOpen size={36} />
              <h3 style={{ margin: 0, fontWeight: 700, color: 'var(--text)' }}>No matching insurance claims</h3>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>
                {claims.length === 0
                  ? 'No claims saved yet. Paste an adjuster scope in the studio and click Save Claim.'
                  : 'No claims match your search filter criteria.'}
              </p>
              {claims.length === 0 && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => {
                    loadSampleScope();
                    setActiveTab('supplements');
                  }}
                >
                  Load Sample Scope
                </button>
              )}
            </div>
          ) : (
            <div className={styles.claimsGrid}>
              {paginatedClaims.map((c) => {
                const isSelected = selectedClaimId === c.id;
                const badgeClass =
                  c.status === 'approved'
                    ? styles.badgeApproved
                    : c.status === 'supplement_pending'
                    ? styles.badgePending
                    : styles.badgeDraft;

                // Aging calculation
                const ageDays = Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24));
                const agingClass =
                  ageDays > 30 ? styles.agingStale : ageDays > 14 ? styles.agingWarning : styles.agingFresh;

                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLoadClaim(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleLoadClaim(c);
                      }
                    }}
                    className={`${styles.claimCard} ${isSelected ? styles.claimCardActive : ''}`}
                    aria-label={`Claim #${c.claim_number || c.id.slice(0, 8)} for ${c.policyholder_name || 'Policyholder'}`}
                  >
                    <div className={styles.claimCardHeader}>
                      <div>
                        <h4 className={styles.claimPolicyholder}>
                          {c.policyholder_name || 'Unnamed Insured'}
                        </h4>
                        <div className={styles.claimSubInfo}>
                          {c.claim_number && <span>Claim #{c.claim_number}</span>}
                          {c.carrier_name && <span>• {c.carrier_name}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className={`${styles.claimBadge} ${badgeClass}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                        <span className={`${styles.agingBadge} ${agingClass}`}>
                          {ageDays}d
                        </span>
                      </div>
                    </div>

                    {c.property_address && (
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MapPin size={13} color="var(--accent)" /> {c.property_address}
                      </p>
                    )}

                    <div className={styles.claimMetaRow}>
                      <div className={styles.claimMetaItem}>
                        <strong>Supplement:</strong>
                        <span style={{ color: 'var(--good, #3dd68c)', fontWeight: 700 }}>
                          +{formatMoneyExact(c.total_supplement_amount)}
                        </span>
                      </div>

                      {c.parsed_figures?.rcv != null && (
                        <div className={styles.claimMetaItem}>
                          <strong>RCV:</strong> {formatMoneyExact(c.parsed_figures.rcv)}
                        </div>
                      )}

                      <div className={styles.claimMetaItem} style={{ marginLeft: 'auto' }}>
                        {canWrite && (
                          <button
                            type="button"
                            onClick={(e) => confirmDeleteClaim(c.id, e)}
                            className={styles.btnSecondary}
                            style={{ padding: '0.2rem 0.5rem', color: 'var(--danger, #f87171)' }}
                            aria-label="Delete this claim"
                            title="Move to trash"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.78rem', color: 'var(--accent)' }}>
                          <FolderOpen size={12} /> Open
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ padding: '0.35rem 0.65rem' }}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span style={{ fontSize: '0.84rem', color: 'var(--muted)', margin: '0 0.5rem' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ padding: '0.35rem 0.65rem' }}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 3: DAMAGE CLAIM FEASIBILITY RATER
          ========================================================================= */}
      {activeTab === 'feasibility' && (
        <section
          id="panel-feasibility"
          role="tabpanel"
          aria-labelledby="tab-feasibility"
          className={styles.feasibilityContainer}
        >
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <Calculator size={16} /> Pre-Claim Viability Rater
              </h2>
            </div>
            <p style={{ margin: '0 0 1rem', fontSize: '0.86rem', color: 'var(--muted)' }}>
              Evaluate damage severity before homeowner filing to verify that restoration costs will comfortably exceed the deductible.
            </p>

            <div className={styles.formField}>
              <label htmlFor="feasibility-damage-input" className={styles.fieldLabel}>
                Observed Physical Damage Description
              </label>
              <textarea
                id="feasibility-damage-input"
                rows={4}
                className={styles.textarea}
                placeholder="Describe visible damage (e.g. Hail storm impacted south-facing slope, creased shingles, gutter denting, secondary attic leak)..."
                value={damageDesc}
                onChange={(e) => setDamageDesc(e.target.value)}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label htmlFor="feasibility-peril-select" className={styles.fieldLabel}>Primary Storm / Peril Type</label>
                <select
                  id="feasibility-peril-select"
                  className={styles.select}
                  value={perilType}
                  onChange={(e) => setPerilType(e.target.value)}
                >
                  <option value="Hail & Wind">Hail &amp; High Wind</option>
                  <option value="Tornado / Microburst">Tornado / Severe Microburst</option>
                  <option value="Fallen Tree">Fallen Tree / Heavy Limb</option>
                  <option value="Pipe Burst / Water">Sudden Pipe Burst / Water Infiltration</option>
                  <option value="General Wear">Gradual Aging / Wear &amp; Tear</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="feasibility-roof-age-input" className={styles.fieldLabel}>Approximate Roof / Material Age (Years)</label>
                <input
                  id="feasibility-roof-age-input"
                  type="number"
                  min={0}
                  max={50}
                  className={styles.input}
                  value={roofAge}
                  onChange={(e) => setRoofAge(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="feasibility-deductible-input" className={styles.fieldLabel}>Homeowner Policy Deductible ($)</label>
                <input
                  id="feasibility-deductible-input"
                  type="number"
                  min={0}
                  step={250}
                  className={styles.input}
                  value={deductible}
                  onChange={(e) => setDeductible(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <button
              type="button"
              className={styles.btnPrimary}
              style={{ marginTop: '1rem' }}
              onClick={runFeasibilityEvaluation}
              disabled={isPending || !damageDesc.trim()}
            >
              {isPending ? (
                <>
                  <Loader2 size={15} className={styles.spinner} aria-label="Evaluating feasibility" /> Evaluating...
                </>
              ) : (
                <>
                  <Activity size={15} /> Rate Claim Viability
                </>
              )}
            </button>
          </div>

          {/* Results Output */}
          {feasibility && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <ShieldCheck size={16} /> Feasibility Assessment Results
                </h3>
                <span className={styles.tradeBadge}>
                  Score: {feasibility.feasibilityScore}/100 ({feasibility.probability.toUpperCase()})
                </span>
              </div>

              <div className={styles.formField}>
                <span className={styles.fieldLabel}>Actionable Recommendation</span>
                {feasibility.recommendation === 'file_claim' && (
                  <span style={{ color: 'var(--good, #3dd68c)', fontWeight: 700 }}>
                    Proceed with insurance claim filing. Damage scope safely exceeds deductible.
                  </span>
                )}
                {feasibility.recommendation === 'inspection_first' && (
                  <span style={{ color: 'var(--warn, #fdb022)', fontWeight: 700 }}>
                    Perform physical damage photo inspection before filing claim.
                  </span>
                )}
                {feasibility.recommendation === 'out_of_pocket_maintenance' && (
                  <span style={{ color: 'var(--danger, #f87171)', fontWeight: 700 }}>
                    Quote as out-of-pocket maintenance (likely excluded wear-and-tear).
                  </span>
                )}
              </div>

              <div className={styles.formField}>
                <span className={styles.fieldLabel}>Estimated Scope Range</span>
                <p style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, margin: 0, fontSize: '1.05rem', color: 'var(--text)' }}>
                  {formatMoneyExact(feasibility.estimatedDamageRange.min)} – {formatMoneyExact(feasibility.estimatedDamageRange.max)}
                </p>
              </div>

              {/* Contractor Brief */}
              {feasibility.contractorBrief && (
                <div className={styles.formField}>
                  <span className={styles.fieldLabel}>Contractor Technical Brief</span>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
                    {feasibility.contractorBrief}
                  </p>
                </div>
              )}

              {/* Homeowner Summary */}
              {feasibility.homeownerSummary && (
                <div className={styles.formField}>
                  <span className={styles.fieldLabel}>Homeowner Plain-English Summary</span>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)' }}>
                    {feasibility.homeownerSummary}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 4: HOMEOWNER CLAIMS CO-PILOT
          ========================================================================= */}
      {activeTab === 'copilot' && (
        <section
          id="panel-copilot"
          role="tabpanel"
          aria-labelledby="tab-copilot"
          className={styles.copilotContainer}
        >
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <HelpCircle size={16} /> Homeowner Claim Co-Pilot &amp; UPPA Guidance
              </h2>
            </div>
            <p style={{ margin: '0 0 1rem', fontSize: '0.86rem', color: 'var(--muted)' }}>
              Contractor assistance engine for explaining insurance restoration concepts to homeowners without violating state Unauthorized Practice of Public Adjusting (UPPA) regulations.
            </p>

            {/* UPPA Rules Callout */}
            <div className={styles.uppaNotice}>
              <div className={styles.uppaHeader}>
                <AlertTriangle size={15} color="var(--warn, #fdb022)" />
                <strong>UPPA Compliance Safeguards for Contractors</strong>
              </div>
              <ul className={styles.uppaList}>
                {UPPA_COMPLIANCE_RULES.map((r, i) => (
                  <li key={i}>
                    <strong>{r.rule}</strong> — {r.guideline}
                  </li>
                ))}
              </ul>
            </div>

            {/* Interactive FAQs */}
            <h3 style={{ fontSize: '0.96rem', fontWeight: 600, margin: '1.25rem 0 0.5rem', color: 'var(--text)' }}>
              Frequently Asked Homeowner Claim Questions
            </h3>
            <div className={styles.faqList}>
              {HOMEOWNER_CLAIM_FAQS.map((faq, index) => (
                <div key={index} className={styles.faqItem}>
                  <button
                    type="button"
                    className={styles.faqQuestion}
                    onClick={() => setCopilotAnswer(faq.detailedExplanation)}
                  >
                    <span>{faq.question}</span>
                    <span className={styles.codeBadge}>{faq.shortAnswer}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Custom Question Form */}
            <form onSubmit={handleAskCopilot} style={{ marginTop: '1.5rem' }}>
              <div className={styles.formField}>
                <label htmlFor="custom-question-input" className={styles.fieldLabel}>Ask Custom Question</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    id="custom-question-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. Can we submit a supplement if the adjuster says drip edge isn't necessary?..."
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                  />
                  <button
                    type="submit"
                    className={styles.btnPrimary}
                    disabled={isAskingCopilot || !customQuestion.trim()}
                  >
                    {isAskingCopilot ? <Loader2 size={14} className={styles.spinner} aria-label="Answering question" /> : 'Ask'}
                  </button>
                </div>
              </div>
            </form>

            {/* Answer Display */}
            {copilotAnswer && (
              <div className={styles.card} style={{ marginTop: '1rem', background: 'rgba(var(--tint), 0.02)' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                  Co-Pilot Response (UPPA Compliant)
                </h4>
                <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {copilotAnswer}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
