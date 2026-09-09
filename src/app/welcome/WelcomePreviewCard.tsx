'use client';

import { useMemo } from 'react';
import { TRADES } from '@/lib/trades';
import { getTradeGlyph } from '@/lib/site-content';
import ServiceIcon from '@/lib/templates/ServiceIcon';
import { firstRunFontVars } from '@/lib/templates/fonts';

export type WelcomePreviewCardProps = {
  businessName: string;
  tradeSlug: string;
  city?: string | null;
  resolvedPlace?: string | null;
};

export default function WelcomePreviewCard({
  businessName,
  tradeSlug,
  city = null,
  resolvedPlace = null,
}: WelcomePreviewCardProps) {
  const trade = useMemo(() => {
    return tradeSlug ? TRADES.find((t) => t.slug === tradeSlug) ?? null : null;
  }, [tradeSlug]);

  const glyph = useMemo(() => {
    return getTradeGlyph(trade?.name || tradeSlug || null);
  }, [trade, tradeSlug]);

  const trimmedName = businessName.trim();
  const displayCity = resolvedPlace || city || null;

  return (
    <aside
      className={`welcome-preview-card ${firstRunFontVars}`}
      aria-label="Website preview"
    >
      <div className="welcome-preview-header">
        <span className="welcome-preview-badge" aria-hidden="true">Preview</span>
        <div className="welcome-preview-mark" aria-hidden="true">
          <ServiceIcon name={glyph} className="welcome-preview-glyph" />
        </div>
      </div>

      <div className="welcome-preview-body">
        {trimmedName ? (
          <div className="welcome-preview-company" aria-hidden="true">
            {trimmedName}
          </div>
        ) : (
          <div className="welcome-preview-company welcome-preview-skeleton welcome-preview-skeleton-title" aria-hidden="true" />
        )}

        <div className="welcome-preview-meta">
          {trade ? (
            <span className="welcome-preview-trade-work" aria-hidden="true">
              Professional {trade.work}
            </span>
          ) : (
            <span className="welcome-preview-skeleton welcome-preview-skeleton-text" aria-hidden="true" />
          )}

          {displayCity ? (
            <span className="welcome-preview-city">
              Serving {displayCity}
            </span>
          ) : (
            <span className="welcome-preview-skeleton welcome-preview-skeleton-city" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="welcome-preview-footer" aria-hidden="true">
        <span className="welcome-preview-tagline">Generated from your business details</span>
      </div>
    </aside>
  );
}
