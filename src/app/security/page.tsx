import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const metadata: Metadata = {
  title: 'Security',
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
    // NOT "end to end". End-to-end encryption means the server cannot read the
    // content; ours can, because it has to render your quotes. What is true is
    // that the transport is encrypted, so that is what this says.
    body: 'Every request is served over HTTPS/TLS, so data moving between you, your customers, and the platform is encrypted in transit.',
  },
  {
    title: 'Payments confirmed by verified webhooks',
    body: 'A payment is only ever marked “paid” after Stripe confirms it through a cryptographically verified webhook — never from a browser redirect that could be faked.',
  },
  {
    title: 'Your data is isolated',
    // "can never" is a guarantee no software gets to make about itself. What we
    // can say is what we built and what it is for.
    body: 'Row-level security policies run on every query, so access controls are designed to isolate each business’s leads, jobs, and customers from every other account.',
  },
  {
    title: 'Passwordless sign-in',
    body: 'You log in with a one-time code sent by text or email — there’s no password to be guessed, reused, or leaked in a breach somewhere else.',
  },
  {
    title: 'Opt-out handling built in',
    // Built-in OPT-OUT handling, not built-in consent. We can honour STOP; we
    // cannot obtain permission on somebody else's behalf, and implying we do
    // would leave a contractor thinking a legal obligation was taken care of.
    body: 'Texting honors STOP, START, and HELP and enforces opt-outs; marketing email carries your mailing address and a one-click unsubscribe. Obtaining consent to contact your customers remains your responsibility.',
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
    <main className="marketing-shell" id="main-content">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Security &amp; trust</p>
          {/* An <h1>, not an <h2>: this page had no page-level heading at all, so
              a screen-reader user navigating by heading found no page name and
              the hierarchy started at h2. `.section-heading h1` keeps it
              section-sized rather than letting the global hero h1 dwarf it. */}
          <h1>Built to be trusted with real money.</h1>
          <p>
            You&apos;re tracking crew hours and collecting payments through this tool — it has to earn that. Here&apos;s
            plainly how your money and your customers&apos; information are kept safe.
          </p>
        </div>
        <div className="actions">
          <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
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
            <a href={APP_SIGNUP_URL} className="btn primary">Build my free site</a>
            <Link href="/pricing" className="btn secondary">See pricing</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
