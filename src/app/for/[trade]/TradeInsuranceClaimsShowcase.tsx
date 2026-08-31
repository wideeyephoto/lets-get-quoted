import Link from 'next/link';
import { type Trade } from '@/lib/trades';
import {
  getInsuranceTradeProfile,
  isInsuranceEligibleTrade,
  type InsuranceTradeProfile,
} from '@/lib/trade-insurance';
import styles from './trade-definitive.module.css';

export default function TradeInsuranceClaimsShowcase({ trade }: { trade: Trade }) {
  if (!isInsuranceEligibleTrade(trade.slug)) return null;

  const profile: InsuranceTradeProfile = getInsuranceTradeProfile(trade.slug);
  const sampleSupplements = profile.standardSupplements.slice(0, 4);
  const sampleTotal = sampleSupplements.reduce((sum, s) => sum + s.defaultEstimatedCost, 0);

  return (
    <section className={styles.section} id="insurance-claims-studio">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.kicker}>Insurance Claims & AI Supplement Studio</span>
          <h2 className={styles.title}>
            Turn lowball adjuster scopes into <em>full, code-compliant approvals</em>.
          </h2>
          <p className={styles.subtitle}>
            Built specifically for {trade.name} handling storm damage, emergency restorations, and insurance claims. Scan Xactimate scopes in seconds, identify omitted building code requirements, and draft UPPA-compliant contractor justification letters.
          </p>
        </div>

        {/* Main Showcase Banner */}
        <div className={styles.quoteCard}>
          <div className={styles.quoteHeader}>
            <div>
              <div className="inline-flex items-center gap-2 mb-2">
                <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300 border border-blue-400/30">
                  ⚡ AI Scope & Supplement Engine
                </span>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-400/30">
                  🛡️ UPPA Compliant
                </span>
              </div>
              <h3 className={styles.projectTitle}>
                Building Code & Scope Review Engine for {trade.name}
              </h3>
              <p className={styles.scopeSummary}>
                Adjuster estimates frequently omit code-required components. Cross-reference local building codes (IRC, IICRC, ANSI) to generate accurate contractor estimates.
              </p>
            </div>

            {/* Scope Value Demonstration */}
            <div className="flex flex-wrap gap-4 rounded-xl bg-black/40 p-4 border border-stone-700/50">
              <div className="text-left">
                <span className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Initial Scope</span>
                <span className="text-lg font-bold text-stone-300">$8,799</span>
              </div>
              <div className="text-left border-l border-stone-700 pl-4">
                <span className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Identified Supplements</span>
                <span className="text-lg font-bold text-emerald-400">+${sampleTotal.toLocaleString()}</span>
              </div>
              <div className="text-left border-l border-stone-700 pl-4">
                <span className="block text-[11px] font-semibold text-blue-400 uppercase tracking-wider">Revised Total Estimate</span>
                <span className="text-lg font-bold text-blue-300">${(8799 + sampleTotal).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Omitted Items Grid for this Trade */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-stone-200 uppercase tracking-wider mb-3">
              Standard Code-Required Supplements Flagged for {trade.name}:
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sampleSupplements.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg border border-stone-700/60 bg-stone-900/60 p-3.5 transition hover:border-stone-500"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span className="text-sm font-semibold text-stone-100">{item.item}</span>
                    </div>
                    <p className="text-xs text-stone-400">{item.reason}</p>
                    <span className="inline-block rounded bg-stone-800 px-2 py-0.5 text-[10px] font-mono text-stone-300">
                      Authority: {item.typicalCodeRef}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-400 whitespace-nowrap">
                    +${item.defaultEstimatedCost}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Value Pillars */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 border-t border-stone-700/40 pt-6">
            <div className="space-y-1.5">
              <span className="text-lg">🔍</span>
              <h4 className="text-sm font-bold text-stone-100">Scope of Loss Parser</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Paste any Xactimate estimate or adjuster PDF to extract figures and discover omitted line items in under 5 seconds.
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="text-lg">📄</span>
              <h4 className="text-sm font-bold text-stone-100">1-Click Scope Clarifications</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Generate itemized contractor construction estimates and scope clarification drafts citing specific building codes, ready to review with adjusters.
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="text-lg">💬</span>
              <h4 className="text-sm font-bold text-stone-100">Homeowner Claim Co-Pilot</h4>
              <p className="text-xs text-stone-400 leading-relaxed">
                Provide crystal-clear answers on ACV vs. RCV, deductibles, and policyholder rights while keeping your business 100% UPPA compliant.
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link href="/demo" className="btn primary">
              Try the Insurance & Supplement Studio Live &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
