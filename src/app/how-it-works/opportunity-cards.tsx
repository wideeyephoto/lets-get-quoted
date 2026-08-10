'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * THE THREE REASONS A JOB DESERVES A LOOK.
 *
 * Three paper tickets, and the only thing the script does is answer the
 * question each one ends on. That answer is the whole argument of the page:
 * the decision is one tap and it is never "deal with this now or lose it" —
 * "Later" is a real, equal button, and saying so out loud is what makes the
 * alert bearable.
 *
 * This is a drawing of the product, not the product. Nothing here posts
 * anywhere; the confirmation line says what WOULD happen, in the words the app
 * itself uses, and the section carries its own "example" marker so the numbers
 * are never mistaken for a real customer's.
 *
 * Each card links out to the feature that does the ranking, because a claim
 * this specific ("phone verified", "inside your service area") should be one
 * click from the page that explains how it is decided.
 */

type Choice = 'now' | 'later';

type Opportunity = {
  id: string;
  /** Wording on the badge, and the tone of the whole card. */
  kind: 'value' | 'quick' | 'followup';
  badge: string;
  /** What the number underneath actually is — the three cards do not measure the same thing. */
  valueLabel: string;
  value: string;
  title: string;
  location: string;
  /** The mark in front of each reason. Carries the card's colour, so it is not decoration. */
  mark: string;
  reasons: string[];
  link: { href: string; label: string };
  /** The question the card ends on, in the contractor's own terms. */
  question: string;
  /** The affirmative button. "Respond now" is wrong for a stop you have not seen yet. */
  primary: string;
  /** What each answer does. Present tense, because the app does it immediately. */
  said: Record<Choice, string>;
};

const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'panel',
    kind: 'value',
    badge: 'High value',
    valueLabel: 'Estimated job value',
    value: '$8,600',
    title: '200A panel upgrade + EV charger',
    location: 'Royal Oak · 4.2 miles away',
    mark: '✓',
    reasons: ['Phone verified', 'Ready within 30 days', 'Inside your service area'],
    link: { href: '/features/ai-intake', label: 'How AI Smart Intake ranks leads' },
    question: 'Want this one?',
    primary: 'Respond now',
    said: {
      now: 'Opened. The request, the photos and the homeowner’s answers are on one screen.',
      later: 'Saved. It stays at the top of your queue and we’ll bring it back this evening.',
    },
  },
  {
    id: 'quickstop',
    kind: 'quick',
    badge: '⚡ Quick stop',
    valueLabel: 'Paid priority visit',
    value: '$175',
    title: 'No-hot-water priority visit',
    location: '0.8 miles from today’s route',
    mark: '⚡',
    reasons: [
      'Customer pays before it’s booked',
      'Fits between 2:00 and 3:30',
      'Inside your 2-mile detour limit',
    ],
    link: { href: '/features/quick-stops', label: 'Explore Quick Stops' },
    question: 'Add it to your route?',
    primary: 'Review stop',
    said: {
      now: 'Opened. You see the address, the window and the fee before you accept it.',
      later: 'Declined for today. The fee is never charged unless you take the stop.',
    },
  },
  {
    id: 'followup',
    kind: 'followup',
    badge: 'Follow up',
    valueLabel: 'Estimated job value',
    value: '$3,250',
    title: 'Kitchen rewiring + recessed lighting',
    location: 'Birmingham · 6.7 miles away',
    mark: '↗',
    reasons: ['Quote viewed two days ago', 'Customer asked about timing', 'No reply since Tuesday'],
    link: { href: '/features/back-office', label: 'See the connected back office' },
    question: 'Bring this one back?',
    primary: 'Follow up',
    said: {
      now: 'Opened. The quote, the thread and every date already agreed are attached.',
      later: 'Snoozed. The quote stays live and we’ll remind you before it goes cold.',
    },
  },
];

function OpportunityCard({ item }: { item: Opportunity }) {
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <article className="hiq-ticket" data-kind={item.kind}>
      <div className="hiq-ticket-top">
        <span className="hiq-badge">{item.badge}</span>
        <span className="hiq-ticket-time">just now</span>
      </div>

      <span className="hiq-value-label">{item.valueLabel}</span>
      <strong className="hiq-value">{item.value}</strong>

      <h3>{item.title}</h3>
      <p className="hiq-location">
        <span aria-hidden="true">⌖</span> {item.location}
      </p>

      <ul className="hiq-reasons">
        {item.reasons.map((reason) => (
          <li key={reason}>
            <span aria-hidden="true">{item.mark}</span> {reason}
          </li>
        ))}
      </ul>

      <Link className="hiq-card-link" href={item.link.href}>
        {item.link.label} <span aria-hidden="true">→</span>
      </Link>

      <div className="hiq-ask">
        <span className="hiq-ask-q">{item.question}</span>
        {/* A group rather than bare buttons: the two answers are one control,
            and read on their own "Later" says nothing about what it defers. */}
        <div className="hiq-answers" role="group" aria-label={`${item.question} — ${item.title}`}>
          <button
            type="button"
            aria-pressed={choice === 'now'}
            data-selected={choice === 'now' ? 'true' : 'false'}
            onClick={() => setChoice('now')}
          >
            {item.primary}
          </button>
          <button
            type="button"
            className="hiq-later"
            aria-pressed={choice === 'later'}
            data-selected={choice === 'later' ? 'true' : 'false'}
            onClick={() => setChoice('later')}
          >
            Later
          </button>
        </div>
        {/* Rendered empty rather than mounted on demand, so a screen reader has
            the live region in the tree before the text arrives in it. */}
        <p className="hiq-said" role="status">
          {choice ? item.said[choice] : ''}
        </p>
      </div>
    </article>
  );
}

export default function OpportunityCards() {
  return (
    <div className="hiq-grid">
      {OPPORTUNITIES.map((item) => (
        <OpportunityCard key={item.id} item={item} />
      ))}
    </div>
  );
}
