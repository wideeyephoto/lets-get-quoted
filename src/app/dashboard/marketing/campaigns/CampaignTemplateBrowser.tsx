'use client';

import ActionIcon from '@/components/action-icon';
import type { TemplateCard } from '@/lib/campaign-recommendations';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

const RAIL_LIMIT = 4;

function TemplateTile({ card, onSelect }: { card: TemplateCard; onSelect: (draft: CampaignDraft) => void }) {
  const disabled = card.disabledReason !== null;
  return (
    <button
      type="button"
      className={`template-card${disabled ? ' is-disabled' : ''}`}
      disabled={disabled}
      onClick={() => (card.draft ? onSelect(card.draft) : undefined)}
    >
      <ActionIcon name={card.icon} />
      <span className="template-card-title">{card.title}</span>
      <span className="template-card-meta">
        {card.audienceLabel} · {card.channelLabel}
        {card.recipientCount !== null ? ` · ${card.recipientCount}` : ''}
      </span>
      {disabled ? <span className="template-disabled-reason">{card.disabledReason}</span> : null}
    </button>
  );
}

function TemplateRail({
  title,
  cards,
  onSelect,
}: {
  title: string;
  cards: TemplateCard[];
  onSelect: (draft: CampaignDraft) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="template-rail">
      <h3 className="template-rail-title">{title}</h3>
      <div className="template-grid">
        {cards.slice(0, RAIL_LIMIT).map((card, index) => (
          <TemplateTile key={`${card.id}-${index}`} card={card} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

/**
 * Everything below Recommended for You: two capped-at-4 rails plus a
 * <details> "View all templates" holding the full 11-item catalog. Disabled
 * templates stay visible with their disabledReason shown inline rather than
 * being hidden, so a contractor can see what unlocks them.
 */
export default function CampaignTemplateBrowser({
  quickWins,
  grow,
  all,
  onSelect,
}: {
  quickWins: TemplateCard[];
  grow: TemplateCard[];
  all: TemplateCard[];
  onSelect: (draft: CampaignDraft) => void;
}) {
  return (
    <section className="panel workspace-section-card" aria-label="Browse campaign templates">
      <div className="section-heading workspace-section-heading compact-heading">
        <h2>Browse templates</h2>
      </div>

      <TemplateRail title="Quick Wins" cards={quickWins} onSelect={onSelect} />
      <TemplateRail title="Grow Your Business" cards={grow} onSelect={onSelect} />

      <details className="workspace-details">
        <summary className="workspace-details-summary">View all templates</summary>
        <div className="template-grid">
          {all.map((card) => (
            <TemplateTile key={card.id} card={card} onSelect={onSelect} />
          ))}
        </div>
      </details>
    </section>
  );
}
