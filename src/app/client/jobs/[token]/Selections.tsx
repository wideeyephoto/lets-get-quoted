'use client';

import { useState, useTransition } from 'react';
import type { ClientSelection } from '@/lib/selections';
import { askAboutSelectionAction, chooseSelectionAction } from './selection-actions';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatChosenAt(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Choices the homeowner has to make: colours, materials, fixtures.
 *
 * A made choice is shown BACK to them, permanently, with the product reference
 * and the date. That readback is the feature — "Accessible Beige SW7036, chosen
 * 12 March" is not a matter of opinion, and it's the sentence that ends the
 * argument about the beige before it starts.
 */
export default function Selections({
  token,
  selections,
  businessName,
}: {
  token: string;
  selections: ClientSelection[];
  businessName: string;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (selections.length === 0) return null;

  const waiting = selections.filter((s) => s.awaitingDecision).length;

  return (
    <section className="panel workspace-section-card client-selections">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Your choices</p>
        <h2>{waiting > 0 ? `${waiting} thing${waiting === 1 ? '' : 's'} to pick` : 'What you picked'}</h2>
      </div>

      <div className="client-selection-list">
        {selections.map((selection) => (
          <article key={selection.id} className={`client-selection${selection.overdue ? ' is-overdue' : ''}`}>
            <div className="client-selection-head">
              <strong>{selection.title}</strong>
              {selection.allowance > 0 ? (
                <span className="client-selection-allowance">{money(selection.allowance)} allowed for</span>
              ) : null}
            </div>
            {selection.description ? <p className="client-selection-desc">{selection.description}</p> : null}
            {selection.deadlineLabel ? <p className="client-selection-deadline">{selection.deadlineLabel}</p> : null}

            {/* Being asked a question you already answered, with no explanation,
                reads as "they lost it". Only the most recent one is named — the
                full trail is the contractor's record, not a lecture. */}
            {selection.previouslyPicked.length > 0 && selection.awaitingDecision ? (
              <p className="client-selection-reopened">
                You picked <strong>{selection.previouslyPicked[0].name}</strong>
                {selection.previouslyPicked[0].reference ? ` (${selection.previouslyPicked[0].reference})` : ''}
                {selection.previouslyPicked[0].at ? ` on ${formatChosenAt(selection.previouslyPicked[0].at)}` : ''}. We&apos;ve
                opened this back up so you can change it — pick again below, or tell us to leave it as it was.
              </p>
            ) : null}

            {selection.chosen ? (
              <div className="client-selection-chosen">
                <strong>You picked: {selection.chosen.name}</strong>
                {selection.chosen.reference ? <span className="client-selection-ref">{selection.chosen.reference}</span> : null}
                <span className="client-selection-meta">
                  {selection.chosen.costLabel}
                  {selection.chosen.at ? ` · ${formatChosenAt(selection.chosen.at)}` : ''}
                  {selection.chosen.byName ? ` · ${selection.chosen.byName}` : ''}
                </span>
              </div>
            ) : (
              <form
                className="client-selection-form"
                action={(formData) => {
                  setError(null);
                  formData.set('optionId', picked[selection.id] ?? '');
                  startTransition(async () => {
                    const result = await chooseSelectionAction(token, selection.id, formData);
                    if (!result.ok) setError(result.message ?? 'Could not record that. Try again.');
                  });
                }}
              >
                <div className="client-option-grid">
                  {selection.options.map((option) => (
                    <label key={option.id} className={`client-option${picked[selection.id] === option.id ? ' is-picked' : ''}`}>
                      <input
                        type="radio"
                        name={`option-${selection.id}`}
                        value={option.id}
                        checked={picked[selection.id] === option.id}
                        onChange={() => setPicked((current) => ({ ...current, [selection.id]: option.id }))}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element --
                          a signed storage URL is not a static asset and can't
                          be run through the image optimiser. */}
                      {option.photoUrl ? <img className="client-option-photo" src={option.photoUrl} alt={option.name} /> : null}
                      <span className="client-option-body">
                        <strong>{option.name}</strong>
                        {option.reference ? <span className="client-option-ref">{option.reference}</span> : null}
                        {option.description ? <span className="client-option-desc">{option.description}</span> : null}
                        {/* Priced against the allowance for them. Nobody should
                            have to do that subtraction to compare two taps. */}
                        <span className={`client-option-cost${option.included ? ' is-included' : ''}`}>{option.costLabel}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {selection.options.length === 0 ? (
                  <p className="empty-state">Your contractor is still putting the options together for this one.</p>
                ) : (
                  <>
                    <label htmlFor={`sig-${selection.id}`}>Type your name to confirm</label>
                    <input id={`sig-${selection.id}`} name="byName" required autoComplete="name" placeholder="Jane Homeowner" />
                    <button type="submit" className="btn primary" disabled={pending || !picked[selection.id]}>
                      {pending ? 'Saving…' : 'Confirm this choice'}
                    </button>
                  </>
                )}
              </form>
            )}

            {/* Not sure yet? The board used to offer confirm or nothing, and
                people with a question in between simply didn't answer — which
                reads from the contractor's side as being ignored. */}
            {selection.awaitingDecision ? (
              asked[selection.id] ? (
                <p className="client-selection-asked">
                  Sent — {businessName} will come back to you. You can still pick above once you&apos;ve heard.
                </p>
              ) : (
                <details className="client-selection-ask">
                  <summary>Not sure? Ask about this one</summary>
                  <form
                    action={(formData) => {
                      setError(null);
                      startTransition(async () => {
                        const result = await askAboutSelectionAction(token, selection.id, formData);
                        if (result.ok) setAsked((current) => ({ ...current, [selection.id]: true }));
                        else setError(result.message ?? 'Could not send that. Try again.');
                      });
                    }}
                  >
                    <label htmlFor={`ask-${selection.id}`}>What would you like to know?</label>
                    <textarea
                      id={`ask-${selection.id}`}
                      name="question"
                      required
                      rows={3}
                      maxLength={600}
                      placeholder="Can I see the brushed brass one in person before I decide?"
                    />
                    <button type="submit" className="btn ghost" disabled={pending}>
                      {pending ? 'Sending…' : 'Send question'}
                    </button>
                  </form>
                </details>
              )
            ) : null}
          </article>
        ))}
      </div>

      {error ? <p className="client-selection-error">{error}</p> : null}
      <p className="client-selection-foot">
        Once you confirm, we order it — so have a good look first. What you picked stays on this page with the product
        code and the date, so we&apos;re both working from the same thing.
      </p>
    </section>
  );
}
