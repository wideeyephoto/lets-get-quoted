import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Security — Let’s Get Quoted',
  description:
    'How Let’s Get Quoted keeps your money and your customers’ data safe: payments handled by Stripe, encryption in transit, per-account data isolation, verified-webhook payments, and passwordless sign-in.',
  alternates: { canonical: 'https://letsgetquoted.com/security' },
};

const pillars = [
  {
    title: 'Payments handled by Stripe',
    body: 'Card and bank payments run entirely on Stripe, a PCI DSS Level 1 provider. Card numbers go straight to Stripe — they never touch or get stored on our servers.',
  },
  {
    title: 'Encrypted in transit',
    body: 'Every request is served over HTTPS/TLS, so data moving between you, your customers, and the platform is encrypted end to end.',
  },
  {
    title: 'Payments confirmed by verified webhooks',
    body: 'A payment is only ever marked “paid” after Stripe confirms it through a cryptographically verified webhook — never from a browser redirect that could be faked.',
  },
  {
    title: 'Your data is isolated',
    body: 'Every contractor’s data is walled off from every other account at the database level, so one business can never see another’s leads, jobs, or customers.',
  },
  {
    title: 'Passwordless sign-in',
    body: 'You log in with a one-time code sent by text or email — there’s no password to be guessed, reused, or leaked in a breach somewhere else.',
  },
  {
    title: 'Consent & compliance built in',
    body: 'Texting honors STOP, START, and HELP and enforces opt-outs; marketing email carries your mailing address and a one-click unsubscribe. Compliance isn’t an afterthought.',
  },
  {
    title: 'Managed cloud infrastructure',
    body: 'The platform runs on modern managed cloud hosting and a managed Postgres database with automated backups — the same class of infrastructure trusted with production workloads.',
  },
  {
    title: 'Your data is yours',
    body: 'Export your invoices, costs, and tax reports to CSV or QuickBooks anytime, and delete your account and its data whenever you choose. No lock-in.',
  },
];

export default function SecurityPage() {
  return (
    <main className="marketing-shell">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Security &amp; trust</p>
          <h2>Built to be trusted with real money.</h2>
          <p>
            You&apos;re running payroll and collecting payments through this tool — it has to earn that. Here&apos;s
            plainly how your money and your customers&apos; information are kept safe.
          </p>
        </div>
        <div className="actions">
          <Link href="/login" className="btn primary">Create Free Account</Link>
          <Link href="/faq" className="btn secondary">Read the FAQ</Link>
        </div>
      </section>

      <section className="section-block">
        <div className="feature-grid">
          {pillars.map((pillar) => (
            <article key={pillar.title} className="feature-card">
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Straight answer</p>
          <h2>What we don&apos;t do.</h2>
          <p>
            We never see or store your customers&apos; card numbers, we don&apos;t sell your data, and we don&apos;t lock
            it up — you can export or delete it whenever you want. If you ever spot a security concern, tell us and
            we&apos;ll act on it.
          </p>
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Get paid with confidence.</h2>
          <p>Start free — you only pay when a homeowner pays you.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">Create Free Account</Link>
            <Link href="/pricing" className="btn secondary">See pricing</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
