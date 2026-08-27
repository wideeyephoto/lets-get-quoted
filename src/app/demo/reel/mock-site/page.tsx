import type { Metadata } from 'next';
import Image from 'next/image';
import AiIntakeSlideshow from '@/components/demo/AiIntakeSlideshow';
import styles from './mock-site.module.css';

export const metadata: Metadata = {
  title: "Let's Get Quoted | AI intake slideshow",
  description: 'A mock product site showing the complete AI intake journey for a bath-to-shower lead.',
  robots: { index: false, follow: false },
};

const workflowSteps = [
  {
    number: '01',
    title: 'Capture every way they reach you',
    copy: 'Website, text, voice, photos, and video all land in one structured intake.',
  },
  {
    number: '02',
    title: 'Inspect before anyone calls back',
    copy: 'AI vision spots layout, equipment, issues, and the media details that matter.',
  },
  {
    number: '03',
    title: 'Ask fewer, smarter questions',
    copy: 'The intake skips what it can see and stops the moment it can price confidently.',
  },
  {
    number: '04',
    title: 'Transfer the trust—not just the lead',
    copy: 'A guarded ballpark creates confidence now; the full context lets the contractor own what happens next.',
  },
] as const;

export default function BathContractorMockSite() {
  return (
    <div className={styles.site} id="top">
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="Let's Get Quoted home">
          <span className={styles.brandMark}>LGQ</span>
          <span>
            <strong>LET&apos;S GET QUOTED</strong>
            <small>QUOTE FASTER. BOOK MORE.</small>
          </span>
        </a>

        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#walkthrough">Product</a>
          <a href="#workflow">How it works</a>
          <a href="#proof">Why it wins</a>
        </nav>

        <a className={styles.headerCta} href="#start">Start quoting</a>
      </header>

      <main>
        <section className={styles.hero} id="walkthrough">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>YOUR WEBSITE MAKES THE INTRODUCTION</span>
            <h1>Let AI impress. You build the relationship.</h1>
            <p className={styles.heroLead}>
              Your site listens, scopes, and gives a guarded ballpark while interest is high—then
              hands you a homeowner who already feels understood.
            </p>

            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#reel">Watch the 48-sec journey <span>▶</span></a>
              <a className={styles.textLink} href="#workflow">Why the estimate works <span>↓</span></a>
            </div>

            <div className={styles.proofRow} aria-label="Walkthrough outcomes">
              <span><b>50 ms</b> to form a first impression</span>
              <span><b>71%</b> expect personalization</span>
              <span><b>1 handoff</b> AI confidence to human trust</span>
            </div>
          </div>

          <div className={styles.reelColumn} id="reel">
            <div className={styles.reelHeader}>
              <div>
                <span>LIVE AI INTAKE · HOMEPAGE HERO CONCEPT</span>
                <strong>One lead—from first click to booked visit</strong>
              </div>
              <span className={styles.duration}>00:48</span>
            </div>
            <AiIntakeSlideshow autoStart />
            <p className={styles.reelNote}>
              The story advances automatically. Pause or use the arrows to explore any feature.
            </p>
          </div>
        </section>

        <section className={styles.signalStrip} aria-label="Product promises">
          <span>Voice, text, and web intake</span>
          <i />
          <span>Photo and video vision</span>
          <i />
          <span>Adaptive scoping questions</span>
          <i />
          <span>Guardrails and booking handoff</span>
        </section>

        <section className={styles.workflowSection} id="workflow">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>ONE CONTINUOUS STORY</span>
            <h2>Ten new intake wins. One homeowner journey.</h2>
            <p>
              The slideshow follows one bath-to-shower request from setup and first contact
              through visual analysis, a research-backed trust moment, lead priority, and booking.
            </p>
          </div>

          <div className={styles.workflowGrid}>
            {workflowSteps.map((step) => (
              <article key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.proofSection} id="proof">
          <div className={styles.projectVisual}>
            <figure>
              <Image
                src="/demo/bath-to-shower/before.png"
                alt="Bathroom before the bath-to-shower conversion"
                fill
                sizes="(max-width: 900px) 50vw, 30vw"
              />
              <span>LEAD PHOTO</span>
            </figure>
            <figure>
              <Image
                src="/demo/bath-to-shower/after.png"
                alt="Finished low-threshold walk-in shower"
                fill
                sizes="(max-width: 900px) 50vw, 30vw"
              />
              <span>PROPOSED RESULT</span>
            </figure>
          </div>

          <div className={styles.proofCopy}>
            <span className={styles.eyebrow}>SEE MORE BEFORE THE CALLBACK</span>
            <h2>The AI sees more than a photo.</h2>
            <p>
              Photos and video become a visual summary, detected equipment, observed issues,
              a supply-house pick list, safety flags, urgency, and confidence—grounded only
              in what the customer actually sent.
            </p>
            <blockquote>
              “The estimate is the first useful answer—not the final promise. It earns attention,
              then gives the contractor everything needed to make the next interaction personal.”
              <cite>— The trust-transfer strategy</cite>
            </blockquote>
          </div>
        </section>

        <section className={styles.quoteSection} id="start">
          <div>
            <span className={styles.eyebrow}>FROM LEAD TO BOOKED</span>
            <h2>Let the technology impress. Let the contractor connect.</h2>
            <p>Ten slides. One trust-building journey from first impression to booked visit.</p>
          </div>
          <a className={styles.quoteButton} href="#reel">Replay all 10 slides <span>↗</span></a>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>LGQ</span>
          <span><strong>LET&apos;S GET QUOTED</strong><small>MOCK PRODUCT EXPERIENCE</small></span>
        </div>
        <p>Built for contractors who would rather quote the work than chase the paperwork.</p>
      </footer>
    </div>
  );
}
