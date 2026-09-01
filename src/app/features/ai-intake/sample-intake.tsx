'use client';

import { useId, useState, type ReactNode } from 'react';
import styles from './ai-intake.module.css';

/**
 * "WATER HEATER BROKEN" BECOMES A JOB YOU CAN QUOTE.
 *
 * The hero showed the finished brief — the useful end of Smart Intake, and the
 * half a visitor is least able to evaluate. A brief that good invites exactly
 * one question, which is "how would it know any of that", and a static card
 * cannot answer it. This walks the three states out loud: what the homeowner
 * typed, what the intake asked back, and what the contractor ended up with.
 *
 * NOT A LIVE INTAKE. Nothing here calls the model or posts anywhere — the
 * follow-up questions are the ones a plumbing request actually gets, and the
 * answers are fixed, because a demo that let you type would be answering with
 * a fake model and pretending otherwise. The frame says so.
 *
 * THREE STEPS, NOT AN ANIMATION. It advances when somebody asks it to: no
 * autoplay, no timer, and every state reachable by keyboard. The final step
 * renders `children`, which is the same brief card the page already had, so
 * the payoff is the real markup rather than a second copy of it.
 */

type Answer = { q: string; a: string };

/* The follow-ups a no-hot-water request actually draws: what kind of unit,
   how old, and whether it is leaking — the three that decide whether this is a
   part, a repair or a replacement, and therefore what it is worth. */
const FOLLOW_UPS: Answer[] = [
  { q: 'Is it a tank or a tankless heater?', a: '40-gallon tank, gas' },
  { q: 'Roughly how old is the unit?', a: 'About 12 years' },
  { q: 'Any water on the floor around it?', a: 'Yes — small puddle since this morning' },
];

const STEPS = ['What they typed', 'What it asked back', 'What you get'] as const;

export default function SampleIntake({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(0);
  const headingId = useId();
  const last = STEPS.length - 1;

  return (
    <div className={styles.sample} id="sample-intake">
      {/* A group rather than a tablist: this is one thing at three moments, in
          order, and tabs would say the three are alternatives. */}
      <ol className={styles.sampleRail} aria-label="Steps of a sample intake">
        {STEPS.map((label, i) => (
          <li key={label} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>
            <span aria-hidden="true">{i + 1}</span>
            {label}
            {i === step ? <em className={styles.srOnly}> (showing)</em> : null}
          </li>
        ))}
      </ol>

      {/* aria-live, because pressing the button changes the panel underneath it
          rather than moving anywhere — without this a screen reader is told
          nothing happened. */}
      <div className={styles.sampleBody} aria-live="polite">
        <h2 className={styles.srOnly} id={headingId}>
          {STEPS[step]}
        </h2>

        {step === 0 ? (
          <div className={styles.sampleTyped}>
            <span className={styles.sampleLabel}>The homeowner writes</span>
            <p className={styles.sampleQuote}>“Water heater broken”</p>
            <p className={styles.sampleAside}>
              Two words. On a contact form that is the whole lead — a name, a number and
              something you will have to ring back to understand.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <dl className={styles.sampleQa}>
            {FOLLOW_UPS.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
            <p className={styles.sampleAside}>
              Three questions, chosen for a water heater rather than for contractors in
              general — and asked while the homeowner is still on the page.
            </p>
          </dl>
        ) : null}

        {step === last ? <div className={styles.sampleBrief}>{children}</div> : null}
      </div>

      <div className={styles.sampleActions}>
        <button
          type="button"
          className={styles.sampleBack}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.sampleNext}
          onClick={() => setStep((s) => (s === last ? 0 : s + 1))}
        >
          {step === 0 ? 'See what it asks' : step === 1 ? 'See what you get' : 'Start again'}
          <span aria-hidden="true">{step === last ? ' ↺' : ' →'}</span>
        </button>
      </div>
    </div>
  );
}
