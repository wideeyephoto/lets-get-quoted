'use client';

import { useState, useTransition } from 'react';
import { describeTemplate, type SelectionTemplateBody } from '@/lib/selections';
import {
  applySelectionTemplateAction,
  deleteSelectionTemplateAction,
  saveSelectionTemplateAction,
} from './selection-actions';

/**
 * Reusable boards.
 *
 * A painter runs the same six choices on every interior job and was retyping
 * them each time, product codes and all — which is the difference between a
 * feature used once and one used on job number two.
 *
 * Applying ADDS to the board rather than replacing it, and the button says so:
 * "it wiped my work" is not a mistake anybody forgives twice.
 */
export default function SelectionTemplates({
  jobId,
  templates,
  hasBoard,
}: {
  jobId: string;
  templates: { id: string; name: string; body: SelectionTemplateBody }[];
  /** Whether there's anything on this job worth saving. */
  hasBoard: boolean;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(key: string, work: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(key);
    setResult(null);
    startTransition(async () => {
      try {
        setResult(await work());
      } catch {
        setResult({ ok: false, message: 'That did not work. Please try again.' });
      } finally {
        setBusy(null);
      }
    });
  }

  if (templates.length === 0 && !hasBoard) return null;

  return (
    <details className="selection-templates">
      <summary>Templates {templates.length > 0 ? `(${templates.length})` : ''}</summary>

      {templates.length > 0 ? (
        <ul className="selection-template-list">
          {templates.map((template) => (
            <li key={template.id}>
              <span>
                <strong>{template.name}</strong>
                <em>{describeTemplate(template.body)}</em>
              </span>
              <span className="selection-template-actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={pending}
                  onClick={() => run(`apply:${template.id}`, () => applySelectionTemplateAction(jobId, template.id))}
                >
                  {busy === `apply:${template.id}` ? 'Adding…' : 'Add to this job'}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete the ${template.name} template`}
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Delete the “${template.name}” template?\n\nJobs already using it keep their choices.`)) return;
                    setBusy(`del:${template.id}`);
                    startTransition(async () => {
                      await deleteSelectionTemplateAction(jobId, template.id);
                      setBusy(null);
                    });
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="selection-template-empty">
          No templates yet. Save this board once and every job of the same kind starts with it.
        </p>
      )}

      {hasBoard ? (
        <div className="selection-template-save">
          <input
            type="text"
            value={name}
            maxLength={80}
            placeholder="Interior repaint"
            aria-label="Template name"
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="button"
            className="btn ghost"
            disabled={pending || !name.trim()}
            onClick={() => {
              const form = new FormData();
              form.set('templateName', name);
              run('save', async () => {
                const outcome = await saveSelectionTemplateAction(jobId, form);
                if (outcome.ok) setName('');
                return outcome;
              });
            }}
          >
            {busy === 'save' ? 'Saving…' : 'Save this board'}
          </button>
        </div>
      ) : null}

      {result ? (
        <p className={`selection-template-note${result.ok ? ' is-ok' : ' is-bad'}`} aria-live="polite">
          {result.message}
        </p>
      ) : (
        <p className="selection-template-note">
          Adding a template puts its choices on top of what&apos;s already here — nothing is replaced. Needed-by dates
          stay blank, because those belong to the job.
        </p>
      )}
    </details>
  );
}
