'use client';

import ActionIcon from '@/components/action-icon';
import type { TemplateCard } from '@/lib/campaign-recommendations';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

/**
 * Exactly 3 cards, chosen by campaign-recommendations.ts from real account
 * data. The outer card is a plain clickable div (mouse convenience only, not
 * in the tab order); the "Start campaign" button inside it is the one real
 * interactive element, so keyboard users land on it directly and its own
 * onClick stops propagation to avoid firing the card's handler twice.
 */
export default function RecommendedCampaigns({
  cards,
  onSelect,
}: {
  cards: TemplateCard[];
  onSelect: (draft: CampaignDraft) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <section className="panel workspace-section-card" aria-label="Recommended campaigns">
      <div className="section-heading workspace-section-heading compact-heading">
        <h2>Recommended for you</h2>
      </div>
      <div className="rec-grid">
        {cards.map((card) => (
          <div key={card.id} className="rec-card" onClick={() => (card.draft ? onSelect(card.draft) : undefined)}>
            <div className="rec-card-icon">
              <ActionIcon name={card.icon} />
            </div>
            <h3 className="rec-card-title">{card.title}</h3>
            <p className="rec-card-one-liner">{card.oneLiner}</p>
            <p className="rec-card-meta">
              {card.audienceLabel} · {card.channelLabel}
              {card.recipientCount !== null
                ? ` · ${card.recipientCount} recipient${card.recipientCount === 1 ? '' : 's'}`
                : ''}
            </p>
            {card.whyText ? <p className="rec-card-why">{card.whyText}</p> : null}
            <button
              type="button"
              className="btn primary rec-card-cta"
              aria-label={`Start campaign: ${card.title}`}
              onClick={(event) => {
                event.stopPropagation();
                if (card.draft) onSelect(card.draft);
              }}
            >
              Start campaign
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
