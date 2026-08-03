import SaveButton from '@/components/save-button';
import ConfirmActionButton from './ConfirmActionButton';
import {
  serviceDue,
  todayKey,
  warrantyRemainingLabel,
  warrantyStatus,
  WARRANTY_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  type Warranty,
} from '@/lib/warranties';
import type { WarrantyClaim } from '@/lib/warranties-data';
import { addWarrantyDocumentAction, createWarrantyAction, deleteWarrantyAction, recordServiceAction } from './warranty-actions';

/**
 * Warranties on a job, and anything the customer has reported against them.
 *
 * Server component — this is a form and a list, and none of it needs to be
 * interactive before it's submitted.
 */
export default function WarrantyPanel({
  jobId,
  warranties,
  claims,
  defaultMonths,
}: {
  jobId: string;
  warranties: Warranty[];
  claims: WarrantyClaim[];
  defaultMonths: number;
}) {
  const today = todayKey();

  return (
    <div className="warranty-panel">
      {warranties.length === 0 ? (
        <p className="empty-state">
          No warranty on this job yet. Starting one is what a customer looks for in two years&apos; time — and what
          lets you say where they stand when they call.
        </p>
      ) : (
        <div className="warranty-list">
          {warranties.map((warranty) => {
            const status = warrantyStatus(warranty, today);
            const service = serviceDue(warranty, today);
            const own = claims.filter((claim) => claim.warrantyId === warranty.id);
            return (
              <article key={warranty.id} className={`warranty-card status-${status}`}>
                <header className="warranty-card-head">
                  <div>
                    <strong>{warranty.title}</strong>
                    <span className="warranty-status">{WARRANTY_STATUS_LABEL[status]}</span>
                  </div>
                  <span className="warranty-remaining">{warrantyRemainingLabel(warranty, today)}</span>
                </header>

                <p className="warranty-dates">
                  {warranty.startsOn}
                  {warranty.endsOn ? ` → ${warranty.endsOn}` : ' → no end date'}
                </p>
                {warranty.covers ? <p className="warranty-line"><strong>Covers:</strong> {warranty.covers}</p> : null}
                {warranty.excludes ? <p className="warranty-line"><strong>Excludes:</strong> {warranty.excludes}</p> : null}
                {warranty.maintenanceNotes ? (
                  <p className="warranty-line"><strong>Maintenance:</strong> {warranty.maintenanceNotes}</p>
                ) : null}

                {warranty.serviceIntervalMonths ? (
                  <div className={`warranty-service${service.overdue ? ' is-overdue' : ''}`}>
                    <span>
                      Serviced every {warranty.serviceIntervalMonths} months
                      {warranty.lastServiceOn ? ` · last on ${warranty.lastServiceOn}` : ' · never serviced'}
                      {service.label ? ` · ${service.label}` : ''}
                    </span>
                    <form action={recordServiceAction.bind(null, jobId, warranty.id)} className="warranty-service-form">
                      <input type="date" name="servicedOn" defaultValue={today} aria-label="Date serviced" />
                      <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Logged ✓">
                        Log a service
                      </SaveButton>
                    </form>
                  </div>
                ) : null}

                {/* The manufacturer's paperwork — the document that gets asked
                    for years later and that nobody can ever find, because it
                    went home in a folder that went in a drawer. */}
                <form action={addWarrantyDocumentAction.bind(null, jobId, warranty.id)} className="warranty-doc-form">
                  <span>
                    {warranty.documentPaths.length > 0
                      ? `${warranty.documentPaths.length} document${warranty.documentPaths.length === 1 ? '' : 's'} on file`
                      : 'No manufacturer paperwork on file'}
                  </span>
                  <input type="file" name="documents" accept="image/*" multiple aria-label="Manufacturer documents" />
                  <SaveButton className="btn secondary" pendingLabel="Uploading…" savedLabel="Added ✓">
                    Attach
                  </SaveButton>
                </form>

                {own.length > 0 ? (
                  <ul className="warranty-claims">
                    {own.map((claim) => (
                      <li key={claim.id} className={`warranty-claim status-${claim.status}`}>
                        <div>
                          <strong>{CLAIM_STATUS_LABEL[claim.status]}</strong>
                          {/* Whether it was covered ON THE DAY THEY REPORTED IT.
                              Snapshotted at claim time, so a slow reply can't
                              retroactively push somebody out of warranty. */}
                          <span className={claim.inWarrantyAtClaim ? 'warranty-claim-in' : 'warranty-claim-out'}>
                            {claim.inWarrantyAtClaim ? 'In warranty when reported' : 'Cover had ended when reported'}
                          </span>
                        </div>
                        <p>{claim.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <ConfirmActionButton
                  action={deleteWarrantyAction.bind(null, jobId, warranty.id)}
                  confirmMessage={`Delete “${warranty.title}”?\n\nThe customer will stop seeing it on their job page.`}
                  className="btn ghost"
                  pendingLabel="Deleting…"
                  savedLabel="Deleted ✓"
                >
                  Delete
                </ConfirmActionButton>
              </article>
            );
          })}
        </div>
      )}

      <form action={createWarrantyAction.bind(null, jobId)} className="warranty-form">
        <div className="warranty-form-row">
          <div className="field">
            <label htmlFor="w-title">What&apos;s covered by this warranty</label>
            <input id="w-title" name="title" placeholder="Workmanship on the new roof" required />
          </div>
          <div className="field">
            <label htmlFor="w-months">Length (months)</label>
            {/* Blank is a real answer — a lifetime or transferable warranty has
                no end date, and inventing one would end cover that never ends. */}
            <input id="w-months" name="months" type="number" min="1" max="600" defaultValue={defaultMonths || ''} placeholder="Blank = no end date" />
          </div>
          <div className="field">
            <label htmlFor="w-starts">Starts</label>
            <input id="w-starts" name="startsOn" type="date" defaultValue={today} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="w-covers">What it covers</label>
          <textarea id="w-covers" name="covers" rows={2} placeholder="Leaks caused by our installation, including labour and materials." />
        </div>
        <div className="field">
          <label htmlFor="w-excludes">What it doesn&apos;t</label>
          <textarea id="w-excludes" name="excludes" rows={2} placeholder="Storm damage, anything we didn't install, and damage from work by others." />
          <small className="field-hint">
            Worth writing. A warranty that only lists what&apos;s covered is the one that gets argued about at the
            first thing that isn&apos;t.
          </small>
        </div>
        <div className="warranty-form-row">
          <div className="field">
            <label htmlFor="w-maintenance">How they should look after it</label>
            <input id="w-maintenance" name="maintenanceNotes" placeholder="Clear the gutters twice a year." />
          </div>
          <div className="field">
            <label htmlFor="w-interval">Service needed every (months)</label>
            <input id="w-interval" name="serviceIntervalMonths" type="number" min="1" max="120" placeholder="Leave blank if none" />
          </div>
        </div>

        <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Started ✓">
          Start the warranty
        </SaveButton>
      </form>
    </div>
  );
}
