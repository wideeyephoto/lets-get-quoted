import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import DiscountsInteractive from './DiscountsInteractive';
import styles from '../admin.module.css';
import discStyles from './discounts.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Discounts & VIP Founder Program' };

export default async function AdminDiscountsPage() {
  await requireAdmin();

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Internal Playbook & Policy</p>
        <h1 className={styles.title}>Friends & Family Discounts & VIP Program</h1>
        <p className={styles.lead}>
          Internal operational rules, pricing rates, Stripe coupon codes, and customer outreach tools for staff issuing VIP Founder discounts.
        </p>
      </header>

      <div className={discStyles.container}>
        {/* Executive Banner */}
        <div className={discStyles.banner}>
          <h2 className={discStyles.bannerTitle}>
            <span>⭐</span> Company Policy: VIP Founder Rates (Margin Protected)
          </h2>
          <p className={discStyles.bannerText}>
            We never sell below cost. All friends, family, and early contractor VIP discounts are priced to secure a healthy <strong>15% to 45% net profit margin</strong> above our hard infrastructure costs (SignalWire carrier fees, Deepgram voice models, AI LLM intake tokens, and Stripe processing).
          </p>
        </div>

        {/* Pricing Cards */}
        <div className={discStyles.grid3}>
          {/* Solo Card */}
          <div className={`${discStyles.pricingCard} ${discStyles.pricingCardFeatured}`}>
            <div className={discStyles.planHeader}>
              <h3 className={discStyles.planName}>Solo Plan</h3>
              <span className={discStyles.badge}>60% Lifetime Off</span>
            </div>
            <div className={discStyles.priceComparison}>
              <span className={discStyles.originalPrice}>$39</span>
              <span className={discStyles.vipPrice}>$15.60</span>
              <span className={discStyles.period}>/ month</span>
            </div>
            <ul className={discStyles.featureList}>
              <li>Instant quoting & online estimates</li>
              <li>Connected card payments & invoices</li>
              <li>Homeowner client portal</li>
              <li>2 office user seats</li>
              <li>Estimated net profit margin: ~35%–45%</li>
            </ul>
            <div className={discStyles.codePill}>
              <span>Coupon: <code>ff_vip_60_lifetime</code></span>
            </div>
          </div>

          {/* Growth Card */}
          <div className={`${discStyles.pricingCard} ${discStyles.pricingCardFeatured}`}>
            <div className={discStyles.planHeader}>
              <h3 className={discStyles.planName}>Growth Plan</h3>
              <span className={discStyles.badge}>60% Lifetime Off</span>
            </div>
            <div className={discStyles.priceComparison}>
              <span className={discStyles.originalPrice}>$129</span>
              <span className={discStyles.vipPrice}>$51.60</span>
              <span className={discStyles.period}>/ month</span>
            </div>
            <ul className={discStyles.featureList}>
              <li>Everything in Solo</li>
              <li>Priority Quick Stops & dispatching</li>
              <li>Time tracking & crew pay engine</li>
              <li>Team management & payroll exports</li>
              <li>Estimated net profit margin: ~40%–50%</li>
            </ul>
            <div className={discStyles.codePill}>
              <span>Coupon: <code>ff_vip_60_lifetime</code></span>
            </div>
          </div>

          {/* Flex Tier Card */}
          <div className={discStyles.pricingCard}>
            <div className={discStyles.planHeader}>
              <h3 className={discStyles.planName}>Flex Tier</h3>
              <span className={discStyles.badge}>40% Across the Board</span>
            </div>
            <div className={discStyles.priceComparison}>
              <span className={discStyles.originalPrice}>1.25%</span>
              <span className={discStyles.vipPrice}>0.75%</span>
              <span className={discStyles.period}>take rate (75 bps)</span>
            </div>
            <ul className={discStyles.featureList}>
              <li>$0/mo base subscription fee</li>
              <li>Take rate cut from 125 bps to 75 bps</li>
              <li>AI Voice add-on cut to $41.40/mo (normally $69)</li>
              <li>40% reduction on capacity top-ups</li>
              <li>Applied via Admin Account Actions or DB</li>
            </ul>
            <div className={discStyles.codePill}>
              <span>Voice Code: <code>ff_flex_40</code></span>
            </div>
          </div>
        </div>

        {/* Step-by-Step SOPs */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Standard Operating Procedures (SOP) for Staff</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginTop: '0.8rem' }}>
            
            <div style={{ borderLeft: '3px solid var(--accent, #ff7a21)', paddingLeft: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.3rem', color: '#fff' }}>
                1. Issuing a Discount Code to a New User (Solo / Growth)
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#bbb', lineHeight: 1.5 }}>
                • Go to your <a href="https://dashboard.stripe.com/coupons" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #ff7a21)', textDecoration: 'underline' }}>Stripe Dashboard Coupons</a>.<br />
                • Click on coupon <code>ff_vip_60_lifetime</code>.<br />
                • Click <strong>+ Add a promotion code</strong>.<br />
                • Enter a personalized code (e.g. <code>VIP-BOB</code> or <code>FF-SARAH</code>).<br />
                • Set <strong>Max redemptions = 1</strong> and optionally limit to their email.<br />
                • Send the code to the contractor along with our signup link.
              </p>
            </div>

            <div style={{ borderLeft: '3px solid #22c55e', paddingLeft: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.3rem', color: '#fff' }}>
                2. Applying a Discount to an Already Subscribed User
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#bbb', lineHeight: 1.5 }}>
                • Look up their customer record in the <a href="https://dashboard.stripe.com/customers" target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #ff7a21)', textDecoration: 'underline' }}>Stripe Dashboard</a>.<br />
                • Click their active <strong>Subscription</strong>.<br />
                • Click <strong>Actions</strong> (or <code>...</code>) → <strong>Apply coupon</strong>.<br />
                • Select <code>ff_vip_60_lifetime</code>. All upcoming invoices will instantly bill at $15.60/mo (Solo) or $51.60/mo (Growth).
              </p>
            </div>

            <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.3rem', color: '#fff' }}>
                3. Activating the 0.75% Take Rate on Flex
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#bbb', lineHeight: 1.5 }}>
                • Navigate to the contractor&apos;s workspace on the <Link href="/admin/accounts" style={{ color: 'var(--accent, #ff7a21)', textDecoration: 'underline' }}>Accounts Page</Link>.<br />
                • If their plan is Flex, scroll down to the <strong>Account Actions</strong> section.<br />
                • Click <strong>Apply VIP Founder 0.75% (75 bps)</strong> and submit your staff reason.<br />
                • All subsequent customer payments processed on their account will immediately calculate at 0.75%.
              </p>
            </div>

          </div>
        </section>

        {/* Interactive Calculator, Outreach Scripts & Account Jump */}
        <DiscountsInteractive />

        {/* Non-Negotiable Staff Guardrails */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Hard Cost Safeguards & Guardrails</h2>
          <div className={discStyles.rulesList} style={{ marginTop: '0.8rem' }}>
            <div className={discStyles.ruleItem}>
              <strong>Continuous Active Billing</strong>
              The 60% discount is valid only while the subscription remains active. Pausing, canceling, or letting payment lapse forfeits the VIP rate; re-subscribing requires standard pricing.
            </div>
            <div className={discStyles.ruleItem}>
              <strong>Strictly Non-Transferable</strong>
              Promotional codes are single-use and tied to the specific contractor or business email. Reselling, sublicensing, or transferring accounts is prohibited.
            </div>
            <div className={discStyles.ruleItem}>
              <strong>Third-Party Overages Billed at Standard</strong>
              On paid plans (Solo & Growth), high-volume direct telecommunication overages beyond included allowance are billed at standard carrier cost to protect company unit economics.
            </div>
            <div className={discStyles.ruleItem}>
              <strong>Mandatory Feedback Protocol</strong>
              Any staff member granting a VIP code is responsible for checking in after 14 days to conduct a 15-minute anti-politeness feedback interview to help improve the product.
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
