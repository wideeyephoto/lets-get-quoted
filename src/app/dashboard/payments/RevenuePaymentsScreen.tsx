'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { PaymentLedgerItem, PaymentsLedgerSummary } from '@/lib/payments-ledger-data';
import type { ReceivableItem, ReceivablesSummary } from '@/lib/receivables-data';
import type { PayoutsAccountOverview } from '@/lib/payouts-data';
import type { RevenueAnalyticsData } from '@/lib/revenue-analytics-data';
import PaymentsLedgerTable from './PaymentsLedgerTable';
import ReceivablesAgingBoard from './ReceivablesAgingBoard';
import FailedPaymentsRecoveryPanel from './FailedPaymentsRecoveryPanel';
import PayoutsTransfersPanel from './PayoutsTransfersPanel';
import RevenueAnalyticsPanel from './RevenueAnalyticsPanel';
import DisputesDefensePanel from './DisputesDefensePanel';
import PaymentModals, { type ModalType } from './PaymentModals';

interface Props {
  initialPayments: PaymentLedgerItem[];
  ledgerSummary: PaymentsLedgerSummary;
  receivables: ReceivableItem[];
  receivablesSummary: ReceivablesSummary;
  payouts: PayoutsAccountOverview;
  analytics: RevenueAnalyticsData;
  jobs: Array<{ id: string; ref: string; clientName: string }>;
  selectedRange: string;
}

const TABS = [
  { key: 'ledger', label: 'Payments Ledger', icon: '📊' },
  { key: 'receivables', label: 'Aging Receivables', icon: '⏳' },
  { key: 'recovery', label: 'Failed Recovery', icon: '🔄' },
  { key: 'payouts', label: 'Bank Payouts', icon: '🏦' },
  { key: 'analytics', label: 'Revenue Analytics', icon: '📈' },
  { key: 'disputes', label: 'Disputes Defense', icon: '🛡️' },
];

