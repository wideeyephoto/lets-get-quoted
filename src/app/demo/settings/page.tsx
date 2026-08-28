import Link from 'next/link';
import { DEMO_COMPANY_NAME, DEMO_SERVICE_AREA, DEMO_SITE_HOST } from '@/lib/demo-data';
import SettingsTabs from '@/app/dashboard/settings/SettingsTabs';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import { planUsageDashboardEnabled } from '@/lib/billing/plan-usage';

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
 * So the compromise: the real SettingsTabs shell, with the real tabs in their
 * real order, over purpose-built read-only summaries. A prospect sees the
 * true shape of the page; nothing pretends to be a control it isn't. If a tab is
 * ever added or renamed, the nav here follows automatically — only the summaries
 * would need a look.
 */
export default function DemoSettingsPage() {
  const pricingDashboardEnabled = planUsageDashboardEnabled();

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
          ...(pricingDashboardEnabled ? [{
            id: 'plan',
            label: 'Plan & usage',
            content: (
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading">
                  <p className="eyebrow">Plan &amp; usage</p>
                  <h2>What is included and what is available</h2>
                </div>
                <p className="workspace-card-copy">
                  The real account shows its saved plan, LGQ platform-fee rate, billing status, and the exact
                  text, marketing email, and unified AI usage credit balances available right now.
                </p>
                <p className="workspace-card-copy">
                  Purchased credits and plan-period credits may share a balance, so the page labels the amount
                  available instead of presenting a misleading monthly progress bar.
                </p>
              </section>
            ),
          }] : []),
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
            label: 'Automations & AI',
            anchors: ['ai-receptionist', 'automations', 'lead-scoring', 'follow-ups'],
            content: (
              <div className="workspace-section-group" id="automations">
                <section className="panel workspace-section-card" id="ai-receptionist">
                  <div className="section-heading workspace-section-heading">
                    <p className="eyebrow">24/7 AI Receptionist</p>
                    <h2>Never miss a high-value caller</h2>
                  </div>
                  <p className="workspace-card-copy">
                    Answers incoming calls 24/7 with a natural voice tuned specifically for your trade. It gathers
                    project details, provides preliminary price ranges from your price book, answers common questions,
                    and books available arrival windows directly into your schedule while you are on site or after hours.
                  </p>
                  <p className="workspace-card-copy">
                    Every call generates a full audio recording, real-time transcription, and a structured summary with
                    extracted contact info, project scope, and urgency score delivered straight to your inbox and messages rail.
                  </p>
                </section>

                <section className="panel workspace-section-card" id="lead-scoring">
                  <div className="section-heading workspace-section-heading">
                    <p className="eyebrow">AI Lead Intake &amp; Scoring</p>
                    <h2>Instant triage and route matching</h2>
                  </div>
                  <p className="workspace-card-copy">
                    When homeowners submit an estimate request online, AI parses their notes, photos, and project scope.
                    It computes an instant preliminary range, checks route proximity against your existing scheduled jobs,
                    and delivers a pre-scored HOT/WARM/COLD lead (e.g. 94/100) so you know exactly which leads to quote first.
                  </p>
                </section>

                <section className="panel workspace-section-card" id="follow-ups">
                  <div className="section-heading workspace-section-heading">
                    <p className="eyebrow">Customer Communication Workflows</p>
                    <h2>What the app sends on its own</h2>
                  </div>
                  <p className="workspace-card-copy">
                    Each communication automation is a toggle with plain-English rules:
                    automated 5-minute missed-call text backs, on-my-way arrival tracking links for crews,
                    courteous quote follow-up sequences for unanswered proposals, automated appointment reminders,
                    and post-job Google review requests.
                  </p>
                  <p className="workspace-card-copy">
                    Every workflow is configurable, and each shows what a customer will actually receive before it sends.{' '}
                    <Link href="/demo">The dashboard displays active automation history and impact in real time.</Link>
                  </p>
                </section>
              </div>
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
