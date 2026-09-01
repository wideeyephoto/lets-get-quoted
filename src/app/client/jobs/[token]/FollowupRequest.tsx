'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { requestJobFollowupAction } from './actions';

type FollowupRequestProps = {
  token: string;
  businessName: string;
  bookingPath?: string | null;
  phone?: string | null;
  hasWarranties: boolean;
  isComplete: boolean;
};

export default function FollowupRequest({
  token,
  businessName,
  bookingPath,
  phone,
  hasWarranties,
  isComplete,
}: FollowupRequestProps) {
  const [open, setOpen] = useState<'followup' | 'more_work' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // If the job is not complete and there are no warranties, we keep the page focused on active work.
  if (!isComplete && !hasWarranties) return null;

  return (
    <section className="panel workspace-section-card client-followup-card" id="after-the-work">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Looking ahead</p>
        <h2>{hasWarranties ? 'Follow-up & next steps' : 'After the work'}</h2>
      </div>

      <p className="workspace-card-copy">
        {hasWarranties
          ? `Need a check-in, have a question, or planning your next project with ${businessName}?`
          : `Everything we've done is on file. Let ${businessName} know if you need a follow-up visit, maintenance check, or more work.`}
      </p>

      {done ? (
        <div className="client-warranty-done" style={{ marginTop: '1rem' }}>
          <p>{done}</p>
        </div>
      ) : open ? (
        <form
          className="client-warranty-form"
          style={{ marginTop: '1rem' }}
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              formData.set('category', open);
              const result = await requestJobFollowupAction(token, formData);
              if (result.ok) {
                setDone(
                  open === 'more_work'
                    ? `Thank you! ${businessName} has received your request for more work and will be in touch soon.`
                    : `Sent. ${businessName} has received your follow-up request and will follow up shortly.`
                );
                setOpen(null);
              } else {
                setError(result.message ?? 'Could not send request. Please try calling instead.');
              }
            });
          }}
        >
          <label htmlFor="followup-desc">
            {open === 'more_work'
              ? 'Tell us what you’d like to get quoted next'
              : 'What can we help you with?'}
          </label>
          <textarea
            id="followup-desc"
            name="description"
            rows={3}
            required
            maxLength={2000}
            placeholder={
              open === 'more_work'
                ? 'We would like to get an estimate for the backyard patio / next room / seasonal service…'
                : 'We’d like a quick check-in or have a question about the completed work…'
            }
          />

          <div style={{ marginTop: '0.65rem' }}>
            <label htmlFor="followup-photos" style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
              Attach photos or video (optional, up to 3 files)
            </label>
            <input
              id="followup-photos"
              name="photos"
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ fontSize: '0.85rem' }}
            />
            <small style={{ display: 'block', color: 'var(--muted, #666)', marginTop: '0.25rem' }}>
              JPG, PNG, WebP, or short MP4/MOV videos up to 10 MB each.
            </small>
          </div>

          <div className="client-warranty-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? 'Sending…' : open === 'more_work' ? 'Send request for new work' : 'Send follow-up request'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(null)} disabled={pending}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="actions workspace-actions" style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {bookingPath ? (
            <Link className="btn primary" href={bookingPath}>
              Book your next project
            </Link>
          ) : (
            <button type="button" className="btn primary" onClick={() => setOpen('more_work')}>
              Request more work
            </button>
          )}

          <button type="button" className="btn secondary" onClick={() => setOpen('followup')}>
            Request a follow-up
          </button>

          {phone ? (
            <a className="btn ghost" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
              Call {businessName}
            </a>
          ) : null}
        </div>
      )}

      {error ? <p className="client-warranty-error">{error}</p> : null}
    </section>
  );
}
