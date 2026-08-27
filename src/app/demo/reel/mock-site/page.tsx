import type { Metadata } from 'next';
import Image from 'next/image';
import BathToShowerReel from '@/components/demo/BathToShowerReel';
import styles from './mock-site.module.css';

export const metadata: Metadata = {
  title: "Let's Get Quoted | Bath-to-shower walkthrough",
  description: 'A mock product site showing how a contractor turns a bath lead into a booked job.',
  robots: { index: false, follow: false },
};

const workflowSteps = [
  {
    number: '01',
    title: 'The lead arrives with context',
    copy: 'Customer photos, job type, budget, and timing land together—ready to scope.',
  },
  {
    number: '02',
    title: 'The scope becomes a price',
    copy: 'Build the line items, protect the margin, and present one clear project total.',
  },
  {
    number: '03',
    title: 'The customer sees the outcome',
    copy: 'Send a visual quote that connects the price to the bathroom they want.',
  },
  {
    number: '04',
    title: 'The deposit books the job',
    copy: 'Approval, payment, and the final-measure appointment happen in the same flow.',
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
            <span className={styles.eyebrow}>32-SECOND PRODUCT WALKTHROUGH</span>
            <h1>Show the job. Send the price. Book the work.</h1>
            <p className={styles.heroLead}>
              Watch a bath-to-shower lead become an $8,100 quote, an $810 deposit,
              and a booked project—without a spreadsheet or a round of phone tag.
            </p>

            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#reel">Watch the walkthrough <span>▶</span></a>
              <a className={styles.textLink} href="#workflow">See the workflow <span>↓</span></a>
            </div>

            <div className={styles.proofRow} aria-label="Walkthrough outcomes">
              <span><b>4 min</b> quote built</span>
              <span><b>$810</b> deposit collected</span>
              <span><b>1 flow</b> lead to schedule</span>
            </div>
          </div>

          <div className={styles.reelColumn} id="reel">
            <div className={styles.reelHeader}>
              <div>
                <span>REAL JOB FLOW</span>
                <strong>Bath-to-shower conversion</strong>
              </div>
              <span className={styles.duration}>00:32</span>
            </div>
            <BathToShowerReel variant="embed" autoplay={false} />
            <p className={styles.reelNote}>
              Press play when you are ready. The walkthrough pauses when it leaves the screen.
            </p>
          </div>
        </section>

        <section className={styles.signalStrip} aria-label="Product promises">
          <span>Lead context included</span>
          <i />
          <span>Margin visible to you</span>
          <i />
          <span>Customer-ready quote</span>
          <i />
          <span>Deposit and schedule connected</span>
        </section>

        <section className={styles.workflowSection} id="workflow">
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>ONE CONTINUOUS STORY</span>
            <h2>The embed earns its space because every scene moves the job forward.</h2>
            <p>
              No dashboard tour. No feature dump. One believable contractor moment from
              the first notification to money in the account.
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
            <span className={styles.eyebrow}>SELL THE OUTCOME</span>
            <h2>A quote should make the finished job feel real.</h2>
            <p>
              Customers are not buying line items. They are buying safer access, easier
              cleaning, and a bathroom that works. The visual proposal keeps that outcome
              next to the scope and price.
            </p>
            <blockquote>
              “The customer understood the job before I ever had to explain the estimate.”
              <cite>— Mock remodeler testimonial</cite>
            </blockquote>
          </div>
        </section>

        <section className={styles.quoteSection} id="start">
          <div>
            <span className={styles.eyebrow}>FROM LEAD TO BOOKED</span>
            <h2>Your next quote can look this clear.</h2>
            <p>Bring the photos. Set the price. Let the customer say yes.</p>
          </div>
          <a className={styles.quoteButton} href="#reel">Replay the 32-second flow <span>↗</span></a>
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
