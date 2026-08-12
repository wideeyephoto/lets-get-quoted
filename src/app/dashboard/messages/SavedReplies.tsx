'use client';

import { useState } from 'react';
import SaveButton from '@/components/save-button';

/**
 * Saved replies, inside the composer instead of underneath the page.
 *
 * The chips were already here; the MANAGER was a `<details>` in its own panel
 * below the inbox, which on a 1440x900 laptop began somewhere past 900px — you
 * had to scroll the whole workspace away to add a canned reply, and the reply
 * box you were adding it for scrolled away with it. Two surfaces for one thing,
 * a screen apart.
 *
 * So the manager comes to the chips. It opens in place, above the box, and
 * closes to a single trailing chip the rest of the time — the row costs one
 * chip's width when you are not using it and nothing at all on a fresh account
 * with no replies saved and no reason to care yet.
 */

type Template = { id: string; title: string; body: string };

export default function SavedReplies({
  templates,
  starters = [],
  targetId,
  createAction,
  deleteAction,
  canInsert = true,
}: {
  templates: Template[];
  /**
   * The five every contractor sends, always present and never stored. See
   * lib/starter-replies — the empty state used to ask somebody to sit down and
   * write templates, which is work at exactly the moment they wanted less of
   * it. Pressing one fills the box; it does not send.
   */
  starters?: Template[];
  targetId: string;
  createAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (templateId: string) => void | Promise<void>;
  /**
   * False when there is no composer to write into — an account with no
   * conversations yet, where the thread pane says "pick a conversation".
   *
   * The manager still renders there, because moving it into the composer would
   * otherwise have taken away the only way to write a canned reply before you
   * have anybody to send one to. The insert CHIPS do not: a chip whose only job
   * is to fill a textarea that does not exist is a button that does nothing.
   */
  canInsert?: boolean;
}) {
  const [managing, setManaging] = useState(false);

  // Writing straight to the DOM node rather than lifting the textarea into
  // state: the composer is an uncontrolled Server Action form, and making it
  // controlled to support this would re-render the thread on every keystroke.
  function apply(body: string) {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!el) return;
    el.value = body;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  return (
    <div className="inbox-saved">
      <div className="quick-replies" aria-label="Saved replies">
        {canInsert
          ? starters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="quick-reply-chip is-starter"
                onClick={() => apply(starter.body)}
                title={starter.body}
              >
                {starter.title}
              </button>
            ))
          : null}
        {canInsert && starters.length > 0 && templates.length > 0 ? (
          <span className="quick-reply-rule" aria-hidden="true" />
        ) : null}
        {canInsert
          ? templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="quick-reply-chip"
                onClick={() => apply(template.body)}
                title={template.body}
              >
                {template.title}
              </button>
            ))
          : null}
        <button
          type="button"
          className={`quick-reply-chip is-manage${managing ? ' open' : ''}`}
          aria-expanded={managing}
          aria-controls="inbox-saved-manager"
          onClick={() => setManaging((open) => !open)}
        >
          <span aria-hidden="true">{managing ? '×' : '+'}</span>
          {templates.length > 0 ? ' Saved replies' : ' Save a reply'}
        </button>
      </div>

      {managing ? (
        <div className="inbox-saved-manager" id="inbox-saved-manager">
          {templates.length > 0 ? (
            <ul className="inbox-saved-list">
              {templates.map((template) => (
                <li key={template.id}>
                  <span className="inbox-saved-title">{template.title}</span>
                  <span className="inbox-saved-body">{template.body}</span>
                  {/* Bound on the client, which a Server Action reference
                      supports — the alternative is a hidden id field, and a
                      hidden id is a thing a page can be made to lie about. */}
                  <form action={deleteAction.bind(null, template.id)}>
                    <button type="submit" className="linklike danger">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="inbox-saved-empty">
              The five above come with the app and are always there. Add your own for the things only
              you say — a gate code, a parking note, the way you word a deposit.
            </p>
          )}

          <form action={createAction} className="inbox-saved-add">
            <input name="title" placeholder="Label (e.g. On my way)" required maxLength={40} aria-label="Reply label" />
            <textarea name="body" rows={2} placeholder="Full reply text…" required aria-label="Reply text" />
            <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">Add saved reply</SaveButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
