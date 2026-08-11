import Link from 'next/link';
import { DEMO_COMPANY_NAME, DEMO_SERVICE_AREA, DEMO_SITE_HOST } from '@/lib/demo-data';
import SettingsTabs from '@/app/dashboard/settings/SettingsTabs';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account settings — Live Demo' };

/**
 * Account settings, for a logged-out visitor.
 *
 * THE DELIBERATE EXCEPTION to this demo's "render the real screen" rule, and
 * worth stating plainly because every other page now follows it.
 *
 * Settings is 1,258 lines across twenty-two components and thirty-three server
 * actions, and essentially all of it is forms. Rendering the real sections
 * read-only would mean guarding all thirty-three — and the result would be a
 * screen of disabled inputs, which teaches a prospect less than a plain summary
 * of what is configurable. The value here is knowing the settings EXIST and how
 * they are organized, not operating them.
 *
 * So the compromise: the real SettingsTabs shell, with the real four tabs in
 * their real order, over purpose-built read-only summaries. A prospect sees the
 * true shape of the page; nothing pretends to be a control it isn't. If a tab is
 * ever added or renamed, the nav here follows automatically — only the summaries
 * would need a look.
 */
export default function DemoSettingsPage() {
  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Account</p>
          <h1 className="workspace-title">{DEMO_COMPANY_NAME} account settings</h1>
          <p className="workspace-lead">
            Everything that decides how the app behaves for your business — sign-in, payouts, the automations
            that run without you, and how you price and schedule work.
          </p>
          <p className="workspace-lead">
            <strong>This is a read-only tour.</strong> The real page is a set of forms; here it is a summary of
            what each tab holds.
          </p>
        </div>
      </section>

      <SettingsTabs
        tabs={[
          {
            id: 'account',
            label: 'Login & security',
            content: (
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading">
                  <p className="eyebrow">Sign-in</p>
                  <h2>How you get in</h2>
                </div>
                <p className="workspace-card-copy">
                  Passwordless: a magic link to your email, or a code by text. You can link both, and the
                  dashboard reminds you to add a second one — being locked out of your own business because you
                  changed phone number is a bad afternoon.
                </p>
                <p className="workspace-card-copy">
                  This tab is also where you export everything you have in the app, and where you close the
                  account. Both are deliberately in the same place as sign-in: they are the things only the
                  owner should be doing.
                </p>
              </section>
            ),
          },
          {
            id: 'payments',
            label: 'Payments',
            content: (
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading">
                  <p className="eyebrow">Getting paid</p>
                  <h2>Payouts &amp; finance</h2>
                </div>
                <p className="workspace-card-copy">
                  Payouts run through Stripe straight to your bank — deposits, stage payments and the Quick
                  Stop fee all land the same way. Connecting it is one flow, and until it is done the app is
                  explicit that quotes can be sent but not paid.
                </p>
                <p className="workspace-card-copy">
                  QuickBooks sync and the tax-year reports live here too, so what the accountant needs comes
                  out of the same place the money goes in.
                </p>
              </section>
            ),
          },
          {
            id: 'automations',
            label: 'Automations',
            content: (
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading">
                  <p className="eyebrow">Runs without you</p>
                  <h2>What the app does on its own</h2>
                </div>
                <p className="workspace-card-copy">
                  Each of these is a switch with a plain description of exactly what it sends and when:
                  review requests after a finished job, follow-ups on quotes nobody has answered, appointment
                  reminders, a daily digest, missed-call texts, arrival updates, and the AI that
                  reads and scores incoming leads.
                </p>
                <p className="workspace-card-copy">
                  Every one is off until you turn it on, and each says what a customer will actually receive
                  before you do.{' '}
                  <Link href="/demo">The dashboard shows which are running and what they did.</Link>
                </p>
              </section>
            ),
          },
          {
            id: 'business',
            label: 'Business',
            content: (
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading">
                  <p className="eyebrow">Your business</p>
                  <h2>Trade, area, costs &amp; trust</h2>
                </div>
                <p className="workspace-card-copy">
                  {DEMO_COMPANY_NAME} works {DEMO_SERVICE_AREA} with its site at {DEMO_SITE_HOST}. This tab
                  holds the trade you do, where you work from — kept apart from your mailing address, because
                  a PO box has no driveway to measure a route from — your working hours, and your booking
                  rules.
                </p>
                <p className="workspace-card-copy">
                  It is also where labour burden, job costing defaults and your insurance proof live: the
                  numbers that make margin on a job mean something, and the documents a customer may ask for.
                </p>
              </section>
            ),
          },
        ]}
      />

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Set it up your way</h2>
        </div>
        <p className="workspace-card-copy">
          Every switch and figure above is editable in your own account, and none of it is required to start —
          the app works with the defaults and tells you when a setting would help.
        </p>
        <a href={APP_SIGNUP_URL} className="btn primary">
          Build my free site
        </a>
      </section>
    </main>
  );
}
