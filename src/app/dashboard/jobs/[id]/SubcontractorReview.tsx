import SaveButton from '@/components/save-button';
import { saveSubcontractorReviewAction } from '@/app/dashboard/crew/subcontractor-actions';
import type { SubReviewRow } from '@/lib/subcontractor-dispatch-data';
import styles from '@/app/dashboard/crew/dispatch.module.css';

/**
 * The contractor's private note on how a subcontractor did.
 *
 * PRIVATE MEANS PRIVATE. This is not the `reviews` table, it never reaches
 * /dashboard/reviews, it is never shown to the subcontractor, and it never
 * appears on a public site. The only thing it feeds is the internal rating in
 * the match list — which is the whole point: the next time this firm comes up
 * for a job, the owner should be reading their own experience of them rather
 * than remembering it.
 *
 * Only offered once the job is complete. Scoring somebody's cleanliness before
 * they have finished is an opinion, not a record.
 */

const DIMENSIONS = [
  { key: 'workQuality', label: 'Work quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'onTime', label: 'On-time arrival' },
  { key: 'cleanliness', label: 'Cleanliness' },
] as const;

export default function SubcontractorReview({
  jobId,
  subcontractors,
  reviews,
  requestId,
}: {
  jobId: string;
  subcontractors: Array<{ crewId: string; displayName: string }>;
  reviews: SubReviewRow[];
  requestId: string | null;
}) {
  if (subcontractors.length === 0) return null;
  const byCrew = new Map(reviews.map((review) => [review.crewId, review]));

  return (
    <div className="workspace-section-divider">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Private</p>
        <h2>How did the subcontractor do?</h2>
      </div>
      <p className="workspace-card-copy">
        Only you see this. It never reaches your public reviews and the subcontractor is never shown it — it sets their
        internal rating so the next match list knows what you already know.
      </p>

      {subcontractors.map((sub) => {
        const existing = byCrew.get(sub.crewId) ?? null;
        const formId = `sub-review-${sub.crewId}`;
        return (
          <details key={sub.crewId} className={styles.formSection} open={!existing}>
            <summary>
              {sub.displayName}
              {existing ? ' — reviewed' : ' — not reviewed yet'}
            </summary>
            <form action={saveSubcontractorReviewAction.bind(null, jobId, sub.crewId)} className="form-grid">
              <input type="hidden" name="requestId" value={requestId ?? ''} />

              <div className="field full">
                <fieldset>
                  <legend className="sr-only">Scores for {sub.displayName}</legend>
                  {DIMENSIONS.map((dimension) => (
                    <div key={dimension.key} className={styles.scoreRow}>
                      <span id={`${formId}-${dimension.key}-label`}>{dimension.label}</span>
                      <div
                        className={styles.scoreOptions}
                        role="radiogroup"
                        aria-labelledby={`${formId}-${dimension.key}-label`}
                      >
                        {[1, 2, 3, 4, 5].map((score) => (
                          <label
                            key={score}
                            className={styles.scoreOption}
                            htmlFor={`${formId}-${dimension.key}-${score}`}
                          >
                            <input
                              id={`${formId}-${dimension.key}-${score}`}
                              type="radio"
                              name={dimension.key}
                              value={score}
                              required
                              defaultChecked={
                                existing
                                  ? existing[dimension.key] === score
                                  : score === 4
                              }
                            />
                            <span aria-label={`${score} out of 5`}>{score}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </fieldset>
              </div>

              <div className="field full">
                <label className="checkbox-row" htmlFor={`${formId}-price`}>
                  <input
                    id={`${formId}-price`}
                    name="withinPrice"
                    type="checkbox"
                    defaultChecked={existing ? existing.withinPrice : true}
                  />
                  <span>Stayed within the agreed price</span>
                </label>
                <label className="checkbox-row" htmlFor={`${formId}-again`}>
                  <input
                    id={`${formId}-again`}
                    name="hireAgain"
                    type="checkbox"
                    defaultChecked={existing ? existing.hireAgain : true}
                  />
                  <span>Would hire again</span>
                </label>
              </div>

              <div className="field full">
                <label htmlFor={`${formId}-notes`}>Private notes</label>
                <textarea
                  id={`${formId}-notes`}
                  name="notes"
                  rows={3}
                  defaultValue={existing?.notes ?? ''}
                  placeholder="Turned up early, cleaned up, charged what he quoted."
                />
              </div>

              <div className="field full">
                <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">
                  {existing ? 'Update review' : 'Save private review'}
                </SaveButton>
              </div>
            </form>
          </details>
        );
      })}
    </div>
  );
}
