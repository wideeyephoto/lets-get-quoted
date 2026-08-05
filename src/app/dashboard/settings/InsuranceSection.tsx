import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { insuranceState, ownerNote, type InsuranceRecord } from '@/lib/insurance';

/**
 * Proof of insurance, in Settings.
 *
 * "Licensed and insured" is a claim every contractor's website makes and no
 * homeowner can check. Attaching the certificate to the quote is the difference
 * between saying it and showing it — and it is free trust for somebody who
 * already pays the premium.
 *
 * The card leads with STATE rather than with the upload field, because the
 * question an owner has when they open this is "is mine still going out", and
 * the answer changes on its own as the expiry date passes.
 */
export default function InsuranceSection({
  record,
  todayKey,
  proofUrl,
  saveAction,
  removeAction,
}: {
  record: InsuranceRecord;
  /** Today in the owner's own timezone — expiry is a calendar question. */
  todayKey: string;
  /** A signed link to what's on file, an hour long. Null when nothing is. */
  proofUrl: string | null;
  saveAction: (formData: FormData) => Promise<void>;
  removeAction: () => Promise<void>;
}) {
  const state = insuranceState(record, todayKey);
  const note = ownerNote(state);
  const tone = state.kind === 'expired' ? 'form-error' : state.kind === 'expiring' ? 'form-warn' : 'workspace-details-copy';

  return (
    <section className="panel workspace-section-card" id="insurance">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Trust</p>
        <h2>Proof of insurance</h2>
      </div>

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem' }}>
        Every contractor&rsquo;s website says &ldquo;licensed and insured&rdquo; and no homeowner can
        check it. Upload your certificate and it rides along with every quote you send, where they can
        open it themselves.
      </p>

      <p className={tone} style={{ marginTop: '0.75rem' }}>
        <strong>{note}</strong>
      </p>

      {record.path && proofUrl ? (
        <p className="workspace-details-copy">
          On file: <a href={proofUrl} target="_blank" rel="noreferrer">{record.filename || 'certificate'}</a>
        </p>
      ) : null}

      <form action={saveAction} className="workspace-form" encType="multipart/form-data">
        <div className="field">
          <label htmlFor="ins-file">
            {record.path ? 'Replace the certificate' : 'Certificate of insurance'}
          </label>
          <input
            id="ins-file"
            name="certificate"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          />
          {/* Said here because it is the thing people get wrong: a phone photo
              of the paper certificate is a perfectly good answer. */}
          <p className="field-note">A PDF from your agent, or a photo of the paper one. Up to 10 MB.</p>
        </div>

        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="ins-carrier">Insurer</label>
            <input id="ins-carrier" name="carrier" type="text" maxLength={120} defaultValue={record.carrier ?? ''} placeholder="Grange Insurance" />
          </div>
          <div className="field">
            <label htmlFor="ins-coverage">General liability cover</label>
            <input id="ins-coverage" name="coverageAmount" type="text" inputMode="numeric" defaultValue={record.coverageAmount ? String(Math.round(record.coverageAmount)) : ''} placeholder="1,000,000" />
          </div>
          <div className="field">
            <label htmlFor="ins-expires">Expires</label>
            <input id="ins-expires" name="expiresOn" type="date" defaultValue={record.expiresOn ?? ''} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="ins-policy">Policy number</label>
          <input id="ins-policy" name="policyNumber" type="text" maxLength={80} defaultValue={record.policyNumber ?? ''} placeholder="GL-4471902" />
          {/* Worth saying, because typing a policy number into a CRM feels like
              publishing it. It is on the certificate anyway. */}
          <p className="field-note">Kept for your own records. It never appears on the quote itself.</p>
        </div>

        <label className="recurring-autocharge">
          <input type="checkbox" name="showOnQuotes" defaultChecked={record.showOnQuotes} />
          <span>
            <strong>Show it on quotes</strong>
            <span className="field-note">
              An expired certificate stops going out on its own the day it lapses, whatever this says.
            </span>
          </span>
        </label>

        <div className="workspace-inline-row">
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">Save</SaveButton>
          {record.path ? (
            <ConfirmActionButton
              action={removeAction}
              confirmMessage="Remove your certificate? Quotes stop carrying it straight away, and you'd need to upload it again."
              className="btn secondary"
              pendingLabel="Removing…"
              savedLabel="Removed ✓"
            >
              Remove it
            </ConfirmActionButton>
          ) : null}
        </div>
      </form>
    </section>
  );
}
