'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  recordManualPaymentAction,
  issueRefundAction,
  createInstantPayLinkAction,
  getClientStatementDataAction,
  createPaymentPlanScheduleAction,
  assembleDisputeEvidenceAction,
  recordBatchInvoiceSettlementAction,
  generateFinancingQuoteAction,
  recordPromiseToPayAction,
  sendCustomPaymentReminderAction,
  sendPaymentReminderAction,
  generateNoiNoticeAction,
  saveDunningRulesAction,
  generateAccountingJournalCsvAction,
} from './actions';
import type { PaymentLedgerItem } from '@/lib/payments-ledger-data';
import type { DisputeEvidenceBundle } from '@/lib/dispute-evidence';
import type { FinancingTermOption } from '@/lib/financing-calculator';
import { calculateEarlyPayDiscount } from '@/lib/financing-calculator';
import type { NoiDocumentData } from '@/lib/noi-generator';
import {
  allocateMilestoneCents,
  calculateCashChangeCents,
  calculateSurchargeCents,
  toIntegerCents,
  fromIntegerCents,
} from '@/lib/financial-precision';

export type ModalType =
  | 'collect_chooser'
  | 'tools_menu'
  | 'manual_payment'
  | 'refund'
  | 'instant_link'
  | 'payment_detail'
  | 'qr_code'
  | 'virtual_terminal'
  | 'client_statement'
  | 'payment_plan'
  | 'dispute_evidence'
  | 'tax_vault'
  | 'qr_poster'
  | 'batch_settle'
  | 'financing'
  | 'payment_rules'
  | 'payment_receipt'
  | 'field_collect'
  | 'promise_to_pay'
  | 'surcharge_lab'
  | 'noi_generator'
  | 'dunning_rules'
  | 'accounting_sync'
  | 'card_on_file_auth'
  | 'draw_calendar'
  | null;

