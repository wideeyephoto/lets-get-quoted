/* eslint-disable @next/next/no-img-element */
/*
 * The source site's Product page, reproduced.
 *
 * Markup verbatim; only the chrome import, the scope class and a noindex
 * flag differ. It needs no stylesheet of its own — the shared sheet is that
 * site's single globals.css, so .index-hero, .flagship-index and
 * .everything-index are already in it.
 *
 * .everything-index is the section worth looking at: it flips to cream with
 * an orange glow, breaking the dark page into chapters. Our own /features
 * stays dark throughout, which is the difference being judged here.
 */
import type { Metadata } from "next";
import { PageCTA, SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import styles from '@/components/flagship/flagship.module.css';

export const metadata: Metadata = { title: "Contractor Software Features | Let’s Get Quoted", description: "Explore the complete no-subscription contractor suite—from website and AI intake to quoting, scheduling, crews and payments." , robots: { index: false, follow: false } };

const flagships = [
  ["01", "One-click website", "Launch a complete, editable contractor site with Smart Intake connected from day one.", "/features/website-builder", "BUILD THE FRONT DOOR"],
  ["02", "AI Smart Intake", "Ask better questions, build a useful project summary and surface the leads that deserve attention first.", "/features/ai-intake", "QUALIFY THE OPPORTUNITY"],
  ["03", "Quick Stops", "Sell a nearby homeowner a priority visit at a fee you set — paid before you go, and on top of the work itself.", "/features/quick-stops", "EARN BETWEEN JOBS"],
  ["04", "Texts + client portal", "Keep every conversation, approval, update and payment connected to the right job.", "/features/client-portal", "KEEP CUSTOMERS INFORMED"],
  ["05", "Connected back office", "Move from quote to schedule, crew, payment, review and recurring work without rebuilding the record.", "/features/back-office", "RUN THE WORK"],
];

const included = [
  ["Quotes + e-sign", "Itemized proposals, optional upgrades and clear approvals."],
  ["Scheduling", "Arrival windows, capacity and the details needed to keep the promise."],
  ["Crew + labor", "Assignments, time clock, hours and estimated pay."],
  ["Payments", "Deposits, balances and payment plans through Stripe."],
  ["Recurring work", "Automatic visits, saved cards and predictable revenue."],
  ["Cash flow", "See customer money, payroll and bills before they move."],
  ["Customer communication", "Two-way texts and a job-specific client portal."],
  ["Reviews + growth", "Follow-ups, review requests and AI-assisted marketing."],
];

export default function FeaturesPage() {
  return (
    <main className={`${styles.root} inner-site feature-index-page`}>
      <a className="skip-link" href="#main-content">Skip to content</a><SiteHeader />
      <section className="index-hero" id="main-content"><p className="eyebrow"><span>✦</span> THE FULL CONTRACTOR SUITE</p><h1>One system for the first click, <em>the final payment and everything between.</em></h1><p>Your website, leads, quotes, schedule, crew, customer communication and money share one connected workflow—with no monthly subscription.</p><div className="hero-actions"><a className="button primary" href="https://app.letsgetquoted.com/">Build my free site <span>→</span></a><a className="button secondary" href="#flagship-index">Explore the suite</a></div>
        <div className="system-pipeline" aria-label="One job moving through five connected stages">
          <div className="system-pipeline-head"><span><i /> LIVE JOB WORKFLOW</span><small>ONE CUSTOMER RECORD · START TO FINISH</small></div>
          <div className="system-pipeline-track">
            <div className="system-flow-line"><i /></div>
            <article className="complete"><span>01</span><small>WEBSITE</small><b>Request received</b><em>✓ CAPTURED</em></article>
            <article className="complete"><span>02</span><small>INTAKE</small><b>High-value fit</b><em>✓ QUALIFIED</em></article>
            <article className="complete"><span>03</span><small>QUOTE</small><b>$4,250 approved</b><em>✓ WON</em></article>
            <article className="active"><span>04</span><small>SCHEDULE</small><b>Tuesday · 9–11</b><em>IN PROGRESS</em></article>
            <article><span>05</span><small>PAYMENT</small><b>Ready after work</b><em>NEXT</em></article>
          </div>
          <div className="system-job-record"><span>JOB #1048</span><b>Kitchen lighting upgrade</b><small>Alex Morgan · Royal Oak</small></div>
        </div>
      </section>
      <section className="flagship-index" id="flagship-index"><div className="index-heading"><p className="eyebrow"><span>✦</span> FIVE CONNECTED ADVANTAGES</p><h2>Each feature is useful alone.<br /><em>Together, they change the business.</em></h2></div><div className="feature-link-grid">{flagships.map(([number,title,body,href,kicker]) => <a href={href} key={title}><span>{number}</span><small>{kicker}</small><h3>{title}</h3><p>{body}</p><b>Explore feature →</b></a>)}</div></section>
      <section className="everything-index"><div className="index-heading"><p className="eyebrow"><span>✦</span> EVERYTHING BEHIND THE WEBSITE</p><h2>The operational tools are already included.</h2><p>No separate starter tier. No choosing which essential workflow you can afford this month.</p></div><div className="everything-grid">{included.map(([title,body],index) => <article key={title}><span>{String(index+1).padStart(2,"0")}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <PageCTA title="Start with the website. Grow into the whole system." />
      <SiteFooter />
    </main>
  );
}
