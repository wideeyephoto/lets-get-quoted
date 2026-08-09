import SaveButton from '@/components/save-button';
import ConfirmActionButton from './ConfirmActionButton';
import SendSelectionsButton from './SendSelectionsButton';
import SelectionTemplates from './SelectionTemplates';
import type { SelectionTemplate } from '@/lib/selections-data';
import { formatMoney } from '@/lib/jobs';
import {
  boardStatus,
  deadlineState,
  describeOptionCost,
  optionCost,
  reopenAdjustment,
  selectionTotals,
  todayKey,
  type Selection,
} from '@/lib/selections';
import {
  addSelectionOptionAction,
  cancelSelectionAction,
  createSelectionAction,
  deleteSelectionOptionAction,
  moveSelectionAction,
  reopenSelectionAction,
  updateSelectionOptionAction,
} from './selection-actions';

/**
 * The owner's side of the selection board.
 *
 * Server component: it's a list and some forms, and none of it needs to be
 * interactive before submission.
 */
export default function SelectionBoard({
  jobId,
  selections,
  templates,
  photos,
  lastSentAt,
}: {
  jobId: string;
  selections: Selection[];
  templates: SelectionTemplate[];
  /** Signed option-photo URLs by option id. Missing ones simply don't render. */
  photos: Record<string, string>;
  /**
   * The most recent time anything on this board went out, from the job feed.
   * Shown because a board nobody has been told about is the failure mode this
   * feature had for its whole life: it looked finished, and the homeowner had
   * never heard of it.
   *
   * Passed in rather than derived from the choices. It used to be the newest of
   * chase_sent_at / overdue_sent_at across the board, which stopped being an
   * answer the moment the scheduled reminders got their own ledger and stopped
   * stamping the choices — every board would have read as never sent. Both
   * senders write a `selection_requested` feed event, so the feed is the one
   * place that knows about both.
   */
  lastSentAt: string | null;
}) {
  const today = todayKey();
  const totals = selectionTotals(selections);
  const status = boardStatus(selections, today);
  const anyOpen = selections.some((selection) => selection.status === 'open');

  return (
    <div className="selection-board">
      {selections.length > 0 ? (
        <div className="selection-summary">
          <span className={status.overdue > 0 ? 'is-overdue' : ''}>{status.label}</span>
          {totals.decided > 0 ? (
            <span>
              {/* Net, from the snapshots. Upgrades and credits shown apart
                  because a contractor needs to know both, not just the sum. */}
              {totals.upgrades > 0 ? `${formatMoney(totals.upgrades)} in upgrades` : ''}
              {totals.upgrades > 0 && totals.credits > 0 ? ' · ' : ''}
              {totals.credits > 0 ? `${formatMoney(totals.credits)} back` : ''}
              {totals.net !== 0 ? ` · ${totals.net > 0 ? '+' : ''}${formatMoney(totals.net)} on the job` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      {anyOpen ? <SendSelectionsButton jobId={jobId} lastSentAt={lastSentAt} /> : null}

      <SelectionTemplates
        jobId={jobId}
        templates={templates}
        hasBoard={selections.some((selection) => selection.status !== 'cancelled')}
      />

      {selections.length === 0 ? (
        <p className="empty-state">
          No choices on this job yet. Add the colours, materials and fixtures the customer has to pick, with what the
          quote allows for — then it&apos;s their decision on the record, with a date and a product code.
        </p>
      ) : (
        <div className="selection-list">
          {selections
            .filter((selection) => selection.status !== 'cancelled')
            .map((selection) => {
              const deadline = deadlineState(selection, today);
              const decided = selection.status === 'chosen' && selection.chosenSnapshot;
              return (
                <article key={selection.id} className={`selection-card${deadline.overdue ? ' is-overdue' : ''}${decided ? ' is-decided' : ''}`}>
                  <header className="selection-card-head">
                    <div>
                      <strong>{selection.title}</strong>
                      {selection.allowance > 0 ? (
                        <span className="selection-allowance">{formatMoney(selection.allowance)} allowed</span>
                      ) : (
                        <span className="selection-allowance">Nothing allowed for</span>
                      )}
                    </div>
                    {deadline.label ? (
                      <span className={`selection-deadline${deadline.overdue ? ' is-overdue' : ''}`}>{deadline.label}</span>
                    ) : null}
                    {/* Up/down, not drag: this is a column of cards a
                        contractor edits one-handed on a phone in a van, and
                        drag is the interaction that fails there. */}
                    <span className="selection-move">
                      {/* Plain forms, not ConfirmActionButton: that one always
                          prompts, and confirming every nudge of a list would be
                          worse than not being able to reorder at all. */}
                      <form action={moveSelectionAction.bind(null, jobId, selection.id, 'up')}>
                        <SaveButton className="icon-btn" pendingLabel="…" savedLabel="✓" aria-label={`Move ${selection.title} up`}>
                          ↑
                        </SaveButton>
                      </form>
                      <form action={moveSelectionAction.bind(null, jobId, selection.id, 'down')}>
                        <SaveButton className="icon-btn" pendingLabel="…" savedLabel="✓" aria-label={`Move ${selection.title} down`}>
                          ↓
                        </SaveButton>
                      </form>
                    </span>
                  </header>

                  {selection.description ? <p className="selection-desc">{selection.description}</p> : null}

                  {/* Every decision they made and then changed. Kept in front of
                      the contractor, not buried: if the first colour is already
                      on the wall, this is the sentence that settles who pays. */}
                  {selection.reopened.length > 0 ? (
                    <ul className="selection-history">
                      {[...selection.reopened].reverse().map((previous, index) => (
                        <li key={`${previous.reopenedAt}-${index}`}>
                          First picked <strong>{previous.snapshot.name}</strong>
                          {previous.snapshot.reference ? ` (${previous.snapshot.reference})` : ''}
                          {previous.chosenByName ? ` — ${previous.chosenByName}` : ''}
                          {previous.chosenAt ? `, ${previous.chosenAt.slice(0, 10)}` : ''}
                          {' · reopened '}
                          {previous.reopenedAt.slice(0, 10)}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {decided && selection.chosenSnapshot ? (
                    // The record. Read from the snapshot, so editing an option
                    // later cannot change what the customer agreed to.
                    <div className="selection-chosen">
                      <strong>{selection.chosenSnapshot.name}</strong>
                      {selection.chosenSnapshot.reference ? (
                        <span className="selection-ref">{selection.chosenSnapshot.reference}</span>
                      ) : null}
                      <span className="selection-chosen-meta">
                        {describeOptionCost(optionCost({ price: selection.chosenSnapshot.price }, selection))}
                        {selection.chosenByName ? ` · ${selection.chosenByName}` : ''}
                        {selection.chosenAt ? ` · ${selection.chosenAt.slice(0, 10)}` : ''}
                      </span>
                      {/* The way back. Named for what it does to the money,
                          because that is the part that surprises people. */}
                      <ConfirmActionButton
                        action={reopenSelectionAction.bind(null, jobId, selection.id)}
                        confirmMessage={
                          `Let them choose again?\n\n` +
                          `${formatMoney(Math.abs(reopenAdjustment(selection)))} ` +
                          `${reopenAdjustment(selection) < 0 ? 'comes off' : 'goes back on'} the job total, and ` +
                          `“${selection.chosenSnapshot.name}” stays on the record as what they first picked.`
                        }
                        className="btn ghost"
                        pendingLabel="Reopening…"
                        savedLabel="Reopened ✓"
                      >
                        Let them choose again
                      </ConfirmActionButton>
                    </div>
                  ) : (
                    <>
                      <ul className="selection-options">
                        {selection.options.map((option) => (
                          <li key={option.id}>
                            <span>
                              {/* eslint-disable-next-line @next/next/no-img-element --
                                  a signed storage URL is not a static asset and
                                  can't go through the image optimiser. */}
                              {photos[option.id] ? (
                                <img className="selection-option-photo" src={photos[option.id]} alt="" />
                              ) : null}
                              {option.name}
                              {option.reference ? <em className="selection-ref">{option.reference}</em> : null}
                            </span>
                            <span className="selection-option-cost">
                              {describeOptionCost(optionCost(option, selection))}
                              {/* A typo'd product code is the one thing on this
                                  board that must be fixable — it is what gets
                                  ordered. Behind a disclosure so the list still
                                  reads as a list. */}
                              <details className="selection-option-edit">
                                <summary aria-label={`Edit ${option.name}`}>✎</summary>
                                <form action={updateSelectionOptionAction.bind(null, jobId, option.id)}>
                                  <input name="name" defaultValue={option.name} required aria-label="Option name" />
                                  <input name="reference" defaultValue={option.reference} placeholder="SW7036" aria-label="Product code" />
                                  <input name="price" type="number" min="0" step="0.01" defaultValue={option.price} required aria-label="Price" />
                                  <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Saved ✓">
                                    Save
                                  </SaveButton>
                                </form>
                              </details>
                              <ConfirmActionButton
                                action={deleteSelectionOptionAction.bind(null, jobId, option.id)}
                                confirmMessage={`Remove “${option.name}”?`}
                                className="icon-btn"
                                pendingLabel="…"
                                savedLabel="✓"
                              >
                                ✕
                              </ConfirmActionButton>
                            </span>
                          </li>
                        ))}
                      </ul>

                      <form action={addSelectionOptionAction.bind(null, jobId, selection.id)} className="selection-option-form">
                        <input name="name" required placeholder="Accessible Beige" aria-label="Option name" />
                        <input name="reference" placeholder="SW7036" aria-label="Product code" />
                        <input name="price" type="number" min="0" step="0.01" required placeholder="Price" aria-label="Price" />
                        {/* Nobody picks a tile from a product code. The picture
                            makes the choice possible; the code settles it later. */}
                        <input type="file" name="photo" accept="image/*" aria-label="Photo of this option" />
                        <SaveButton className="btn secondary" pendingLabel="Adding…" savedLabel="Added ✓">
                          Add option
                        </SaveButton>
                      </form>

                      <ConfirmActionButton
                        action={cancelSelectionAction.bind(null, jobId, selection.id)}
                        confirmMessage={`Take “${selection.title}” off the board?\n\nThe customer stops seeing it.`}
                        className="btn ghost"
                        pendingLabel="Removing…"
                        savedLabel="Removed ✓"
                      >
                        Take it off
                      </ConfirmActionButton>
                    </>
                  )}
                </article>
              );
            })}
        </div>
      )}

      <form action={createSelectionAction.bind(null, jobId)} className="selection-new-form">
        <div className="selection-new-row">
          <div className="field">
            <label htmlFor="sel-title">What they have to choose</label>
            <input id="sel-title" name="title" required placeholder="Living-room wall colour" />
          </div>
          <div className="field">
            <label htmlFor="sel-allowance">Allowed for in the quote</label>
            <input id="sel-allowance" name="allowance" type="number" min="0" step="0.01" placeholder="400" />
          </div>
          <div className="field">
            <label htmlFor="sel-by">Needed by</label>
            {/* Blank is fine. Inventing a deadline teaches people to ignore them. */}
            <input id="sel-by" name="decideBy" type="date" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="sel-desc">Anything they should know</label>
          <input id="sel-desc" name="description" placeholder="Two coats over the existing white. Bring a sample home if you like." />
        </div>
        <label className="checkbox-row" htmlFor="sel-credit">
          <input id="sel-credit" name="creditUnderspend" type="checkbox" defaultChecked />
          <span>Give the difference back if they pick cheaper than the allowance</span>
        </label>
        <SaveButton className="btn primary" pendingLabel="Adding…" savedLabel="Added ✓">
          Add this choice
        </SaveButton>
      </form>
    </div>
  );
}