const RANGE_TABS = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
];

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenuePaymentsScreen({
  initialPayments,
  ledgerSummary,
  receivables,
  receivablesSummary,
  payouts,
  analytics,
  jobs,
  selectedRange,
}: Props) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentLedgerItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Monthly Revenue Goal Pacing State
  const [monthlyGoal, setMonthlyGoal] = useState(35000);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('35000');

  // Sync hash routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace(/^#/, '');
      if (['ledger', 'receivables', 'recovery', 'payouts', 'analytics', 'disputes'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  function handleTabSelect(key: string) {
    setActiveTab(key);
    window.history.replaceState(null, '', `#${key}`);
  }

  function handleShowToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }

  const failedPayments = initialPayments.filter((p) => p.status === 'failed');
  const disputedPayments = initialPayments.filter((p) => p.status === 'disputed' || Boolean(p.disputedAt));

  // Revenue pacing calculations
  const goalProgressPct = Math.min(100, Math.round((ledgerSummary.grossRevenue / Math.max(1, monthlyGoal)) * 100));

  return (
    <main className="wide-shell workspace-shell">
      {/* Toast alert with smooth entrance */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#10b981',
            color: '#ffffff',
            padding: '0.85rem 1.25rem',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.9rem',
            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <span>✓</span> {toastMessage}
        </div>
      )}

      {/* Clean Streamlined Header with Live Engine Heartbeat */}
      <header className="inbox-header" style={{ marginBottom: '1.25rem' }}>
        <div className="inbox-header-copy">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.4rem' }}>💰</span>
            <h1 className="workspace-title" style={{ margin: 0 }}>Revenue &amp; Payments</h1>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.15rem 0.55rem',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.1)',
                color: 'var(--good, #047857)',
                fontSize: '0.72rem',
                fontWeight: 600,
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '999px',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }}
              />
              Live Settlement Engine Active
            </div>
          </div>
          <p className="workspace-lead" style={{ marginTop: '0.25rem' }}>
            Cash operations, online &amp; offline collections, aging receivables, and bank transfers.
          </p>
        </div>

        {/* Streamlined Primary & Secondary Action Hub */}
        <div className="inbox-header-tools" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn primary"
            style={{ fontWeight: 600, padding: '0.55rem 1.1rem', fontSize: '0.92rem' }}
            onClick={() => {
              setSelectedPayment(null);
              setActiveModal('collect_chooser');
            }}
          >
            + Collect Payment
          </button>

          <button
            type="button"
            className="btn secondary"
            style={{ fontWeight: 600, fontSize: '0.88rem' }}
            onClick={() => {
              setSelectedPayment(null);
              setActiveModal('field_collect');
            }}
            title="Open Touch-First Jobsite Field Terminal"
          >
            📲 Field Mode
          </button>

          <button
            type="button"
            className="btn secondary"
            style={{ fontWeight: 500 }}
            onClick={() => {
              setSelectedPayment(null);
              setActiveModal('tools_menu');
            }}
          >
            ⚙️ Financial Tools ▾
          </button>

          <a
            href="/api/export/tax?type=pl"
            className="btn secondary"
            title="Download CSV report"
          >
            📥 Export CSV
          </a>

          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.25rem' }}>
            <Link className="btn secondary" href="/dashboard/cash-flow" style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}>
              📈 Cash Flow
            </Link>
            <Link className="btn secondary" href="/dashboard/expenses" style={{ fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}>
              💳 Expenses
            </Link>
          </div>
        </div>
      </header>

      {/* Clean 4-Column Balanced KPI Ribbon */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* 1. Gross Revenue with Goal Pacing */}
        <article
          className="workspace-metric-card accent"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.1rem 1.25rem',
            background: 'var(--bg-2)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-soft)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="workspace-metric-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                Gross Revenue
              </span>
              {editingGoal ? (
                <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    className="input"
                    style={{ width: '75px', padding: '0.1rem 0.3rem', fontSize: '0.74rem' }}
                  />
                  <button
                    type="button"
                    className="btn primary"
                    style={{ padding: '0.1rem 0.35rem', fontSize: '0.72rem' }}
                    onClick={() => {
                      const num = Number.parseFloat(goalInput);
                      if (Number.isFinite(num) && num > 0) setMonthlyGoal(num);
                      setEditingGoal(false);
                    }}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingGoal(true)}
                  style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                  title="Edit monthly goal"
                >
                  🎯 {goalProgressPct}% of {formatUsd(monthlyGoal)} ✏️
                </button>
              )}
            </div>
            <strong className="workspace-metric-value" style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'block', color: 'var(--text)' }}>
              {formatUsd(ledgerSummary.grossRevenue)}
            </strong>
          </div>

          <div style={{ marginTop: '0.65rem' }}>
            <div style={{ height: '5px', background: 'rgba(var(--tint), 0.08)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${goalProgressPct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)',
                  borderRadius: '999px',
                }}
              />
            </div>
            <p className="workspace-metric-note" style={{ marginTop: '0.35rem', fontSize: '0.74rem', color: 'var(--muted)', margin: '0.35rem 0 0' }}>
              {ledgerSummary.paidCount} settled {ledgerSummary.paidCount === 1 ? 'transaction' : 'transactions'}
            </p>
          </div>
        </article>

        {/* 2. Net Reconciled Cash with Inline ACH Savings Tag */}
        <article
          className="workspace-metric-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.1rem 1.25rem',
            background: 'var(--bg-2)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-soft)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="workspace-metric-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                Net Reconciled Cash
              </span>
              {ledgerSummary.achSavingsEstimated > 0 && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.12rem 0.45rem',
                    borderRadius: '999px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: 'var(--good, #047857)',
                    fontWeight: 600,
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}
                  title="Total processing fee savings achieved through $5 capped ACH vs 2.9% cards"
                >
                  +{formatUsd(ledgerSummary.achSavingsEstimated)} ACH saved
                </span>
              )}
            </div>
            <strong className="workspace-metric-value" style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--good, #047857)', display: 'block' }}>
              {formatUsd(ledgerSummary.netRevenue)}
            </strong>
          </div>
          <p className="workspace-metric-note" style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0.65rem 0 0' }}>
            After {formatUsd(ledgerSummary.totalFees)} in merchant fees
          </p>
        </article>

        {/* 3. Outstanding Aging Receivables */}
        <article
          className="workspace-metric-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.1rem 1.25rem',
            background: 'var(--bg-2)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-soft)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="workspace-metric-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                Aging Receivables
              </span>
              {receivablesSummary.overdueCount > 0 ? (
                <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.45rem', borderRadius: '999px', background: 'rgba(239, 68, 68, 0.12)', color: 'var(--bad, #dc2626)', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                  {receivablesSummary.overdueCount} overdue
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.45rem', borderRadius: '999px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--good, #047857)', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  On Terms
                </span>
              )}
            </div>
            <strong className="workspace-metric-value" style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', color: receivablesSummary.totalOverdue > 0 ? 'var(--bad, #dc2626)' : 'var(--text)', display: 'block' }}>
              {formatUsd(receivablesSummary.totalOutstanding)}
            </strong>
          </div>
          <p className="workspace-metric-note" style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0.65rem 0 0' }}>
            Across {receivablesSummary.totalReceivablesCount} active client invoices
          </p>
        </article>

        {/* 4. In-Transit Bank Payouts */}
        <article
          className="workspace-metric-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.1rem 1.25rem',
            background: 'var(--bg-2)',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-soft)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-soft)';
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span className="workspace-metric-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                In-Transit to Bank
              </span>
              <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.45rem', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--info, #2563eb)', fontWeight: 600, border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                {payouts.payoutsPaused ? 'Paused' : 'Auto-Transfer'}
              </span>
            </div>
            <strong className="workspace-metric-value" style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'block', color: 'var(--text)' }}>
              {formatUsd(payouts.availableBalanceDollars + payouts.pendingBalanceDollars)}
            </strong>
          </div>
          <p className="workspace-metric-note" style={{ fontSize: '0.74rem', color: 'var(--muted)', margin: '0.65rem 0 0' }}>
            {payouts.payoutsPaused ? (
              <span style={{ color: 'var(--bad, #dc2626)' }}>⚠️ Action required on Stripe</span>
            ) : (
              'Next transfer arriving in 1–2 business days'
            )}
          </p>
        </article>
      </section>

      {/* Main Workspace Interactive Tab Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--line)', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="tabs" style={{ margin: 0, border: 'none', display: 'flex', gap: '0.25rem' }}>
          {TABS.map((t) => {
            const count =
              t.key === 'ledger' ? initialPayments.length :
              t.key === 'receivables' ? receivables.length :
              t.key === 'recovery' ? failedPayments.length :
              t.key === 'disputes' ? disputedPayments.length :
              null;

            const isAlert =
              (t.key === 'receivables' && receivablesSummary.overdueCount > 0) ||
              (t.key === 'recovery' && failedPayments.length > 0) ||
              (t.key === 'disputes' && disputedPayments.length > 0);

            return (
              <button
                key={t.key}
                type="button"
                className={`tab ${activeTab === t.key ? 'active' : ''}`}
                style={{
                  fontSize: '0.86rem',
                  fontWeight: activeTab === t.key ? 700 : 500,
                  padding: '0.6rem 0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
                onClick={() => handleTabSelect(t.key)}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {count !== null && (
                  <span
                    style={{
                      padding: '0.1rem 0.45rem',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: isAlert ? 'var(--bad, #dc2626)' : activeTab === t.key ? 'rgba(var(--tint), 0.14)' : 'rgba(var(--tint), 0.07)',
                      color: isAlert ? '#ffffff' : activeTab === t.key ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Compact Range Pills */}
        <div style={{ display: 'flex', gap: '0.25rem', paddingBottom: '0.25rem' }}>
          {RANGE_TABS.map((r) => (
            <Link
              key={r.key}
              href={`/dashboard/payments?range=${r.key}#${activeTab}`}
              className={`btn ${selectedRange === r.key ? 'primary' : 'secondary'}`}
              style={{ fontSize: '0.76rem', padding: '0.2rem 0.55rem', borderRadius: '4px' }}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Tab Panels */}
      <section className="panel workspace-section-card">
        {activeTab === 'ledger' && (
          <PaymentsLedgerTable
            initialRows={initialPayments}
            summary={ledgerSummary}
            onOpenModal={(type, payment) => {
              setSelectedPayment(payment || null);
              setActiveModal(type);
            }}
          />
        )}

        {activeTab === 'receivables' && (
          <ReceivablesAgingBoard
            receivables={receivables}
            summary={receivablesSummary}
            onOpenManualPayment={(_jobId, _invoiceId, _amount) => {
              setSelectedPayment(null);
              setActiveModal('manual_payment');
            }}
            onOpenBatchSettle={() => {
              setSelectedPayment(null);
              setActiveModal('batch_settle');
            }}
            onOpenPromiseToPay={(item) => {
              setSelectedPayment({
                id: item.id,
                amount: item.amount,
                clientName: item.clientName,
                jobRef: '',
                label: 'Payment Request',
              } as PaymentLedgerItem);
              setActiveModal('promise_to_pay');
            }}
            onOpenNoiGenerator={(item) => {
              setSelectedPayment({
                id: item.id,
                amount: item.amount,
                clientName: item.clientName,
                jobRef: '',
                label: 'Payment Request',
              } as PaymentLedgerItem);
              setActiveModal('noi_generator');
            }}
            onOpenLienWaiver={(item) => {
              setSelectedPayment({
                id: item.id,
                amount: item.amount,
                clientName: item.clientName,
                jobId: item.jobId || '',
                jobRef: '',
                label: 'Lien Release',
              } as PaymentLedgerItem);
              setActiveModal('lien_waiver');
            }}
            onOpenConsolidatedBilling={() => {
              setSelectedPayment(null);
              setActiveModal('consolidated_statement');
            }}
            onOpenRetainageTracker={() => {
              setSelectedPayment(null);
              setActiveModal('retainage_tracker');
            }}
            onOpenDrawCalendar={() => {
              setSelectedPayment(null);
              setActiveModal('draw_calendar');
            }}
            onSuccess={handleShowToast}
          />
        )}

        {activeTab === 'recovery' && (
          <FailedPaymentsRecoveryPanel
            failedPayments={failedPayments}
            onOpenManualPayment={(_jobId, _invoiceId, _amount) => {
              setSelectedPayment(null);
              setActiveModal('manual_payment');
            }}
            onSuccess={handleShowToast}
          />
        )}

        {activeTab === 'payouts' && (
          <PayoutsTransfersPanel payouts={payouts} />
        )}

        {activeTab === 'analytics' && (
          <RevenueAnalyticsPanel analytics={analytics} />
        )}

        {activeTab === 'disputes' && (
          <DisputesDefensePanel
            disputedPayments={disputedPayments}
            onOpenEvidenceModal={(payment) => {
              setSelectedPayment(payment);
              setActiveModal('dispute_evidence');
            }}
          />
        )}
      </section>

      {/* Shared Modals */}
      <PaymentModals
        activeModal={activeModal}
        selectedPayment={selectedPayment}
        jobs={jobs}
        grossRevenue={ledgerSummary.grossRevenue}
        receivables={receivables}
        onOpenModal={(type, payment) => {
          setSelectedPayment(payment || null);
          setActiveModal(type);
        }}
        onClose={() => {
          setActiveModal(null);
          setSelectedPayment(null);
        }}
        onSuccess={handleShowToast}
      />
    </main>
  );
}
