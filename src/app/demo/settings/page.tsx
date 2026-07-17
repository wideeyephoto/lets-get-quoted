import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { DEMO_COMPANY_NAME } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export default function DemoSettingsPage() {
  return (
    <>
      <DemoNav active="/demo/settings" />
      <main className="wide-shell workspace-shell">
        <section className="workspace-hero workspace-hero-solo panel">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Account</p>
            <h1 className="workspace-title">{DEMO_COMPANY_NAME} account settings</h1>
            <p className="workspace-lead">
              Manage sign-in methods, payout accounts, and finance reports all in one place.
            </p>
          </div>
        </section>

        <div className="workspace-metric-grid">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Payments setup</span>
            <strong className="workspace-metric-value">Connected</strong>
            <p className="workspace-metric-note">Payouts route straight to your bank account.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Sign-in method</span>
            <strong className="workspace-metric-value">Email + SMS</strong>
            <p className="workspace-metric-note">Passwordless sign-in via magic link or code.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Tax reports</span>
            <strong className="workspace-metric-value">Available</strong>
            <p className="workspace-metric-note">Download year-end summaries for your books.</p>
          </article>
        </div>

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>Manage your account</h2>
          </div>
          <p className="workspace-card-copy">
            Connect Stripe, add sign-in methods, and pull finance reports for tax season. This demo
            account is read-only.
          </p>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </section>
      </main>
    </>
  );
}
