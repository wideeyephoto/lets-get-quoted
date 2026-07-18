import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { DEMO_COMPANY_NAME } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export default function DemoSitesPage() {
  return (
    <>
      <DemoNav active="/demo/sites" />
      <main className="wide-shell workspace-shell">
        <section className="workspace-hero workspace-hero-solo panel">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Website</p>
            <h1 className="workspace-title">A free website, built for {DEMO_COMPANY_NAME}</h1>
            <p className="workspace-lead">
              Pick a template, drop in your photos and service area, and publish a quote-request website
              in minutes - no code required.
            </p>
          </div>
        </section>

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>Build your website</h2>
          </div>
          <p className="workspace-card-copy">
            Every plan includes a hosted website with a quote-request form that feeds straight into
            your request pipeline. This demo account is read-only.
          </p>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </section>
      </main>
    </>
  );
}
