'use client';

import { useState } from 'react';
// The pure module, deliberately — importing this from @/lib/campaigns drags the
// Supabase server client into the browser bundle and fails the build.
import { AUDIENCE_DEFS, type Campaign } from '@/lib/campaign-audiences';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function audienceLabel(id: string): string {
  return AUDIENCE_DEFS.find((audience) => audience.id === id)?.label ?? id;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * What you've already sent — and a way to send it again.
 *
 * The list used to be read-only, and it used the message body as the row title
 * when there was no subject, so the one thing you could not do was read what
 * you sent. Reusing last spring's message is what people actually do with a
 * send history; retyping it from memory is what they did instead.
 */
export default function CampaignHistory({
  campaigns,
  onReuse,
}: {
  campaigns: Campaign[];
  /** Absent when there's nobody to send to — then this is a plain record. */
  onReuse?: (draft: CampaignDraft) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">History</p>
      </div>

      {campaigns.length === 0 ? (
        <p className="empty-state">No campaigns sent yet. Your past sends will be listed here.</p>
      ) : (
        <div className="campaign-history">
          {campaigns.map((campaign) => {
            const open = openId === campaign.id;
            const title = campaign.subject || campaign.body.slice(0, 80);
            return (
              <div key={campaign.id} className={`campaign-history-row${open ? ' is-open' : ''}`}>
                <div className="campaign-history-main">
                  <button
                    type="button"
                    className="campaign-history-title"
                    aria-expanded={open}
                    aria-controls={open ? `campaign-detail-${campaign.id}` : undefined}
                    onClick={() => setOpenId(open ? null : campaign.id)}
                  >
                    <strong>{title}</strong>
                  </button>
                  <span className="campaign-history-meta">
                    {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · {audienceLabel(campaign.audience)} ·{' '}
                    {formatDate(campaign.created_at)}
                  </span>
                </div>
                <div className="campaign-history-stats">
                  {campaign.email_sent > 0 ? (
                    <span className="campaign-stat"><strong>{campaign.email_sent}</strong> email sent</span>
                  ) : null}
                  {campaign.sms_sent > 0 ? (
                    <span className="campaign-stat"><strong>{campaign.sms_sent}</strong> {campaign.sms_sent === 1 ? 'text' : 'texts'} queued</span>
                  ) : null}
                  {campaign.skipped_count > 0 ? <span className="muted">{campaign.skipped_count} skipped</span> : null}
                  {campaign.failed_count > 0 ? <span className="campaign-stat-fail">{campaign.failed_count} failed</span> : null}
                </div>

                {open ? (
                  <div id={`campaign-detail-${campaign.id}`} className="campaign-history-body">
                    {campaign.subject ? <strong>{campaign.subject}</strong> : null}
                    {campaign.body.split(/\n{2,}/).map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                    {onReuse ? (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() =>
                          onReuse({
                            channel: 'email',
                            audience: campaign.audience,
                            subject: campaign.subject ?? '',
                            // Alternatives belong to a fresh draft, not to
                            // something already sent.
                            subjectOptions: [],
                            body: campaign.body,
                            // Deliberately NOT carrying the original topic
                            // across. Reusing the words is the contractor's
                            // choice; recording it as another send of the same
                            // seasonal topic is a claim about intent that a
                            // "use as a template" click doesn't make.
                            beatId: '',
                          })
                        }
                      >
                        Use as a template
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