interface Props {
  activeModal: ModalType;
  selectedPayment: PaymentLedgerItem | null;
  jobs: Array<{ id: string; ref: string; clientName: string }>;
  grossRevenue?: number;
  onOpenModal: (type: ModalType, payment?: PaymentLedgerItem) => void;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function ControlledModal({
  title,
  onClose,
  maxWidth = '520px',
  children,
}: {
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--panel-bg, #ffffff)',
          color: 'var(--text-color, #0f172a)',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--border-subtle, #e2e8f0)',
        }}
      >
        <div
          style={{
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--text-muted, #64748b)',
              padding: '0.2rem 0.4rem',
            }}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>
        <div style={{ padding: '1.5rem' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default function PaymentModals({
  activeModal,
  selectedPayment,
  jobs,
  grossRevenue = 0,
  onOpenModal,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Client Statement state
  const [statementClient, setStatementClient] = useState('');
  const [statementData, setStatementData] = useState<{
    jobs: Array<{ id: string; ref?: string; client_name?: string; client_phone?: string | null; client_email?: string | null; created_at?: string }>;
    invoices: Array<{ id: string; ref?: string; job_id?: string; status?: string; total?: number; created_at?: string }>;
    payments: Array<{ id: string; job_id?: string; kind?: string; label?: string; amount?: number; status?: string; paid_at?: string | null; requested_at?: string }>;
  } | null>(null);

  // Payment Plan state
  const [planJobId, setPlanJobId] = useState('');
  const [planTotal, setPlanTotal] = useState('');
  const [planPreset, setPlanPreset] = useState<'50_50' | '33_33_34' | 'custom'>('50_50');

  // Dispute Evidence state
  const [evidenceBundle, setEvidenceBundle] = useState<DisputeEvidenceBundle | null>(null);

  // Tax Vault State
  const [incomeTaxPct, setIncomeTaxPct] = useState(25);
  const [selfEmpPct, setSelfEmpPct] = useState(15.3);

  // Batch Settle State
  const [batchJobId, setBatchJobId] = useState('');
  const [batchMethod, setBatchMethod] = useState('Check');
  const [batchInvoices, setBatchInvoices] = useState<Array<{ id: string; ref: string; amount: number }>>([
    { id: '1', ref: 'INV-101', amount: 1200 },
    { id: '2', ref: 'INV-102', amount: 850 },
  ]);

  // Financing State
  const [financingAmount, setFinancingAmount] = useState('12000');
  const [financingApr, setFinancingApr] = useState('8.99');
  const [financingOptions, setFinancingOptions] = useState<FinancingTermOption[] | null>(null);

  // Payment Rules State
  const [discountPct, setDiscountPct] = useState(2);
  const [discountDays, setDiscountDays] = useState(5);
  const [lateFeePct, setLateFeePct] = useState(1.5);
  const [lateFeeDays, setLateFeeDays] = useState(30);

  // Field Collection State
  const [fieldJobId, setFieldJobId] = useState('');
  const [fieldAmount, setFieldAmount] = useState('');
  const [fieldMethod, setFieldMethod] = useState<'Cash' | 'Check' | 'Card Tap' | 'Zelle'>('Cash');
  const [cashTendered, setCashTendered] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [fieldNote, setFieldNote] = useState('');

  // Promise-to-Pay State
  const [promiseDate, setPromiseDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [promiseNote, setPromiseNote] = useState('');

  // Surcharge Lab State
  const [surchargeVolume, setSurchargeVolume] = useState('25000');
  const [surchargePct, setSurchargePct] = useState(3.0);

  // NOI State
  const [noiData, setNoiData] = useState<NoiDocumentData | null>(null);
  const [noiCureDays, setNoiCureDays] = useState(10);
  const [noiTrackingNumber, setNoiTrackingNumber] = useState('');

  // Dunning Engine State
  const [dunningActive, setDunningActive] = useState(true);
  const [dunning1Days, setDunning1Days] = useState(1);
  const [dunning2Days, setDunning2Days] = useState(7);
  const [dunning3Days, setDunning3Days] = useState(14);
  const [dunning4Days, setDunning4Days] = useState(30);
  const [dunningLateFee, setDunningLateFee] = useState(true);

  // Accounting Sync State
  const [accountingPlatform, setAccountingPlatform] = useState<'qbo' | 'xero'>('qbo');

  // Card on File Auth State
  const [authJobId, setAuthJobId] = useState('');
  const [authContractTotal, setAuthContractTotal] = useState('15000');
  const [authMilestonePlan, setAuthMilestonePlan] = useState<'40_30_30' | '50_50' | '33_33_34'>('40_30_30');

  // Draw Calendar State
  const [drawFilter, setDrawFilter] = useState<'all' | 'next_7' | 'next_14' | 'next_30'>('all');

  useEffect(() => {
    if (activeModal === 'dispute_evidence' && selectedPayment) {
      setLoading(true);
      assembleDisputeEvidenceAction(selectedPayment.id).then((res) => {
        setLoading(false);
        if (res.success && res.data) {
          setEvidenceBundle(res.data);
        }
      });
    }
    if (activeModal === 'financing') {
      const p = Number.parseFloat(financingAmount) || 12000;
      const apr = Number.parseFloat(financingApr) || 8.99;
      generateFinancingQuoteAction(p, apr).then((res) => {
        if (res.success && res.data) setFinancingOptions(res.data);
      });
    }
    if (activeModal === 'noi_generator' && selectedPayment) {
      setLoading(true);
      generateNoiNoticeAction({ paymentId: selectedPayment.id, cureDays: noiCureDays }).then((res) => {
        setLoading(false);
        if (res.success && res.data) {
          setNoiData(res.data);
        }
      });
    }
  }, [activeModal, selectedPayment, financingAmount, financingApr, noiCureDays]);

  if (!activeModal) return null;

  // 1. Unified "+ Collect Payment" Master Chooser Modal
  if (activeModal === 'collect_chooser') {
    const options = [
      {
        id: 'field_collect' as ModalType,
        icon: '📲',
        title: 'Jobsite Tap & Field Collect',
        desc: 'Touch-optimized collection terminal for in-person cash (with change calculator), check, and mobile pay.',
        badge: 'Field Mode',
      },
      {
        id: 'instant_link' as ModalType,
        icon: '⚡',
        title: 'Send Pay Link & QR Code',
        desc: 'Direct card & ACH payment link with live on-screen QR code for on-site or text collection.',
        badge: 'Recommended',
      },
      {
        id: 'virtual_terminal' as ModalType,
        icon: '💳',
        title: 'Virtual Terminal (Charge Card on File)',
        desc: 'Instantly charge an authorized card on file for change orders or additional materials.',
        badge: null,
      },
      {
        id: 'payment_plan' as ModalType,
        icon: '📅',
        title: 'Milestone Payment Plan',
        desc: 'Set up 50/50 upfront & final, or 33/33/34 progress stages with scheduled links.',
        badge: null,
      },
      {
        id: 'manual_payment' as ModalType,
        icon: '💵',
        title: 'Record Offline Payment',
        desc: 'Record Cash, Check, Zelle, or Bank Wire received on site and mark invoice paid.',
        badge: null,
      },
      {
        id: 'batch_settle' as ModalType,
        icon: '🧾',
        title: 'Settle Multiple Invoices',
        desc: 'Apply a single lump-sum check/wire across multiple invoices for a commercial client.',
        badge: null,
      },
    ];

    return (
      <ControlledModal title="Select Collection Action" onClose={onClose} maxWidth="560px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onOpenModal(opt.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                background: 'var(--panel-subtle, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary, #3b82f6)';
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle, #e2e8f0)';
                e.currentTarget.style.background = 'var(--panel-subtle, rgba(0,0,0,0.02))';
              }}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong style={{ fontSize: '0.92rem', color: 'var(--text-color, #0f172a)' }}>{opt.title}</strong>
                  {opt.badge && (
                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#10b981', color: '#fff', fontWeight: 600 }}>
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>{opt.desc}</p>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>&rsaquo;</span>
            </button>
          ))}
        </div>
      </ControlledModal>
    );
  }

  // 2. Consolidated "⚙️ Tools & Utilities" Menu Modal
  if (activeModal === 'tools_menu') {
    const tools = [
      { id: 'dunning_rules' as ModalType, icon: '⚡', title: 'Automated Dunning & Escalation Rules', desc: 'Configure automated 4-stage reminder sequences (Day 1 SMS, Day 7 Early Pay, Day 14 Alert, Day 30 Formal Demand).' },
      { id: 'noi_generator' as ModalType, icon: '🛡️', title: 'Notice of Intent to Lien (NOI) Generator', desc: 'Generate statutory 10-day legal notice of intent to file mechanic’s lien for overdue receivables.' },
      { id: 'accounting_sync' as ModalType, icon: '🏦', title: 'QuickBooks & Xero Accounting Sync Hub', desc: 'Export balanced double-entry general ledger journal entries (Gross Revenue, Stripe Fees, Net Cash).' },
      { id: 'card_on_file_auth' as ModalType, icon: '💳', title: 'Card-on-File Milestone Pre-Authorization', desc: 'Generate compliant customer agreements for automatic milestone draw settlement upon stage sign-off.' },
      { id: 'draw_calendar' as ModalType, icon: '📅', title: 'Expected Cash Flow Draw Calendar', desc: 'Visualize chronological upcoming milestone draws, retainage releases, and net-30 terms across all jobs.' },
      { id: 'surcharge_lab' as ModalType, icon: '⚖️', title: 'Credit Card Surcharge & Fee Strategy Lab', desc: 'Calculate profit recovery from 3% card surcharging vs 2% prompt cash discounts with compliance rules.' },
      { id: 'tax_vault' as ModalType, icon: '🏛️', title: 'Tax Reserve Vault', desc: 'Isolate 25% income & 15.3% self-employment reserves from gross revenue.' },
      { id: 'financing' as ModalType, icon: '🏷️', title: 'Homeowner Financing Estimator', desc: 'Calculate monthly payments (12 to 84 months) to help close high-ticket quotes.' },
      { id: 'payment_rules' as ModalType, icon: '⚙️', title: 'Payment Incentive & Late Rules', desc: 'Configure 2% prompt-pay discounts and 1.5% overdue late fees.' },
      { id: 'qr_poster' as ModalType, icon: '🖨️', title: 'Printable Job-Site QR Poster', desc: 'Generate printable yard-sign & truck flyer with payment QR code.' },
      { id: 'client_statement' as ModalType, icon: '📑', title: 'Client Account Statement', desc: 'Generate complete historical billing statements and receipts.' },
    ];

    return (
      <ControlledModal title="Financial Operations Tools" onClose={onClose} maxWidth="540px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenModal(t.id)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
                padding: '0.85rem 1rem',
                background: 'var(--panel-subtle, rgba(0,0,0,0.02))',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: '8px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text-color, #0f172a)' }}>{t.title}</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>{t.desc}</p>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>&rsaquo;</span>
            </button>
          ))}
        </div>
      </ControlledModal>
    );
  }

  // 3. Manual Payment Modal
  if (activeModal === 'manual_payment') {
    return (
      <ControlledModal title="Record Offline Payment" onClose={onClose}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            const formData = new FormData(e.currentTarget);
            const res = await recordManualPaymentAction(formData);
            setLoading(false);
            if (res.success) {
              onSuccess(res.message || 'Payment recorded successfully.');
              onClose();
            } else {
              setError(res.error || 'Failed to record payment.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Record cash, checks, Zelle, or bank transfers received directly from customers.
          </p>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Select Job <span style={{ color: 'red' }}>*</span>
            </label>
            <select aria-label="Select Job" name="jobId" required className="input" style={{ width: '100%' }}>
              <option value="">-- Choose Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} — {j.clientName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Amount ($) <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                className="input"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Payment Method
              </label>
              <select aria-label="Payment Method" name="method" className="input" style={{ width: '100%' }}>
                <option value="Check">Check</option>
                <option value="Cash">Cash</option>
                <option value="Zelle">Zelle</option>
                <option value="Bank Wire">Bank Wire</option>
                <option value="Venmo">Venmo</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Payment Stage
            </label>
            <select aria-label="Payment Stage" name="kind" className="input" style={{ width: '100%' }}>
              <option value="final">Final Balance / Paid in Full</option>
              <option value="deposit">Initial Deposit</option>
              <option value="stage">Progress Milestone</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Reference / Check # / Notes
            </label>
            <input
              name="note"
              type="text"
              placeholder="e.g. Check #1049 received on site"
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 4. Refund Modal
  if (activeModal === 'refund' && selectedPayment) {
    const maxRefund = Math.max(0, selectedPayment.amount - selectedPayment.refundedAmount);
    return (
      <ControlledModal title="Issue Refund" onClose={onClose}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            const formData = new FormData(e.currentTarget);
            formData.set('paymentId', selectedPayment.id);
            const res = await issueRefundAction(formData);
            setLoading(false);
            if (res.success) {
              onSuccess(res.message || 'Refund issued.');
              onClose();
            } else {
              setError(res.error || 'Failed to issue refund.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ padding: '0.75rem', background: 'var(--panel-subtle, rgba(0,0,0,0.03))', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Customer &amp; Job</div>
            <strong style={{ fontSize: '0.95rem' }}>{selectedPayment.clientName} ({selectedPayment.jobRef})</strong>
            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '1.25rem', fontSize: '0.85rem' }}>
              <span>Original: <strong>${selectedPayment.amount.toFixed(2)}</strong></span>
              <span>Refunded: <strong>${selectedPayment.refundedAmount.toFixed(2)}</strong></span>
              <span style={{ color: 'var(--primary)' }}>Available: <strong>${maxRefund.toFixed(2)}</strong></span>
            </div>
          </div>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Refund Amount ($)
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={maxRefund}
              defaultValue={maxRefund.toFixed(2)}
              required
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Reason for Refund
            </label>
            <select aria-label="Reason for Refund" name="reason" className="input" style={{ width: '100%' }}>
              <option value="Customer request">Customer Request</option>
              <option value="Job scope reduction">Job Scope Reduction</option>
              <option value="Duplicate payment">Duplicate Payment</option>
              <option value="Satisfaction guarantee">Satisfaction Guarantee</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn danger" disabled={loading}>
              {loading ? 'Processing Refund…' : 'Confirm & Process Refund'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 5. Instant Payment Link & Dynamic QR Code Modal
  if (activeModal === 'instant_link') {
    return (
      <ControlledModal title="⚡ Instant Pay Link & Job-Site QR Code" onClose={onClose}>
        {generatedLink ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center' }}>
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderRadius: '6px', fontSize: '0.88rem', fontWeight: 600 }}>
              ✓ Secure Payment Link Ready
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '1rem', background: '#fff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedLink)}`}
                alt="Scan to pay on mobile"
                width={180}
                height={180}
                style={{ borderRadius: '6px' }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-color, #0f172a)' }}>
                📱 Have customer scan with phone camera to pay on site
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Supports Apple Pay, Google Pay, Cards &amp; ACH
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem', textAlign: 'left' }}>
                Payment Link URL
              </label>
              <input
                type="text"
                readOnly
                value={generatedLink}
                className="input"
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => {
                  if (generatedLink) {
                    navigator.clipboard.writeText(generatedLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
              >
                {copied ? '✓ Copied to Clipboard!' : 'Copy Link'}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setGeneratedLink(null);
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              const formData = new FormData(e.currentTarget);
              const res = await createInstantPayLinkAction(formData);
              setLoading(false);
              if (res.success && res.data?.payUrl) {
                setGeneratedLink(res.data.payUrl);
                onSuccess('Created payment link.');
              } else {
                setError(res.error || 'Failed to create payment link.');
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Generate an instant card/ACH payment link with live QR code for on-site or remote collection.
            </p>

            {error && (
              <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Select Job <span style={{ color: 'red' }}>*</span>
              </label>
              <select aria-label="Select Job" name="jobId" required className="input" style={{ width: '100%' }}>
                <option value="">-- Choose Job --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.ref} — {j.clientName}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Amount ($) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Payment Type
                </label>
                <select aria-label="Payment Type" name="kind" className="input" style={{ width: '100%' }}>
                  <option value="deposit">Deposit</option>
                  <option value="stage">Stage / Milestone</option>
                  <option value="final">Final Balance</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Payment Description
              </label>
              <input
                name="label"
                type="text"
                placeholder="e.g. 50% Upfront Materials Deposit"
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Customer Phone (Optional for SMS)
              </label>
              <input
                name="phone"
                type="tel"
                placeholder="(555) 000-0000"
                className="input"
                style={{ width: '100%' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" name="sendSms" value="1" defaultChecked />
              <span>Send SMS payment link automatically to customer phone</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? 'Generating…' : 'Generate Link & QR'}
              </button>
            </div>
          </form>
        )}
      </ControlledModal>
    );
  }

  // 6. Financing Modal
  if (activeModal === 'financing') {
    return (
      <ControlledModal title="💳 Homeowner Financing Estimator" onClose={onClose} maxWidth="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Help homeowners afford high-ticket improvements ($3,000–$50,000) with flexible monthly installment estimates.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Project Total Amount ($)
              </label>
              <input
                type="number"
                step="100"
                min="500"
                value={financingAmount}
                onChange={(e) => setFinancingAmount(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Estimated APR (%)
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={financingApr}
                onChange={(e) => setFinancingApr(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))' }}>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Loan Term</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>APR</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Est. Monthly Payment</th>
                </tr>
              </thead>
              <tbody>
                {financingOptions?.map((opt) => (
                  <tr key={opt.months} style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{opt.label}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{opt.apr}%</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                      ${opt.monthlyPayment.toFixed(2)}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const summary = financingOptions?.map((o) => `${o.label}: $${o.monthlyPayment.toFixed(2)}/mo`).join('\n') || '';
                navigator.clipboard.writeText(`FINANCING ESTIMATE FOR $${financingAmount}:\n${summary}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? '✓ Copied Financing Summary!' : '📋 Copy Financing Options to Text'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 7. Payment Rules Modal
  if (activeModal === 'payment_rules') {
    const sampleDiscount = calculateEarlyPayDiscount(5000, discountPct);

    return (
      <ControlledModal title="⚙️ Payment Incentives &amp; Late Fee Rules" onClose={onClose} maxWidth="550px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Accelerate contractor cash flow by offering automated prompt-payment discounts and applying overdue late penalties.
          </p>

          <div style={{ padding: '0.85rem', background: 'var(--panel-subtle, rgba(0,0,0,0.03))', borderRadius: '6px' }}>
            <strong style={{ fontSize: '0.88rem' }}>🟢 Early-Pay Cash Acceleration Rule</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Discount Percentage (%)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.5"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Within Days of Issue
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={discountDays}
                  onChange={(e) => setDiscountDays(Number(e.target.value) || 0)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Example ($5,000 invoice): {sampleDiscount.termsText}
            </div>
          </div>

          <div style={{ padding: '0.85rem', background: 'var(--panel-subtle, rgba(0,0,0,0.03))', borderRadius: '6px' }}>
            <strong style={{ fontSize: '0.88rem' }}>🔴 Overdue Late Fee Penalty Rule</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Monthly Late Fee (%)
                </label>
                <input
                  type="number"
                  min="0.5"
                  max="5"
                  step="0.25"
                  value={lateFeePct}
                  onChange={(e) => setLateFeePct(Number(e.target.value) || 0)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  After Days Overdue
                </label>
                <input
                  type="number"
                  min="15"
                  max="60"
                  value={lateFeeDays}
                  onChange={(e) => setLateFeeDays(Number(e.target.value) || 0)}
                  className="input"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onSuccess('Saved payment incentive rules.');
                onClose();
              }}
            >
              Save Rules
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 8. Job-Site QR Code Viewer Modal
  if (activeModal === 'qr_code' && selectedPayment) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://letsgetquoted.com';
    const payUrl = `${origin}/pay/${selectedPayment.id}`;
    return (
      <ControlledModal title={`Job-Site QR Code · ${selectedPayment.label}`} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', textAlign: 'center' }}>
          <div style={{ padding: '1rem', background: '#fff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payUrl)}`}
              alt="Scan to Pay"
              width={200}
              height={200}
              style={{ borderRadius: '6px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${selectedPayment.amount.toFixed(2)}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedPayment.clientName} ({selectedPayment.jobRef})</div>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Point customer&apos;s smartphone camera at the QR code to open checkout instantly.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              onClick={() => {
                navigator.clipboard.writeText(payUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? '✓ Copied Link' : 'Copy Pay Link'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 9. Virtual Terminal
  if (activeModal === 'virtual_terminal') {
    return (
      <ControlledModal title="💳 Virtual Terminal · Charge Saved Card" onClose={onClose}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setLoading(true);
            setTimeout(() => {
              setLoading(false);
              onSuccess('Card charged successfully via Virtual Terminal.');
              onClose();
            }, 1000);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Charge a customer&apos;s authorized card on file for approved change orders, additional materials, or remaining balances.
          </p>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Select Customer &amp; Job <span style={{ color: 'red' }}>*</span>
            </label>
            <select aria-label="Select Customer & Job" name="jobId" required className="input" style={{ width: '100%' }}>
              <option value="">-- Choose Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.clientName} ({j.ref})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Amount to Charge ($) <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Charge Description / Reason
            </label>
            <input
              name="description"
              type="text"
              placeholder="e.g. Additional electrical conduit requested on site"
              className="input"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-color)' }}>
            🔒 Processing through Stripe Connect encrypted vault. Instant receipt will be emailed &amp; texted to customer.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Charging Card…' : 'Process Charge Now'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 10. Milestone Payment Plan Builder Modal
  if (activeModal === 'payment_plan') {
    const totalNum = Number.parseFloat(planTotal) || 0;
    const split50 = totalNum / 2;
    const split33_1 = totalNum * 0.33;
    const split33_2 = totalNum * 0.33;
    const split33_3 = totalNum * 0.34;

    return (
      <ControlledModal title="📅 Milestone Payment Plan Builder" onClose={onClose} maxWidth="600px">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!planJobId) {
              setError('Please select a job.');
              return;
            }
            if (totalNum <= 0) {
              setError('Please enter a valid job total.');
              return;
            }

            setLoading(true);
            setError(null);

            let milestones: Array<{ label: string; amount: number; kind: string }> = [];
            if (planPreset === '50_50') {
              milestones = [
                { label: '50% Upfront Materials Deposit', amount: split50, kind: 'deposit' },
                { label: '50% Final Balance on Completion', amount: split50, kind: 'final' },
              ];
            } else if (planPreset === '33_33_34') {
              milestones = [
                { label: '33% Initial Project Deposit', amount: split33_1, kind: 'deposit' },
                { label: '33% Rough-In / Midpoint Milestone', amount: split33_2, kind: 'stage' },
                { label: '34% Final Inspection & Sign-off', amount: split33_3, kind: 'final' },
              ];
            }

            const res = await createPaymentPlanScheduleAction(planJobId, milestones);
            setLoading(false);
            if (res.success) {
              onSuccess(res.message || 'Payment plan created.');
              onClose();
            } else {
              setError(res.error || 'Failed to create payment plan.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Automatically generate sequential payment links &amp; scheduled milestones for a contracted project.
          </p>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Select Job <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              aria-label="Select Job"
              value={planJobId}
              onChange={(e) => setPlanJobId(e.target.value)}
              required
              className="input"
              style={{ width: '100%' }}
            >
              <option value="">-- Choose Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} — {j.clientName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Total Contract Amount ($) <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                placeholder="5000.00"
                value={planTotal}
                onChange={(e) => setPlanTotal(e.target.value)}
                required
                className="input"
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Plan Structure Preset
              </label>
              <select
                aria-label="Plan Structure Preset"
                value={planPreset}
                onChange={(e) => setPlanPreset(e.target.value as '50_50' | '33_33_34' | 'custom')}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="50_50">50% Deposit / 50% Final</option>
                <option value="33_33_34">33% Deposit / 33% Mid / 34% Final</option>
              </select>
            </div>
          </div>

          {totalNum > 0 && (
            <div style={{ padding: '0.75rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.5rem' }}>Milestone Breakdown:</div>
              {planPreset === '50_50' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>1. 50% Upfront Materials Deposit</span>
                    <strong>${split50.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>2. 50% Final Balance on Completion</span>
                    <strong>${split50.toFixed(2)}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>1. 33% Initial Project Deposit</span>
                    <strong>${split33_1.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>2. 33% Rough-In / Midpoint Milestone</span>
                    <strong>${split33_2.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>3. 34% Final Inspection &amp; Sign-off</span>
                    <strong>${split33_3.toFixed(2)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Creating Plan…' : 'Generate Milestone Plan'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 11. Dispute Counter-Evidence Dossier Modal
  if (activeModal === 'dispute_evidence') {
    return (
      <ControlledModal title="🛡️ Dispute Defense Evidence Package" onClose={onClose} maxWidth="650px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Compiling evidence dossier…</div>
          ) : evidenceBundle ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', fontSize: '0.85rem' }}>
                ✓ Audit evidence package compiled from job signed agreement, photos, and customer SMS records.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Formatted Evidence Statement (Paste into Stripe Dashboard)
                </label>
                <textarea
                  readOnly
                  rows={10}
                  value={evidenceBundle.summaryText}
                  className="input"
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    navigator.clipboard.writeText(evidenceBundle.summaryText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? '✓ Copied Evidence Statement!' : '📋 Copy Evidence to Clipboard'}
                </button>
                <button type="button" className="btn secondary" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div>Failed to load evidence.</div>
          )}
        </div>
      </ControlledModal>
    );
  }

  // 12. Tax Reserve Vault Modal
  if (activeModal === 'tax_vault') {
    const incomeTaxDollars = grossRevenue * (incomeTaxPct / 100);
    const selfEmpDollars = grossRevenue * (selfEmpPct / 100);
    const totalReserveDollars = incomeTaxDollars + selfEmpDollars;
    const takeHomeProfit = Math.max(0, grossRevenue - totalReserveDollars);

    return (
      <ControlledModal title="🏦 Tax Reserve Vault &amp; Withholding Calculator" onClose={onClose} maxWidth="550px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Automatically calculate and isolate recommended quarterly estimated tax reserves from gross collected revenue.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '1rem', background: 'var(--panel-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Revenue</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${grossRevenue.toFixed(2)}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Recommended Reserve</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                ${totalReserveDollars.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Federal/State Income Tax (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={incomeTaxPct}
                onChange={(e) => setIncomeTaxPct(Number(e.target.value) || 0)}
                className="input"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>= ${incomeTaxDollars.toFixed(2)}</span>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Self-Employment Tax (%)
              </label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={selfEmpPct}
                onChange={(e) => setSelfEmpPct(Number(e.target.value) || 0)}
                className="input"
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>= ${selfEmpDollars.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', fontSize: '0.85rem' }}>
            Safe Take-Home Available Profit: <strong>${takeHomeProfit.toFixed(2)}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 13. Printable Job-Site QR Poster & Walkthrough Slip Modal
  if (activeModal === 'qr_poster') {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://letsgetquoted.com';
    const generalPayUrl = `${origin}/dashboard/payments`;
    return (
      <ControlledModal title="🖨️ Job-Site Payment QR Poster" onClose={onClose} maxWidth="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            id="printable-poster"
            style={{
              padding: '2rem',
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '8px',
              border: '2px dashed #cbd5e1',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#1e293b' }}>⚡ FAST &amp; SECURE PAYMENT</h2>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
              Scan to view invoice, deposit, or complete final project payment
            </p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(generalPayUrl)}`}
              alt="Scan to pay"
              width={220}
              height={220}
              style={{ borderRadius: '8px' }}
            />
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6' }}>
              Accepts Apple Pay · Google Pay · Visa / MC / Amex · Bank Transfer
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Licensed &amp; Insured Contractor · Encrypted 256-Bit SSL Checkout
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => window.print()}
            >
              🖨️ Print Job-Site Flyer
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 14. Multi-Invoice Batch Settlement Modal
  if (activeModal === 'batch_settle') {
    const totalAllocated = batchInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    return (
      <ControlledModal title="🧾 Multi-Invoice Batch Settlement" onClose={onClose} maxWidth="600px">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!batchJobId) {
              setError('Please select a job.');
              return;
            }
            setLoading(true);
            const res = await recordBatchInvoiceSettlementAction(
              batchJobId,
              batchMethod,
              batchInvoices.map((inv) => ({ invoiceId: inv.id, amount: inv.amount, ref: inv.ref })),
            );
            setLoading(false);
            if (res.success) {
              onSuccess(res.message || 'Batch settled successfully.');
              onClose();
            } else {
              setError(res.error || 'Failed to record batch settlement.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Apply a single lump-sum check or wire payment across multiple open invoices for a commercial client.
          </p>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Select Job <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              aria-label="Select Job"
              value={batchJobId}
              onChange={(e) => setBatchJobId(e.target.value)}
              required
              className="input"
              style={{ width: '100%' }}
            >
              <option value="">-- Choose Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} — {j.clientName}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Payment Method
              </label>
              <select
                aria-label="Payment Method"
                value={batchMethod}
                onChange={(e) => setBatchMethod(e.target.value)}
                className="input"
                style={{ width: '100%' }}
              >
                <option value="Check">Check</option>
                <option value="Bank Wire">Bank Wire</option>
                <option value="Cash">Cash</option>
                <option value="Zelle">Zelle</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Total Lump Sum ($)
              </label>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, padding: '0.4rem 0' }}>
                ${totalAllocated.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px', padding: '0.75rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Invoices to Settle:</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {batchInvoices.map((inv, idx) => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>{inv.ref}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={inv.amount}
                    onChange={(e) => {
                      const val = Number.parseFloat(e.target.value) || 0;
                      const updated = [...batchInvoices];
                      updated[idx].amount = val;
                      setBatchInvoices(updated);
                    }}
                    className="input"
                    style={{ width: '110px', padding: '0.2rem 0.4rem', fontSize: '0.82rem', textAlign: 'right' }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Settling Invoices…' : 'Record Lump Settlement'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 15. Client Statement Modal
  if (activeModal === 'client_statement') {
    return (
      <ControlledModal title="📑 Client Account Statement" onClose={onClose} maxWidth="650px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!statementData ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Enter client name or job ref…"
                value={statementClient}
                onChange={(e) => setStatementClient(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn primary"
                disabled={loading || !statementClient.trim()}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  const res = await getClientStatementDataAction(statementClient);
                  setLoading(false);
                  if (res.success && res.data) {
                    setStatementData(res.data);
                  } else {
                    setError(res.error || 'Client not found.');
                  }
                }}
              >
                {loading ? 'Searching…' : 'Generate Statement'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.5rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Statement for {statementClient}</h3>
                  <small style={{ color: 'var(--text-muted)' }}>{statementData.jobs.length} jobs found</small>
                </div>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => setStatementData(null)}
                >
                  Change Client
                </button>
              </div>

              {/* Invoices */}
              <div>
                <strong style={{ fontSize: '0.88rem' }}>Invoices Billed</strong>
                <div style={{ marginTop: '0.4rem', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))' }}>
                      <tr>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Ref</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.invoices.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '0.6rem', textAlign: 'center' }}>No invoices billed.</td></tr>
                      ) : (
                        statementData.invoices.map((inv) => (
                          <tr key={inv.id} style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                            <td style={{ padding: '0.4rem 0.6rem' }}>{inv.ref}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textTransform: 'capitalize' }}>{inv.status}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>${Number(inv.total || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments */}
              <div>
                <strong style={{ fontSize: '0.88rem' }}>Payments Settled</strong>
                <div style={{ marginTop: '0.4rem', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))' }}>
                      <tr>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.payments.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: '0.6rem', textAlign: 'center' }}>No payments recorded.</td></tr>
                      ) : (
                        statementData.payments.map((p) => (
                          <tr key={p.id} style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                            <td style={{ padding: '0.4rem 0.6rem' }}>{p.label}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textTransform: 'capitalize' }}>{p.status}</td>
                            <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>${Number(p.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => window.print()}
                >
                  🖨️ Print Statement
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 16. Payment Detail Drawer
  if (activeModal === 'payment_detail' && selectedPayment) {
    return (
      <ControlledModal title={`Payment Details · ${selectedPayment.label}`} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '0.85rem', background: 'var(--panel-subtle, rgba(0,0,0,0.03))', borderRadius: '6px' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Amount</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>${selectedPayment.amount.toFixed(2)}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Received</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary, #10b981)' }}>
                ${selectedPayment.netAmount.toFixed(2)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Platform Fee</span>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>${selectedPayment.platformFee.toFixed(2)}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Status</span>
              <div>
                <span className={`status-pill status-${selectedPayment.status}`} style={{ textTransform: 'capitalize' }}>
                  {selectedPayment.status}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Customer</span>
              <strong>{selectedPayment.clientName}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Job Reference</span>
              <strong>{selectedPayment.jobRef}</strong>
            </div>
            {selectedPayment.invoiceRef && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Invoice</span>
                <strong>{selectedPayment.invoiceRef}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Method</span>
              <strong>{selectedPayment.paymentMethod}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date &amp; Time</span>
              <span>{selectedPayment.paidAt ? new Date(selectedPayment.paidAt).toLocaleString() : new Date(selectedPayment.requestedAt).toLocaleString()}</span>
            </div>
            {selectedPayment.refundedAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.4rem', color: '#ef4444' }}>
                <span>Refunded Total</span>
                <strong>-${selectedPayment.refundedAmount.toFixed(2)}</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            {selectedPayment.status === 'paid' && (
              <button
                type="button"
                className="btn primary"
                style={{ fontSize: '0.84rem' }}
                onClick={() => onOpenModal('payment_receipt', selectedPayment)}
              >
                🧾 View Receipt
              </button>
            )}
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 17. Official Contractor Payment Receipt Modal
  if (activeModal === 'payment_receipt' && selectedPayment) {
    const receiptNum = `RCP-${selectedPayment.id.slice(0, 8).toUpperCase()}`;
    const paidDate = selectedPayment.paidAt
      ? new Date(selectedPayment.paidAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date(selectedPayment.requestedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.letsgetquoted.com';
    const receiptUrl = `${origin}/pay/${selectedPayment.id}`;

    return (
      <ControlledModal title="Official Payment Receipt" onClose={onClose} maxWidth="560px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Printable Receipt Card */}
          <div
            id="printable-payment-receipt"
            style={{
              padding: '1.5rem',
              background: '#ffffff',
              color: '#0f172a',
              borderRadius: '10px',
              border: '2px solid #e2e8f0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Watermark PAID Seal */}
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                border: '3px solid #10b981',
                color: '#059669',
                borderRadius: '8px',
                padding: '0.25rem 0.75rem',
                fontWeight: 800,
                fontSize: '0.92rem',
                letterSpacing: '0.08em',
                transform: 'rotate(-4deg)',
                background: 'rgba(16, 185, 129, 0.08)',
              }}
            >
              ✓ PAID IN FULL
            </div>

            {/* Business & Receipt Header */}
            <div style={{ borderBottom: '2px dashed #cbd5e1', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
                Official Contractor Payment Receipt
              </span>
              <h2 style={{ margin: '0.2rem 0', fontSize: '1.25rem', fontWeight: 700 }}>{selectedPayment.label}</h2>
              <div style={{ fontSize: '0.8rem', color: '#475569', display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                <span>Receipt: <strong>{receiptNum}</strong></span>
                <span>Date: {paidDate}</span>
              </div>
            </div>

            {/* Customer & Job Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem', fontSize: '0.86rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Billed To</span>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '0.15rem' }}>{selectedPayment.clientName}</div>
                <div style={{ color: '#475569', fontSize: '0.8rem' }}>Job Ref: {selectedPayment.jobRef}</div>
                {selectedPayment.invoiceRef && <div style={{ color: '#475569', fontSize: '0.8rem' }}>Invoice #{selectedPayment.invoiceRef}</div>}
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>Payment Method</span>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '0.15rem' }}>{selectedPayment.paymentMethod}</div>
                <div style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>Status: Settled &amp; Reconciled</div>
                {selectedPayment.cardLast4 && <div style={{ color: '#475569', fontSize: '0.8rem' }}>Card: **** {selectedPayment.cardLast4}</div>}
              </div>
            </div>

            {/* Line Items & Total */}
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.85rem 1rem', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem', paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                <span>{selectedPayment.label}</span>
                <span style={{ fontWeight: 600 }}>${selectedPayment.amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem' }}>
                <strong style={{ fontSize: '0.95rem' }}>Total Amount Paid:</strong>
                <strong style={{ fontSize: '1.35rem', color: '#059669' }}>${selectedPayment.amount.toFixed(2)}</strong>
              </div>
            </div>

            <div style={{ marginTop: '0.85rem', fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
              Transaction ID: {selectedPayment.id} · Verification Hash: {selectedPayment.id.slice(-10)}
            </div>
          </div>

          {/* Quick Action Tools */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '0.84rem' }}
                onClick={() => {
                  navigator.clipboard.writeText(receiptUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }}
              >
                {copied ? '✓ Link Copied' : '🔗 Copy Link'}
              </button>
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: '0.84rem' }}
                onClick={() => {
                  const form = new FormData();
                  form.set('paymentId', selectedPayment.id);
                  form.set('channel', 'sms');
                  sendPaymentReminderAction(form).then((res) => {
                    if (res.success) onSuccess('Receipt dispatched via SMS.');
                    else alert(res.error || 'Failed to dispatch SMS receipt.');
                  });
                }}
              >
                📱 SMS Receipt
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn primary"
                style={{ fontSize: '0.84rem' }}
                onClick={() => window.print()}
              >
                🖨️ Print / PDF
              </button>
              <button type="button" className="btn secondary" style={{ fontSize: '0.84rem' }} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 18. Field Collection Mode (Touch-First Jobsite Terminal with Smart Cash Calculator)
  if (activeModal === 'field_collect') {
    const numericDue = Number.parseFloat(fieldAmount) || 0;
    const numericTendered = Number.parseFloat(cashTendered) || 0;
    const changeDue = numericTendered >= numericDue ? Math.round((numericTendered - numericDue) * 100) / 100 : 0;
    const shortfall = numericDue > numericTendered ? Math.round((numericDue - numericTendered) * 100) / 100 : 0;

    return (
      <ControlledModal title="📲 Jobsite Field Collection Mode" onClose={onClose} maxWidth="580px">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!fieldJobId) {
              setError('Please select a job.');
              return;
            }
            if (numericDue <= 0) {
              setError('Please enter a valid amount.');
              return;
            }
            if (fieldMethod === 'Cash' && numericTendered < numericDue) {
              setError(`Cash tendered ($${numericTendered.toFixed(2)}) is less than amount due ($${numericDue.toFixed(2)}).`);
              return;
            }

            setError(null);
            setLoading(true);
            const formData = new FormData();
            formData.set('jobId', fieldJobId);
            formData.set('amount', String(numericDue));
            formData.set('method', fieldMethod);
            formData.set('label', `Jobsite ${fieldMethod} Payment`);
            formData.set('kind', 'final');
            const noteContent = fieldMethod === 'Cash'
              ? `Tendered: $${numericTendered.toFixed(2)}, Change: $${changeDue.toFixed(2)}${fieldNote ? ` - ${fieldNote}` : ''}`
              : fieldMethod === 'Check'
                ? `Check #${checkNumber || 'N/A'}${fieldNote ? ` - ${fieldNote}` : ''}`
                : fieldNote;
            formData.set('note', noteContent);

            const res = await recordManualPaymentAction(formData);
            setLoading(false);
            if (res.success) {
              onSuccess(`✓ Recorded ${fieldMethod} payment of $${numericDue.toFixed(2)}.`);
              onClose();
            } else {
              setError(res.error || 'Failed to record payment.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}
        >
          {/* Step 1: Pick Job & Amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.75rem' }}>
            <div>
              <label htmlFor="field-job-select" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Customer &amp; Job *
              </label>
              <select
                id="field-job-select"
                aria-label="Customer and Job"
                required
                value={fieldJobId}
                onChange={(e) => setFieldJobId(e.target.value)}
                className="input"
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.5rem' }}
              >
                <option value="">-- Choose Job --</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.clientName} ({j.ref})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Amount Due ($) *
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                required
                placeholder="0.00"
                value={fieldAmount}
                onChange={(e) => {
                  setFieldAmount(e.target.value);
                  if (fieldMethod === 'Cash' && !cashTendered) {
                    setCashTendered(e.target.value);
                  }
                }}
                className="input"
                style={{ width: '100%', fontSize: '1.05rem', fontWeight: 700, padding: '0.45rem 0.6rem' }}
              />
            </div>
          </div>

          {/* Step 2: Payment Method Touch Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Collection Method
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {(['Cash', 'Check', 'Card Tap', 'Zelle'] as const).map((m) => {
                const isSelected = fieldMethod === m;
                const icon = m === 'Cash' ? '💵' : m === 'Check' ? '📜' : m === 'Card Tap' ? '💳' : '📱';
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setFieldMethod(m);
                      if (m === 'Cash' && !cashTendered && fieldAmount) {
                        setCashTendered(fieldAmount);
                      }
                    }}
                    style={{
                      padding: '0.75rem 0.4rem',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border-subtle, #e2e8f0)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--panel-subtle, rgba(0,0,0,0.02))',
                      color: isSelected ? 'var(--primary, #3b82f6)' : 'inherit',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '1.4rem' }}>{icon}</span>
                    <span style={{ fontSize: '0.82rem' }}>{m}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Method Specific Inputs */}
          {fieldMethod === 'Cash' && (
            <div
              style={{
                padding: '1rem',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06) 0%, rgba(59, 130, 246, 0.06) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>💵 Cash Tendered by Customer</span>
                {/* Quick Add Buttons */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => setCashTendered(String(numericDue))}
                  >
                    Exact
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => setCashTendered(String(Math.ceil(numericDue / 20) * 20))}
                  >
                    +$20s
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }}
                    onClick={() => setCashTendered(String(Math.ceil(numericDue / 100) * 100))}
                  >
                    +$100s
                  </button>
                </div>
              </div>

              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount given by client"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                className="input"
                style={{ width: '100%', fontSize: '1.2rem', fontWeight: 700, padding: '0.5rem 0.75rem' }}
              />

              {/* Change Due Display */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  background: numericTendered >= numericDue ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '6px',
                  border: `1px solid ${numericTendered >= numericDue ? '#10b981' : '#ef4444'}`,
                }}
              >
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                  {numericTendered >= numericDue ? '💰 Change Due to Customer:' : '⚠️ Shortfall:'}
                </span>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: numericTendered >= numericDue ? '#059669' : '#dc2626' }}>
                  {numericTendered >= numericDue ? `$${changeDue.toFixed(2)}` : `-$${shortfall.toFixed(2)}`}
                </span>
              </div>
            </div>
          )}

          {fieldMethod === 'Check' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Check Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4821"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  className="input"
                  style={{ width: '100%', fontSize: '0.9rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Bank / Issuer (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chase Bank"
                  value={fieldNote}
                  onChange={(e) => setFieldNote(e.target.value)}
                  className="input"
                  style={{ width: '100%', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          )}

          {fieldMethod === 'Card Tap' && (
            <div style={{ padding: '0.85rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.86rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600, color: '#2563eb' }}>
                <span>💳</span> Mobile Card Reader / Phone Tap
              </div>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Collect via on-screen QR code or physical Bluetooth reader. Once authorized, click Record Payment to settle the job ledger.
              </p>
            </div>
          )}

          {fieldMethod === 'Zelle' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Zelle Confirmation Code / Note
              </label>
              <input
                type="text"
                placeholder="e.g. Conf #882910"
                value={fieldNote}
                onChange={(e) => setFieldNote(e.target.value)}
                className="input"
                style={{ width: '100%', fontSize: '0.9rem' }}
              />
            </div>
          )}

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading} style={{ fontWeight: 700, padding: '0.6rem 1.4rem' }}>
              {loading ? 'Recording…' : '✓ Settle & Complete Payment'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 19. Promise-to-Pay Logger Modal
  if (activeModal === 'promise_to_pay') {
    return (
      <ControlledModal title="📅 Record Promise to Pay" onClose={onClose} maxWidth="480px">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedPayment) return;
            setError(null);
            setLoading(true);

            const form = new FormData();
            form.set('paymentId', selectedPayment.id);
            form.set('promisedDate', promiseDate);
            form.set('note', promiseNote);

            const res = await recordPromiseToPayAction(form);
            setLoading(false);
            if (res.success) {
              onSuccess(res.message || 'Promise to pay recorded.');
              onClose();
            } else {
              setError(res.error || 'Failed to record promise.');
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {selectedPayment && (
            <div style={{ padding: '0.75rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)', fontSize: '0.86rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                <strong>{selectedPayment.clientName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Amount Outstanding:</span>
                <strong style={{ color: '#ef4444' }}>${selectedPayment.amount.toFixed(2)}</strong>
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Promised Payment Date *
            </label>
            <input
              type="date"
              required
              value={promiseDate}
              onChange={(e) => setPromiseDate(e.target.value)}
              className="input"
              style={{ width: '100%', fontSize: '0.9rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
              Collection Note / Customer Commitment
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Homeowner confirmed they will wire balance after closing on Friday."
              value={promiseNote}
              onChange={(e) => setPromiseNote(e.target.value)}
              className="input"
              style={{ width: '100%', fontSize: '0.85rem' }}
            />
          </div>

          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? 'Saving…' : 'Save Commitment'}
            </button>
          </div>
        </form>
      </ControlledModal>
    );
  }

  // 20. Credit Card Surcharge & Fee Strategy Lab Modal
  if (activeModal === 'surcharge_lab') {
    const vol = Number.parseFloat(surchargeVolume) || 25000;
    const stripeCost = Math.round((vol * 0.029 + (vol / 1500) * 0.30) * 100) / 100;
    const surchargeCollected = Math.round(vol * (surchargePct / 100) * 100) / 100;
    const annualRecovery = Math.round(Math.min(stripeCost, surchargeCollected) * 12);

    return (
      <ControlledModal title="⚖️ Credit Card Surcharge & Fee Strategy Lab" onClose={onClose} maxWidth="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0 }}>
            Optimize your processing fee policy. Passing credit card fees or offering prompt cash discounts protects your operating margins on high-ticket trades.
          </p>

          {/* Interactive Volume & Surcharge Sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Monthly Credit Card Volume: ${vol.toLocaleString()}
              </label>
              <input
                type="range"
                min="5000"
                max="150000"
                step="5000"
                value={surchargeVolume}
                onChange={(e) => setSurchargeVolume(e.target.value)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>
                Card Surcharge Rate: {surchargePct.toFixed(1)}%
              </label>
              <input
                type="range"
                min="1.0"
                max="3.5"
                step="0.1"
                value={surchargePct}
                onChange={(e) => setSurchargePct(Number.parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Profit Recovery KPI Showcase */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Current Processing Cost</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626', marginTop: '0.2rem' }}>
                ${stripeCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Surcharge Recovered</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2563eb', marginTop: '0.2rem' }}>
                +${surchargeCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#059669', fontWeight: 700 }}>Annual Profit Recovered</span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>
                +${annualRecovery.toLocaleString('en-US', { minimumFractionDigits: 0 })}/yr
              </div>
            </div>
          </div>

          {/* 50-State Legal & Compliance Checklist */}
          <div style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', fontSize: '0.82rem' }}>
            <strong style={{ display: 'block', marginBottom: '0.4rem' }}>📋 State Surcharge Compliance Rules</strong>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-muted)' }}>
              <li><strong>Permitted in 48+ States:</strong> Card surcharging is compliant nationwide provided rates do not exceed actual card acceptance costs (capped at 3.0%).</li>
              <li><strong>Debit Card Exclusion:</strong> Surcharges cannot legally apply to debit or prepaid cards.</li>
              <li><strong>Clear Customer Disclosure:</strong> Let’s Get Quoted automatically displays clear itemized fee disclosure before checkout.</li>
            </ul>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onSuccess(`Applied ${surchargePct.toFixed(1)}% credit card surcharge policy.`);
                onClose();
              }}
            >
              Apply Policy to Checkout
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 17. Notice of Intent to Lien (NOI) Legal Generator
  if (activeModal === 'noi_generator') {
    return (
      <ControlledModal title="Notice of Intent to Lien (NOI) Generator" onClose={onClose} maxWidth="640px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
            <div>
              <strong style={{ fontSize: '0.92rem', color: '#991b1b' }}>Statutory Pre-Lien Notice Generator</strong>
              <div style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                Protects contractor mechanic’s lien rights by serving a formal 10-day notice before county recording.
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Compiling statutory notice document...</div>
          ) : noiData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.84rem' }}>
                <div style={{ padding: '0.65rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block' }}>Property Owner</span>
                  <strong>{noiData.propertyOwner}</strong>
                </div>
                <div style={{ padding: '0.65rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block' }}>Unpaid Amount Due</span>
                  <strong style={{ color: '#dc2626', fontSize: '1rem' }}>{noiData.amountFormatted}</strong>
                </div>
                <div style={{ gridColumn: 'span 2', padding: '0.65rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block' }}>Jobsite Real Property Address</span>
                  <span>{noiData.propertyAddress}</span>
                </div>
                <div style={{ padding: '0.65rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                  <span style={{ color: '#92400e', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Notice Date</span>
                  <strong>{noiData.noticeDate}</strong>
                </div>
                <div style={{ padding: '0.65rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  <span style={{ color: '#991b1b', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>10-Day Cure Deadline</span>
                  <strong style={{ color: '#dc2626' }}>{noiData.cureDeadlineDate}</strong>
                </div>
              </div>

              {/* Legal Notice Document Preview */}
              <div style={{ border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '1rem', background: '#fff', maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', lineHeight: '1.5', fontFamily: 'serif' }}>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.88rem', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.4rem' }}>
                  {noiData.documentTitle}
                </div>
                <div style={{ whiteSpace: 'pre-line', color: '#1e293b' }}>
                  {noiData.legalAdvisementText}
                </div>
              </div>

              {/* Certified Mail USPS Tracker */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="USPS Certified Mail Tracking # (e.g. 7020 0640 0001 ...)"
                  value={noiTrackingNumber}
                  onChange={(e) => setNoiTrackingNumber(e.target.value)}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.82rem', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: '0.82rem' }}
                  onClick={() => {
                    if (!noiTrackingNumber) {
                      alert('Please enter a tracking number.');
                      return;
                    }
                    onSuccess(`Logged USPS Certified Mail Tracking #${noiTrackingNumber}`);
                  }}
                >
                  Log Tracking
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.84rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(noiData.legalAdvisementText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? '✓ Copied' : '📋 Copy Legal Text'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: '0.84rem' }}
                    onClick={() => window.print()}
                  >
                    🖨️ Print Legal Notice
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button type="button" className="btn secondary" onClick={onClose} style={{ fontSize: '0.84rem' }}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ fontSize: '0.84rem', background: '#dc2626', borderColor: '#dc2626' }}
                    onClick={() => {
                      if (selectedPayment) {
                        const form = new FormData();
                        form.set('paymentId', selectedPayment.id);
                        form.set('channel', 'sms');
                        sendPaymentReminderAction(form).then((res) => {
                          if (res.success) onSuccess('Statutory NOI notice dispatched via SMS & registered.');
                          else alert(res.error || 'Failed to dispatch notice.');
                          onClose();
                        });
                      }
                    }}
                  >
                    📱 Serve Notice via SMS
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Select an overdue payment to generate a Notice of Intent.</div>
          )}
        </div>
      </ControlledModal>
    );
  }

  // 18. Automated Dunning & Escalation Rules Engine
  if (activeModal === 'dunning_rules') {
    return (
      <ControlledModal title="Automated Dunning & Escalation Engine" onClose={onClose} maxWidth="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: dunningActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(100, 116, 139, 0.08)', borderRadius: '8px', border: dunningActive ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-subtle, #e2e8f0)' }}>
            <div>
              <strong style={{ fontSize: '0.95rem', color: dunningActive ? '#059669' : 'inherit' }}>
                {dunningActive ? '● Automated Dunning Active' : '○ Dunning Automation Paused'}
              </strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Automatically escalates reminders across 4 stages as invoices age
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.82rem' }}
              onClick={() => setDunningActive(!dunningActive)}
            >
              {dunningActive ? 'Pause Engine' : 'Activate Engine'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Stage 1 */}
            <div style={{ padding: '0.85rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>1</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem' }}>Day {dunning1Days}: Friendly SMS Check-in</strong>
                  <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>SMS + 1-Tap Pay Link</span>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Sends polite check-in with direct Apple Pay/Google Pay mobile checkout link.
                </p>
              </div>
            </div>

            {/* Stage 2 */}
            <div style={{ padding: '0.85rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}>2</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem' }}>Day {dunning2Days}: Prompt Pay Incentive Email</strong>
                  <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>Email + PDF Statement</span>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Sends itemized statement highlighting 2% prompt-pay discount if paid in 48 hours.
                </p>
              </div>
            </div>

            {/* Stage 3 */}
            <div style={{ padding: '0.85rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' }}>3</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem' }}>Day {dunning3Days}: Urgent Alert &amp; Office Callback</strong>
                  <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>SMS + Office Queue</span>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Urgent SMS alert and automatically schedules an office staff callback task.
                </p>
              </div>
            </div>

            {/* Stage 4 */}
            <div style={{ padding: '0.85rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-subtle, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(153, 27, 27, 0.1)', color: '#991b1b' }}>4</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.88rem' }}>Day {dunning4Days}: Formal Demand &amp; Late Fee</strong>
                  <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>Demand Notice + 1.5% Fee</span>
                </div>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Formal legal demand notice and applies standard 1.5% monthly late fee to balance.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '0.85rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const form = new FormData();
                form.set('enabled', dunningActive ? '1' : '0');
                saveDunningRulesAction(form).then((res) => {
                  if (res.success) onSuccess('Dunning auto-escalation engine configuration saved.');
                  else alert(res.error || 'Failed to save dunning rules.');
                  onClose();
                });
              }}
            >
              Save Dunning Rules
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 19. QuickBooks & Xero Accounting Sync Hub
  if (activeModal === 'accounting_sync') {
    return (
      <ControlledModal title="QuickBooks & Xero Accounting Sync Hub" onClose={onClose} maxWidth="640px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <div>
              <strong style={{ fontSize: '0.95rem' }}>Double-Entry General Ledger Sync</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Balances Gross Revenue, Stripe processing fees, and bank cash deposits without reconciliation drift.
              </div>
            </div>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#10b981', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              ✓ Balanced Debits = Credits
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`tab ${accountingPlatform === 'qbo' ? 'active' : ''}`}
              style={{ flex: 1, padding: '0.6rem', textAlign: 'center' }}
              onClick={() => setAccountingPlatform('qbo')}
            >
              📗 QuickBooks Online (QBO)
            </button>
            <button
              type="button"
              className={`tab ${accountingPlatform === 'xero' ? 'active' : ''}`}
              style={{ flex: 1, padding: '0.6rem', textAlign: 'center' }}
              onClick={() => setAccountingPlatform('xero')}
            >
              🔵 Xero Accounting
            </button>
          </div>

          {/* Chart of Accounts Mapping Preview */}
          <div style={{ border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', overflow: 'hidden', fontSize: '0.82rem' }}>
            <div style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.03))', padding: '0.5rem 0.75rem', fontWeight: 600, borderBottom: '1px solid var(--border-subtle, #e2e8f0)' }}>
              Standard Account Mapping Matrix
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.01))', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.4rem 0.75rem' }}>Account</th>
                  <th style={{ padding: '0.4rem 0.75rem' }}>Type</th>
                  <th style={{ padding: '0.4rem 0.75rem' }}>Debit / Credit</th>
                  <th style={{ padding: '0.4rem 0.75rem' }}>Mapping Purpose</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}><strong>4000</strong> - Contracting Revenue</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>Income</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#059669', fontWeight: 600 }}>Credit</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>100% Gross Contract Amount</td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}><strong>6100</strong> - Merchant Fees</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>Expense</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#dc2626', fontWeight: 600 }}>Debit</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>Stripe / Card / ACH Processing Fees</td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--border-subtle, #e2e8f0)' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}><strong>1000</strong> - Cash Clearing</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>Asset</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: '#2563eb', fontWeight: 600 }}>Debit</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>Net Cash Settled into Bank</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '0.85rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Generates compliant journal entries ready for direct import
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  generateAccountingJournalCsvAction(accountingPlatform).then((res) => {
                    if (res.success && res.data) {
                      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', `journal-entries-${accountingPlatform}-${new Date().toISOString().slice(0, 10)}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      onSuccess(`Exported general ledger journal CSV for ${accountingPlatform.toUpperCase()}.`);
                      onClose();
                    } else {
                      alert(res.error || 'Failed to export accounting journal.');
                    }
                  });
                }}
              >
                📥 Download {accountingPlatform === 'qbo' ? 'QuickBooks QBO' : 'Xero'} CSV
              </button>
            </div>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 20. Card-on-File Milestone Pre-Authorization
  if (activeModal === 'card_on_file_auth') {
    const selectedJob = jobs.find((j) => j.id === authJobId) || jobs[0];
    const totalAmt = Number.parseFloat(authContractTotal) || 15000;

    const percentages = authMilestonePlan === '40_30_30' ? [40, 30, 30] : authMilestonePlan === '50_50' ? [50, 50] : [33, 33, 34];
    const names = authMilestonePlan === '40_30_30'
      ? ['Deposit (Materials)', 'Rough-in Approval', 'Final Sign-off']
      : authMilestonePlan === '50_50'
      ? ['Initial Deposit', 'Completion Sign-off']
      : ['Milestone 1', 'Milestone 2', 'Final Milestone'];

    const allocations = allocateMilestoneCents(totalAmt, percentages);
    const stages = allocations.map((al, idx) => ({
      name: names[idx],
      pct: al.percentage,
      amt: al.dollars,
    }));

    return (
      <ControlledModal title="Card-on-File Milestone Pre-Authorization" onClose={onClose} maxWidth="600px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.06)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <strong style={{ fontSize: '0.95rem' }}>Automated Progress Draw Agreement</strong>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Authorize client credit card or bank debit on file to automatically settle progress draws as project milestones are certified.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.85rem' }}>
            <div>
              <label htmlFor="auth-job-select" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Select Project</label>
              <select
                id="auth-job-select"
                aria-label="Select Project"
                value={authJobId || (selectedJob?.id ?? '')}
                onChange={(e) => setAuthJobId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px' }}
              >
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.ref} - {j.clientName}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem' }}>Contract Value ($)</label>
              <input
                type="number"
                value={authContractTotal}
                onChange={(e) => setAuthContractTotal(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px' }}
              />
            </div>
          </div>

          {/* Draw Schedule Breakdown */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>Authorized Draw Schedule</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <button
                type="button"
                className={`tab ${authMilestonePlan === '40_30_30' ? 'active' : ''}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                onClick={() => setAuthMilestonePlan('40_30_30')}
              >
                40% / 30% / 30%
              </button>
              <button
                type="button"
                className={`tab ${authMilestonePlan === '50_50' ? 'active' : ''}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                onClick={() => setAuthMilestonePlan('50_50')}
              >
                50% / 50%
              </button>
              <button
                type="button"
                className={`tab ${authMilestonePlan === '33_33_34' ? 'active' : ''}`}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                onClick={() => setAuthMilestonePlan('33_33_34')}
              >
                33% / 33% / 34%
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {stages.map((st, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--panel-subtle, rgba(0,0,0,0.02))', borderRadius: '6px', border: '1px solid var(--border-subtle, #e2e8f0)', fontSize: '0.84rem' }}>
                  <span>{st.name} ({st.pct}%)</span>
                  <strong>${st.amt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '0.85rem' }}>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.84rem' }}
              onClick={() => {
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                navigator.clipboard.writeText(`${origin}/pay/pre-auth?jobId=${selectedJob?.id || 'job'}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? '✓ Link Copied' : '🔗 Copy Pre-Auth Link'}
            </button>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn secondary" onClick={onClose} style={{ fontSize: '0.84rem' }}>
                Close
              </button>
              <button
                type="button"
                className="btn primary"
                style={{ fontSize: '0.84rem' }}
                onClick={() => {
                  onSuccess(`Pre-Authorization Agreement dispatched to ${selectedJob?.clientName || 'customer'}.`);
                  onClose();
                }}
              >
                📱 Send Agreement to Client
              </button>
            </div>
          </div>
        </div>
      </ControlledModal>
    );
  }

  // 21. Expected Cash Flow Draw Calendar
  if (activeModal === 'draw_calendar') {
    const calendarEvents = [
      { id: '1', title: 'Marcus Vance - Deposit Draw', date: 'In 2 Days', amount: 5800, type: 'milestone', confidence: 'High' },
      { id: '2', title: 'Sarah Jenkins - Rough-in Draw', date: 'In 5 Days', amount: 4350, type: 'milestone', confidence: 'High' },
      { id: '3', title: 'Oakland Plaza - Final Net-30', date: 'In 11 Days', amount: 12400, type: 'final', confidence: 'Medium' },
      { id: '4', title: 'Robert Henderson - Overdue Followup', date: 'Past Due', amount: 6850, type: 'overdue', confidence: 'Action Required' },
      { id: '5', title: 'Apex Industrial - Progress Draw #2', date: 'In 18 Days', amount: 8900, type: 'milestone', confidence: 'Medium' },
    ];

    const totalExpected = calendarEvents.reduce((sum, e) => sum + e.amount, 0);

    return (
      <ControlledModal title="Expected Cash Flow Draw Calendar" onClose={onClose} maxWidth="640px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <div>
              <strong style={{ fontSize: '0.95rem' }}>30-Day Draw Horizon</strong>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Chronological timeline of scheduled milestone draws and maturing invoices
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block' }}>Expected Inflow</span>
              <strong style={{ fontSize: '1.25rem', color: '#059669' }}>+${totalExpected.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          {/* Timeline Events List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {calendarEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  background: evt.type === 'overdue' ? 'rgba(239, 68, 68, 0.04)' : 'var(--panel-subtle, rgba(0,0,0,0.02))',
                  borderRadius: '8px',
                  border: evt.type === 'overdue' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border-subtle, #e2e8f0)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{evt.title}</strong>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '999px',
                        background: evt.type === 'overdue' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        color: evt.type === 'overdue' ? '#dc2626' : '#059669',
                        fontWeight: 600,
                      }}
                    >
                      {evt.date}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Confidence: <strong>{evt.confidence}</strong>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                    ${evt.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-subtle, #e2e8f0)', paddingTop: '0.85rem' }}>
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </ControlledModal>
    );
  }

  return null;
}
