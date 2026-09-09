import Image from 'next/image';
import Link from 'next/link';
import { Moon, Phone, Sun } from 'lucide-react';
import styles from './receptionist-coverage.module.css';

export function ReceptionistArtwork({ priority = false }: { priority?: boolean }) {
  return (
    <figure className={styles.artwork}>
      <Image
        src="/images/ai-receptionist/coverage.webp"
        alt="A contractor enjoying an evening at home and working at a job site during the day."
        width={1672}
        height={941}
        sizes="(max-width: 800px) 100vw, 50vw"
        priority={priority}
      />
      <figcaption className={styles.imageLabels}>
        <span><Moon size={15} aria-hidden="true" /> After hours</span>
        <span><Sun size={15} aria-hidden="true" /> Full time</span>
      </figcaption>
      <div className={styles.callStatus}>
        <Phone size={18} aria-hidden="true" />
        <div><strong>Your AI receptionist is answering</strong><span>“Thanks for calling. How can I help?”</span></div>
        <i aria-hidden="true" />
      </div>
    </figure>
  );
}

export function ReceptionistCoverageOptions() {
  return (
    <section className={styles.coverage} id="coverage" aria-labelledby="coverage-title">
      <div className={styles.sectionHead}>
        <p className={styles.eyebrow}>YOU CHOOSE WHEN AI ANSWERS</p>
        <h2 id="coverage-title">A little backup. Or your full-time front desk.</h2>
        <p>Choose your coverage in setup. Change it as your business changes.</p>
      </div>
      <div className={styles.options}>
        <article>
          <Moon size={27} aria-hidden="true" />
          <h3>After-hours only</h3>
          <p>You take calls during business hours. When you close, your AI receptionist takes over.</p>
          <ul><li>Use your business hours and time zone</li><li>Capture requests while you’re off duty</li><li>Review the conversation when you’re ready</li></ul>
        </article>
        <article>
          <Sun size={27} aria-hidden="true" />
          <h3>Full-time receptionist</h3>
          <p>Let AI answer incoming customer calls throughout the day and night, while you focus on the work.</p>
          <ul><li>Greet callers using your business name</li><li>Gather project details and callback preferences</li><li>Keep the conversation with the customer record</li></ul>
        </article>
      </div>
      <p className={styles.note}>Both modes use your available AI call capacity. If all slots are busy, calls follow your forwarding setup.</p>
    </section>
  );
}

export function ReceptionistHomeSection() {
  return (
    <section className={styles.homeSection} id="ai-receptionist" aria-labelledby="home-receptionist-title">
      <div className={styles.homeCopy}>
        <p className={styles.eyebrow}>AI RECEPTIONIST</p>
        <h2 id="home-receptionist-title">Your calls covered.<br /><em>Your way.</em></h2>
        <p>Choose after-hours support or a full-time receptionist. AI takes the call, gathers the details, and keeps you informed.</p>
        <div className={styles.coverageLabels}><span><Moon size={16} aria-hidden="true" /> After-hours only</span><span><Sun size={16} aria-hidden="true" /> Full-time receptionist</span></div>
        <Link className={styles.explore} href="/features/ai-voice">Explore coverage options <span aria-hidden="true">→</span></Link>
        <small>Activation depends on your plan and phone-line readiness.</small>
      </div>
      <ReceptionistArtwork />
    </section>
  );
}
