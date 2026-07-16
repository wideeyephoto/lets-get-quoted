import Link from 'next/link';

export const dynamic = 'force-dynamic';

const appPoints = [
  'Magic-link access for owners and office staff',
  'Protected job, invoice, and payment workflows',
  'Stripe Connect onboarding with fee-tier visibility',
];

const operatingLanes = [
  {
    title: 'Capture the work',
    body: 'Track signed jobs, quoted value, and homeowner payment status from one operating surface.',
  },
  {
    title: 'Control the margin',
    body: 'Keep labor and materials tied to each job so the gross margin is visible before the surprises hit.',
  },
  {
    title: 'Close the loop',
    body: 'Route payments through Stripe and export clean accounting output without rebuilding the same report twice.',
  },
];

const proofPoints = [
  'Next.js App Router foundation already running in production-shaped routes',
  'Supabase-backed auth and row-level data boundaries for contractor accounts',
  'Job, invoice, payment, and QuickBooks export paths already wired into the repo',
];

export default function HomePage() {
  return (
    <main className="marketing-shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Contractor operations, tightened up</p>
          <h1>Run quote-to-paid without losing the thread between jobs, money, and margin.</h1>
          <p className="hero-text">
            Let&apos;s Get Quoted gives small contractor teams a sharper operating surface for signed work,
            job costs, homeowner payments, and payout visibility.
          </p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Start with magic link
            </Link>
            <Link href="/dashboard" className="btn secondary">
              Open dashboard
            </Link>
            <Link href="/docs" className="btn secondary">
              Review setup
            </Link>
          </div>
          <ul className="proof-list">
            {appPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <aside className="hero-panel">
          <div className="signal-card signal-card-primary">
            <span>Live operating focus</span>
            <strong>Payments, job cost, and owner controls in one flow</strong>
          </div>
          <div className="signal-stack">
            <div className="signal-card">
              <span>Owner workflow</span>
              <strong>Sign in, onboard Stripe, open protected workspace</strong>
            </div>
            <div className="signal-card">
              <span>Homeowner workflow</span>
              <strong>Pay against a real job record with status-aware handling</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">What&apos;s in the app now</p>
          <h2>Built for the operational handoff, not just the lead form.</h2>
        </div>
        <div className="feature-grid">
          {operatingLanes.map((lane) => (
            <article key={lane.title} className="feature-card">
              <h3>{lane.title}</h3>
              <p>{lane.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block proof-band">
        <div className="section-heading">
          <p className="eyebrow">Current foundation</p>
          <h2>The repo already covers the critical paths.</h2>
        </div>
        <div className="proof-grid">
          {proofPoints.map((point) => (
            <div key={point} className="proof-card">
              {point}
            </div>
          ))}
        </div>
      </section>

      <footer className="marketing-footer">
        <span>© 2026 Let&apos;s Get Quoted</span>
        <nav aria-label="Legal"><Link href="/privacy">Privacy Policy</Link><Link href="/sms-terms">SMS Terms</Link></nav>
      </footer>
    </main>
  );
}
