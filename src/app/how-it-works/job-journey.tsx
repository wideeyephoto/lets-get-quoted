'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The hero graphic: one job record moving through five stages, gaining
 * something at each.
 *
 * The page's whole claim is that nothing is re-keyed between stages. A list of
 * five headings asserts that; a record that visibly ACCUMULATES shows it. Each
 * node the pulse passes attaches another chip to the card and none of them ever
 * come off, so "no broken handoffs" is the shape of the graphic rather than a
 * sentence next to it.
 *
 * MOTION. It plays once, when it first comes into view, and stops. A loop next
 * to a headline competes with reading the headline, and this sits directly
 * under the h1. Under prefers-reduced-motion it renders the finished state
 * immediately — which is also the state it renders without JavaScript, because
 * the useState default is the last step rather than the first. Nothing here is
 * hidden until a script runs.
 */

const NODES = [
  { num: '01', label: 'Website' },
  { num: '02', label: 'Qualified lead' },
  { num: '03', label: 'Approved quote' },
  { num: '04', label: 'Scheduled job' },
  { num: '05', label: 'Paid + review' },
];

/** What the record is carrying by the time it leaves each node. */
const CHIPS = [
  { label: 'Photos + scope', hand: 'homeowner' },
  { label: 'Lead score', hand: 'auto' },
  { label: 'Quote + signature', hand: 'you' },
  { label: 'Date + crew', hand: 'homeowner' },
  { label: 'Payment + review', hand: 'auto' },
];

const DONE = NODES.length;

export default function JobJourney() {
  // Starts finished. A visitor with no JS, or with reduced motion, sees the
  // complete record rather than an empty one.
  const [step, setStep] = useState(DONE);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        setStep(0);
        // One frame at zero so the reset paints before the run begins.
        requestAnimationFrame(() => {
          timer = setInterval(() => {
            setStep((s) => {
              if (s >= DONE) {
                if (timer) clearInterval(timer);
                return DONE;
              }
              return s + 1;
            });
          }, 780);
        });
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  }, []);

  return (
    <div className="hiw-journey" ref={ref} data-step={step} aria-hidden="true">
      <div className="hiw-track">
        <span className="hiw-rail">
          <i style={{ transform: `scaleX(${step / DONE})` }} />
        </span>
        <ol className="hiw-nodes">
          {NODES.map((node, i) => (
            <li key={node.num} className="hiw-node" data-on={i < step ? 'true' : 'false'}>
              <span className="hiw-node-dot" />
              <small>{node.num}</small>
              <b>{node.label}</b>
            </li>
          ))}
        </ol>
      </div>

      <div className="hiw-record-card">
        <div className="hiw-record-head">
          <span className="hiw-record-id">JOB #1048</span>
          <em>Kitchen ceiling · Royal Oak</em>
        </div>
        <ul className="hiw-record-chips">
          {CHIPS.map((chip, i) => (
            <li key={chip.label} data-hand={chip.hand} data-on={i < step ? 'true' : 'false'}>
              {chip.label}
            </li>
          ))}
        </ul>
        <p className="hiw-record-foot">
          Nothing above was typed twice.
        </p>
      </div>
    </div>
  );
}

/**
 * The legend. Three colours, used the same way on every graphic on this page.
 *
 * This is what is left of the "How to read this" block — four definition cards
 * and a heading, ahead of any content, explaining a table the visitor had not
 * reached yet. The distinction it was making is worth keeping; a paragraph of
 * scaffolding before the story is not.
 */
export function JourneyLegend() {
  return (
    <ul className="hiw-legend">
      <li data-hand="homeowner"><i /> The homeowner</li>
      <li data-hand="you"><i /> You or your crew</li>
      <li data-hand="auto"><i /> Nobody — it happens on its own</li>
    </ul>
  );
}
