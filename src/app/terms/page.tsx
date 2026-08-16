import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import styles from '../legal.module.css';

// The PLATFORM's Terms of Service — the agreement between LETS GET QUOTED LLC
// and the contractor who signs up. Not to be confused with the Terms page a
// contractor publishes on their own website (SiteLegalPage), which is theirs and
// is about their trade work. Contractor sites are rewritten to /site/<subdomain>
// by middleware, so this route only ever serves letsgetquoted.com/terms.
export const metadata: Metadata = {
  title: 'Terms of Service',
  // Without its own canonical this page inherited the root layout's
  // `canonical: '/'` and declared itself a duplicate of the homepage.
  alternates: { canonical: 'https://letsgetquoted.com/terms' },
  description: 'The agreement between Let\'s Get Quoted and the contractors who use it.',
};

export default function TermsOfServicePage() {
  return (
    <main className={styles.legalShell} id="main-content">
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>Terms of Service</h1>
        <p>These terms are an agreement between you and LETS GET QUOTED LLC, a Michigan limited liability company (&quot;Let&apos;s Get Quoted&quot;, &quot;we&quot;, &quot;us&quot;). They cover your use of our software, websites, and related services (the &quot;Service&quot;). Please read them — by creating an account or using the Service you agree to them.</p>
        <span className={styles.effectiveDate}>Effective {TERMS_EFFECTIVE_DATE}</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>1. Who may use the Service</h2>
          <p>The Service is for businesses and the people who run them. You must be at least 18 years old and able to enter a binding contract. If you accept these terms on behalf of a company, you confirm you are authorized to bind that company, and &quot;you&quot; means that company.</p>
          <p>You are responsible for everything that happens under your account, including anything done by your crew, staff, or anyone you give access to.</p>
        </section>

        <section>
          <h2>2. Your account</h2>
          <p>We create your account when you first sign in, and we sign you in with a link or code sent to your email or phone rather than a password. Keep access to that email address and phone number secure — anyone who controls them can reach your account. Tell us promptly if you believe someone has gained access they should not have.</p>
          <p>You agree to give us accurate business information and to keep it current.</p>
        </section>

        <section>
          <h2>3. Your customers&apos; information</h2>
          <p><strong>The customer records you put into the Service are yours, not ours.</strong> Homeowner names, phone numbers, addresses, job histories, photos, and payment records belong to your business. We hold and process them on your behalf so we can provide the Service, and we do not sell them.</p>
          <p>Because that information is yours, you are responsible for having the right to collect and use it. In particular you confirm that you have any consent required before we send a message on your behalf, and that you will honor requests from your customers to be removed or to stop being contacted.</p>
          <p>Our <Link href="/privacy">Privacy Policy</Link> describes how we handle information across the Service.</p>
        </section>

        <section>
          <h2>4. Text messages and calls</h2>
          <p>The Service can send text messages to your customers on your behalf — appointment reminders, payment links, review requests, and marketing you choose to send. Messaging is regulated. You are responsible for having the consent the law requires before a message is sent, and marketing messages generally require prior express written consent from the recipient.</p>
          <p>We enforce STOP, START, and HELP keywords and suppress contacts who opt out, but those tools do not replace your obligation to have permission in the first place. You agree not to use the Service to send messages you do not have consent to send, and to indemnify us for claims arising from messages sent through your account.</p>
          <p>See our <Link href="/sms-terms">SMS Terms</Link> for program details.</p>
        </section>

        <section>
          <h2>5. Payments, fees, and Stripe</h2>
          <p>Payments from your customers are processed by Stripe, Inc. and are paid into the Stripe account you connect. <strong>We never hold your money.</strong> Your use of Stripe is governed by Stripe&apos;s own agreements, which you enter into directly with Stripe, and Stripe decides who it will serve.</p>
          <p>We charge a platform fee on payments processed through the Service. The current rate is published on our <Link href="/pricing">pricing page</Link> and is deducted at the time of the transaction. Stripe&apos;s own processing fees are separate and are charged by Stripe.</p>
          <p>Paid base plans are prepaid monthly or annually and renew automatically on the same billing cadence until canceled. When you subscribe, you authorize us, through Stripe, to charge the payment method you provide at the start of each billing period at the price shown before purchase. You may cancel before the next renewal; cancellation takes effect at the end of the current paid billing period.</p>
          <p><strong>First annual base-plan guarantee.</strong> Once per verified business, you may convert the first annual base plan within 30 days after its initial charge. The refund equals the annual prepayment minus one normal month-to-month base charge for the selected plan. LGQ platform fees are not recalculated retroactively. Consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.</p>
          <p>Refunds, chargebacks, and disputes are between you and your customer. If a payment is refunded or reversed, amounts already paid out may be recovered from your Stripe balance. You are responsible for the taxes that apply to your business and to the prices you charge.</p>
          <p>If we introduce optional paid add-ons, their price and billing terms will be shown before you buy, and buying one is always your choice.</p>
        </section>

        <section>
          <h2>6. Estimates, quotes, and automated suggestions</h2>
          <p>The Service includes features that generate estimated price ranges, draft quotes, draft written content, and similar suggestions automatically. <strong>These are drafts and estimates, not quotes from you and not advice from us.</strong> They may be wrong.</p>
          <p>You are responsible for reviewing anything the Service drafts before you send it, and for the price you ultimately commit to. An estimated range shown to a homeowner is not a binding quote unless you make it one.</p>
        </section>

        <section>
          <h2>7. Websites you publish</h2>
          <p>The Service lets you build and publish a website, optionally on your own domain. You are responsible for what is on it — the claims you make, the photos you upload, the licenses you hold, and any legal or advertising rules that apply to your trade in your area.</p>
          <p>You grant us the limited right to host, reproduce, and display your content for the purpose of operating the Service and delivering your site to visitors. That right ends when you remove the content or close your account, except for copies retained in routine backups.</p>
        </section>

        <section>
          <h2>8. Acceptable use</h2>
          <ul>
            <li>Do not use the Service to break the law or to help someone else do so.</li>
            <li>Do not send messages or email to people who have not agreed to hear from you.</li>
            <li>Do not upload content you do not have the right to use, or that infringes someone else&apos;s rights.</li>
            <li>Do not misrepresent your licensing, insurance, certifications, or the reviews you display.</li>
            <li>Do not attempt to access another account, probe or disrupt the Service, or work around its limits.</li>
            <li>Do not resell or white-label the Service without our written agreement.</li>
          </ul>
          <p>We may suspend an account that we reasonably believe is being used this way, including where continuing would put other users, their customers, or our providers at risk.</p>
        </section>

        <section>
          <h2>9. Availability and changes</h2>
          <p>We work to keep the Service running but we do not promise it will be uninterrupted or error-free. We may change, add, or remove features. If we remove something you rely on materially, we will make a reasonable effort to tell you first.</p>
          <p>Parts of the Service depend on providers we do not control — payment processing, messaging carriers, email delivery, mapping, and hosting among them. Interruptions or decisions by those providers can affect the Service.</p>
        </section>

        <section>
          <h2>10. No warranty</h2>
          <p>The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will meet your requirements, that estimates it generates will be accurate, or that it will result in any particular number of leads, jobs, or revenue.</p>
        </section>

        <section>
          <h2>11. Limitation of liability</h2>
          <p>To the fullest extent permitted by law, neither party is liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, lost revenue, lost business, or lost data, even if advised such damages were possible.</p>
          <p>Our total liability arising out of or relating to the Service, in the aggregate, will not exceed the greater of (a) the platform fees you paid us in the three months before the event giving rise to the claim, or (b) one hundred US dollars.</p>
          <p>Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>
        </section>

        <section>
          <h2>12. Indemnity</h2>
          <p>You agree to defend, indemnify, and hold harmless Let&apos;s Get Quoted from claims, damages, and reasonable legal costs arising out of your use of the Service, your content, the work you perform for your customers, the messages sent through your account, or your breach of these terms.</p>
        </section>

        <section>
          <h2>13. Ending the agreement</h2>
          <p>You may stop using the Service and close your account at any time. We may suspend or end an account for a material breach of these terms, for legal reasons, or if we stop offering the Service; except where a breach makes it impractical, we will give reasonable notice.</p>
          <p>Before you close an account, export what you need — the Service includes tools for this. After closure we delete or de-identify account data on a routine schedule, except records we must keep for legal, tax, accounting, security, or fraud-prevention reasons. Published websites stop being served when the account closes.</p>
          <p>Sections that by their nature should survive — including sections 3, 5, 10, 11, 12, and 15 — survive the end of this agreement.</p>
        </section>

        <section>
          <h2>14. Changes to these terms</h2>
          <p>We may update these terms. When a change is material we will raise the version and ask you to accept the new terms the next time you sign in, and the effective date above will change. Continuing to use the Service after that means you accept the updated terms. If you do not accept them, stop using the Service and close your account.</p>
        </section>

        <section>
          <h2>15. Governing law and disputes</h2>
          <p>These terms are governed by the laws of the State of Michigan, without regard to its conflict-of-laws rules. You and we agree to the exclusive jurisdiction of the state and federal courts located in Michigan for any dispute that is not otherwise resolved.</p>
          <p>Before filing anything, please contact us — nearly everything is faster to fix by talking to a person.</p>
        </section>

        <section>
          <h2>16. The rest</h2>
          <p>These terms, together with the Privacy Policy and SMS Terms, are the entire agreement between us about the Service. If a provision is unenforceable, the rest stays in force. A delay in enforcing a right is not a waiver of it. You may not assign this agreement without our consent; we may assign it in connection with a merger, acquisition, or sale of assets. Nothing here creates a partnership, employment, or agency relationship — you run your business, we provide software.</p>
        </section>

        <section>
          <h2>17. Contact</h2>
          <p>Questions about these terms can be sent through our <Link href="/contact">contact page</Link>.</p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
        <Link href="/security">Security</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
