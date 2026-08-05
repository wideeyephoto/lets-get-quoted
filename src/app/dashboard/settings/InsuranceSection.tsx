import SaveButton from '@/components/save-button';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import InsurancePreview from './InsurancePreview';
import { clientSummary, coverageLabel, expiryLabel, insuranceState, ownerNote, showsToClient, type InsuranceRecord } from '@/lib/insurance';

/**
 * Proof of insurance, in Settings.
 *
 * "Licensed and insured" is a claim every contractor's website makes and no
 * homeowner can check. Attaching the certificate to the quote is the difference
 * between saying it and showing it — and it is free trust for somebody who
 * already pays the premium.
 *
 * Once there IS one on file the card is a summary, not a form. What an owner
 * opens this for is "is mine still going out" — an answer that changes on its
 * own as the expiry date passes — and eight input fields is a poor way to say
 * yes. The form is one press away and stays exactly as it was.
 */

/** "August 3, 2026" — when the file was put there, which is what a filename fails to say. */
function uploadedLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InsuranceSection({
  record,
  todayKey,
  proofUrl,
  uploadedAt,
  saveAction,
  removeAction,
}: {
  record: InsuranceRecord;
  /** Today in the owner's own timezone — expiry is a calendar question. */
  todayKey: string;
  /** A signed link to what's on file, an hour long. Null when nothing is. */
  proofUrl: string | null;
  /** When the file was uploaded, ISO. Null on certificates that predate the column. */
  uploadedAt: string | null;
  saveAction: (formData: FormData) => Promise<void>;
  removeAction: () => Promise<void>;
}) {
  const state = insuranceState(record, todayKey);
  const note = ownerNote(state);
  const onFile = Boolean(record.path);
  const coverage = coverageLabel(record.coverageAmount);
  const expiry = expiryLabel(record.expiresOn);
  const uploaded = uploadedLabel(uploadedAt);
  // 'attention' covers expired, expiring and — the one people hit — a
  // certificate with no expiry date, which can never be withdrawn on time.
  const tone = state.kind === 'expired' ? 'is-expired' : state.kind === 'expiring' || state.kind === 'undated' ? 'is-warn' : state.kind === 'hidden' ? 'is-off' : 'is-ok';

  // The preview asks the SAME gate the client page asks, rather than reading
  // the checkbox — the checkbox is not the last word (expiry beats it), and a
  // preview that disagreed with the quote would be worse than none.
  const shows = showsToClient(record, todayKey);
  const previewSummary = shows ? clientSummary(record) : null;
  const withheldReason = shows
    ? null
    : state.kind === 'expired'
      ? 'Your certificate has expired, so quotes are going out without it. This is what a customer sees today.'
      : state.kind === 'hidden'
        ? 'Switched off, so quotes are going out without it. This is what a customer sees today.'
        : 'Nothing is on file yet, so quotes go out without it.';

  const form = (
    <form action={saveAction} className="workspace-form" encType="multipart/form-data">
      <div className="field">
        <label htmlFor="ins-file">
          {onFile ? 'Replace the certificate' : 'Certificate of insurance'}
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
          {/* The single most valuable field on this form, and the one most
              likely to be skipped — so it says why rather than sitting blank. */}
          <p className="field-note">Without it we can&rsquo;t pull the certificate the day it lapses.</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ins-policy">Policy number</label>
        <input id="ins-policy" name="policyNumber" type="text" maxLength={80} defaultValue={record.policyNumber ?? ''} placeholder="GL-4471902" />
        {/* Worth saying, because typing a policy number into a CRM feels like
            publishing it. It is on the certificate anyway. */}
        <p className="field-note">Kept for your own records. It never appears on the quote itself.</p>
      </div>

      <div className="ins-show-row">
        <label className="recurring-autocharge">
          <input type="checkbox" name="showOnQuotes" defaultChecked={record.showOnQuotes} />
          <span>
            <strong>Show it on quotes</strong>
            <span className="field-note">
              An expired certificate stops going out on its own the day it lapses, whatever this says.
            </span>
          </span>
        </label>
        {/* The effect of this checkbox is on a page the contractor never opens —
            their quotes go out to other people. Without this the only way to
            check the answer is to send yourself a test quote. */}
        <InsurancePreview summary={previewSummary} withheldReason={withheldReason} />
      </div>

      <div className="workspace-inline-row">
        <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">Save</SaveButton>
        {onFile ? (
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
  );

  return (
    <section className="panel workspace-section-card" id="insurance">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Trust</p>
        <h2>Proof of insurance</h2>
      </div>

      {onFile ? (
        <>
          <div className={`ins-summary ${tone}`}>
            <div className="ins-summary-main">
              <strong>General liability insurance</strong>
              <p className="ins-summary-facts">
                {[record.carrier?.trim() || null, coverage ? `${coverage} coverage` : null].filter(Boolean).join(' · ') ||
                  'No insurer or cover amount recorded yet.'}
              </p>
              <p className="ins-summary-state">{note}</p>
            </div>
            <span className="ins-summary-chip">
              {state.kind === 'expired' ? 'Expired'
                : state.kind === 'expiring' ? `Expires ${expiry ?? 'soon'}`
                : state.kind === 'undated' ? 'No expiry date'
                : state.kind === 'hidden' ? 'Not on quotes'
                : `Valid through ${expiry}`}
            </span>
          </div>

          <p className="ins-summary-file">
            {/* Not the raw filename. "IMG_4471.HEIC" tells you nothing about
                which certificate this is; the date it went up tells you whether
                it is the one your agent sent in March. */}
            {uploaded ? `Certificate uploaded ${uploaded}` : 'Certificate on file'}
            {proofUrl ? (
              <>
                {' · '}
                <a href={proofUrl} target="_blank" rel="noreferrer">View original file</a>
              </>
            ) : null}
          </p>

          {/* Open, and focused on the date, when that is what is missing —
              somebody sent here by the overview alert should land on the field
              they were sent for, not on a button. */}
          <details className="workspace-details ins-edit" open={state.kind === 'undated'}>
            <summary className="workspace-details-summary">
              <span className="btn secondary">Edit certificate</span>
              <span className="workspace-details-copy">Replace the file, or change the insurer, cover and dates.</span>
            </summary>
            <div className="ins-edit-body">{form}</div>
          </details>
        </>
      ) : (
        <>
          <p className="workspace-details-copy" style={{ marginTop: '0.5rem' }}>
            Every contractor&rsquo;s website says &ldquo;licensed and insured&rdquo; and no homeowner can
            check it. Upload your certificate and it rides along with every quote you send, where they can
            open it themselves.
          </p>
          {form}
        </>
      )}
    </section>
  );
}
