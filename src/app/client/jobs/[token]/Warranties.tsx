'use client';

import { useState, useTransition } from 'react';
import type { ClientWarranty } from '@/lib/warranties';
import { raiseWarrantyClaimAction } from './warranty-actions';

/**
 * What's covered, for how long, and one tap to say something's gone wrong.
 *
 * The claim button stays on an EXPIRED warranty. Somebody whose sealant failed
 * three weeks out of cover should be able to ask — a contractor who wants the
 * work, or who knows it's a genuine defect, will often say yes. Hiding it
 * decides on the contractor's behalf and costs them both the conversation.
 */
export default function Warranties({ token, warranties }: { token: string; warranties: ClientWarranty[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (warranties.length === 0) return null;

  return (
    <section className="panel workspace-section-card client-warranties">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">After the work</p>
        <h2>Your cover</h2>
      </div>

      <div className="client-warranty-list">
        {warranties.map((warranty) => (
          <article key={warranty.id} className={`client-warranty status-${warranty.status}`}>
            <div className="client-warranty-head">
              <strong>{warranty.title}</strong>
              <span className="client-warranty-status">{warranty.statusLabel}</span>
            </div>
            <p className="client-warranty-dates">
              From {warranty.startsOn}
              {warranty.endsOn ? ` to ${warranty.endsOn}` : ''} · {warranty.remainingLabel}
            </p>

            {warranty.covers ? (
              <p className="client-warranty-covers">
                <strong>Covered:</strong> {warranty.covers}
              </p>
            ) : null}
            {/* Shown as prominently as the inclusions. A warranty that only
                lists what's covered is one that gets argued about at the first
                thing that isn't. */}
            {warranty.excludes ? (
              <p className="client-warranty-excludes">
                <strong>Not covered:</strong> {warranty.excludes}
              </p>
            ) : null}

            {warranty.maintenanceNotes ? (
              <p className="client-warranty-maintenance">
                <strong>Looking after it:</strong> {warranty.maintenanceNotes}
              </p>
            ) : null}
            {warranty.serviceDueLabel ? <p className="client-warranty-service">{warranty.serviceDueLabel}</p> : null}
            {warranty.documentCount > 0 ? (
              <p className="client-warranty-docs">
                {warranty.documentCount} manufacturer document{warranty.documentCount === 1 ? '' : 's'} on file — ask us
                for a copy any time.
              </p>
            ) : null}

            {done === warranty.id ? (
              <p className="client-warranty-done">
                Sent. We&apos;ve got it and we&apos;ll be in touch — you don&apos;t need to chase.
              </p>
            ) : open === warranty.id ? (
              <form
                className="client-warranty-form"
                action={(formData) => {
                  setError(null);
                  startTransition(async () => {
                    const result = await raiseWarrantyClaimAction(token, warranty.id, formData);
                    if (result.ok) {
                      setDone(warranty.id);
                      setOpen(null);
                    } else {
                      setError(result.message ?? 'Could not send that. Give us a call instead.');
                    }
                  });
                }}
              >
                <label htmlFor={`claim-${warranty.id}`}>What&apos;s gone wrong?</label>
                <textarea
                  id={`claim-${warranty.id}`}
                  name="description"
                  rows={3}
                  required
                  maxLength={2000}
                  placeholder="There's a damp patch on the ceiling under the new roof, about a foot across, worse after rain."
                />
                <div className="client-warranty-actions">
                  <button type="submit" className="btn primary" disabled={pending}>
                    {pending ? 'Sending…' : 'Send to your contractor'}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setOpen(null)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : warranty.canClaim ? (
              <div className="client-warranty-actions">
                <button type="button" className="btn secondary" onClick={() => setOpen(warranty.id)}>
                  Something&apos;s gone wrong
                </button>
                {warranty.status === 'expired' ? (
                  <small>Your cover has ended, but you can still ask — they&apos;ll tell you where you stand.</small>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {error ? <p className="client-warranty-error">{error}</p> : null}
    </section>
  );
}
