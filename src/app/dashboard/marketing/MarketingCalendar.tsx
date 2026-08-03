'use client';

import { useState, useTransition } from 'react';
import { AUDIENCE_LABEL, CHANNEL_LABEL, CLIMATE_LABEL, SMS_EXCLUSION_NOTE, type Audience, type Channel } from '@/lib/marketing-calendar';
import type { MarketingDraft } from '@/lib/marketing-draft';
import { draftMarketingAction, type CalendarView } from './actions';

/**
 * The months ahead, and what's worth saying in them.
 *
 * Every draft here is a draft. There is no send button on this page, and that's
 * deliberate: sending goes through the campaign machinery, which has the
 * unsubscribe list, the postal address and the suppression rules that make a
 * marketing email lawful. Shortcutting that from here would be the fastest way
 * to get a contractor's domain blocked.
 */
export default function MarketingCalendar({ view }: { view: CalendarView }) {
  const [drafts, setDrafts] = useState<Record<string, MarketingDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function write(beatId: string, channel: Channel) {
    setBusy(beatId);
    setErrors((current) => ({ ...current, [beatId]: '' }));
    startTransition(async () => {
      const result = await draftMarketingAction(beatId, channel);
      if (result.ok) setDrafts((current) => ({ ...current, [beatId]: result.draft }));
      else setErrors((current) => ({ ...current, [beatId]: result.message }));
      setBusy(null);
    });
  }

  return (
    <>
      <p className="marketing-context">
        Timed for <strong>{CLIMATE_LABEL[view.zone].toLowerCase()}</strong>
        {view.state ? ` (${view.state})` : ''}
        {view.trade ? ` and ${view.trade.toLowerCase()}` : ''}.
        {/* Said out loud rather than assumed. A contractor in Phoenix being
            offered furnace content should be able to see why. */}
        {!view.state ? (
          <> We couldn&apos;t work out your state from your mailing address, so this assumes four seasons — add it in Settings and the calendar shifts to match.</>
        ) : null}
      </p>

      {view.planned.length === 0 ? (
        <p className="empty-state">
          Nothing seasonal for your trade in the next few months. That&apos;s a real answer, not an empty one — a
          calendar that invents something for every month is a calendar of things nobody needed to read.
        </p>
      ) : (
        <div className="marketing-list">
          {view.planned.map((entry) => {
            const draft = drafts[entry.beatId];
            const error = errors[entry.beatId];
            const working = pending && busy === entry.beatId;
            return (
              <article key={`${entry.beatId}-${entry.monthName}`} className="marketing-beat">
                <header className="marketing-beat-head">
                  <div>
                    <span className="marketing-month">{entry.monthName}</span>
                    <strong>{entry.title}</strong>
                  </div>
                  <span className="marketing-beat-meta">
                    {CHANNEL_LABEL[entry.channel]} · {AUDIENCE_LABEL[entry.audience as Audience]}
                  </span>
                </header>

                <p className="marketing-why">{entry.whyNow}</p>

                {draft ? (
                  <div className="marketing-draft">
                    <strong>{draft.subject}</strong>
                    {draft.body.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                    {draft.callToAction ? <p className="marketing-cta">{draft.callToAction}</p> : null}
                    <div className="marketing-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            [draft.subject, '', ...draft.body, '', draft.callToAction].join('\n'),
                          );
                          setCopied(entry.beatId);
                        }}
                      >
                        {copied === entry.beatId ? 'Copied ✓' : 'Copy it'}
                      </button>
                      <button type="button" className="btn ghost" onClick={() => write(entry.beatId, entry.channel)} disabled={working}>
                        {working ? 'Writing…' : 'Write another'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="marketing-actions">
                    <button type="button" className="btn secondary" onClick={() => write(entry.beatId, entry.channel)} disabled={working}>
                      {working ? 'Writing…' : '✨ Write it'}
                    </button>
                    {error ? <small className="marketing-error">{error}</small> : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* The reason there is no "text them" option, stated where somebody would
          go looking for it. */}
      <p className="marketing-sms-note">{SMS_EXCLUSION_NOTE}</p>
    </>
  );
}
