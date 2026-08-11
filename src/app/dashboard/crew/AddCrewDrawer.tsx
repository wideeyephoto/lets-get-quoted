'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormState } from 'react-dom';
import SaveButton from '@/components/save-button';
import UnsavedGuard from '@/components/unsaved-guard';
import PayTypeFields, { PayrollIdField } from './PayTypeFields';
import { createCrewAction } from './actions';
// The idle state comes from the pure module, not from the action file: a
// 'use server' file may only export async functions, and exporting this object
// from there broke the build's page-data collection.
import { CREATE_CREW_IDLE } from '@/lib/crew-add-state';
import styles from './crew.module.css';

// "Add crew member", as a drawer over the roster instead of a form beneath it.
//
// THE BUG THIS EXISTS TO KILL. The header's "+ Add crew member" link pointed at
// /dashboard/crew?add=1#add-crew, and the roster turned that into
// `useState(openAdd)`. A useState argument is an INITIALIZER: it is read once,
// when the component first mounts, and ignored forever after. Clicking that
// link is a soft navigation — CrewRoster sits at a fixed position in the tree
// with no `key`, so React reconciles the same instance, never remounts it, and
// the new `openAdd={true}` went straight in the bin. The button did nothing.
// Twice over, in fact: even had the state flipped, the form was the last child
// of the roster, about three thousand pixels down, and the hash would have
// landed you on a collapsed toggle.
//
// SO OPEN STATE IS DERIVED FROM THE URL, not synced to it. `useSearchParams()`
// is a subscription: it re-renders this component on every navigation,
// soft ones included, so ?add=1 arriving from the header link, the sidebar's
// New menu, a bookmark or a hard reload all open the same drawer through the
// same code path. There is deliberately no useState mirroring it and no effect
// copying a prop into state — those are the two shapes that produced the
// original defect, and a second copy of the truth is what let them diverge.
//
// Closing therefore means REMOVING the parameter, which is the one thing to
// remember when reading this: `close()` is a navigation, not a setState.
//
// One behavior was dropped on the way: the form used to force itself open
// whenever the roster was empty. As URL-derived state that becomes a modal that
// reopens itself after every revalidation for as long as the roster stays empty
// — which is precisely the state a REFUSED save leaves you in. The empty roster
// already says "No crew members yet" over a primary button pointing here, which
// is the same invitation without the trap.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Roles offered before this account has invented any of its own.
 *
 * Seeds only. The list the owner actually sees is these plus every distinct
 * role already on their roster, so an account that has been running for a year
 * is picking from its own vocabulary rather than ours.
 */
const SEED_ROLES = ['Laborer', 'Foreman', 'Apprentice', 'Technician', 'Driver', 'Estimator', 'Office'];

const NEW_ROLE = '__new__';

/**
 * A US number the way a person writes one, rebuilt from the digits on every
 * keystroke.
 *
 * Formatting from the digits rather than patching the previous string is what
 * makes deleting work: backspacing over the ")" of "(248) " removes a digit and
 * the whole thing is laid out again, instead of leaving orphaned punctuation
 * that the next keystroke builds on. Anything starting with "+" is left exactly
 * as typed — an international number is not ours to reshape, and normalizeUsPhone
 * hands those through untouched too.
 */
export function formatPhoneAsTyped(value: string): string {
  if (value.trim().startsWith('+')) return value;
  const digits = value.replace(/\D/g, '');
  // A leading 1 is a country code only once there are more digits than a local
  // number can hold — otherwise somebody whose area code starts with 1 loses it.
  const local = (digits.length > 10 && digits.startsWith('1') ? digits.slice(1) : digits).slice(0, 10);
  if (local.length <= 3) return local;
  if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

export default function AddCrewDrawer({
  roles,
  onAdded,
}: {
  /** Distinct roles already on this roster, so the list speaks the owner's words. */
  roles: string[];
  /** Handed the new member so the roster can announce them and focus their card. */
  onAdded: (member: { id: string; name: string; message: string }) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get('add') === '1';

  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [state, formAction] = useFormState(createCrewAction, CREATE_CREW_IDLE);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [newRole, setNewRole] = useState('');
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);

  // Where focus came from, so it can be put back. Captured at open rather than
  // held as a ref to a trigger, because there are three triggers — the page
  // header link, the empty state's button and the sidebar's New menu — and two
  // of them are rendered by components that know nothing about this drawer.
  const openerRef = useRef<HTMLElement | null>(null);
  // A successful save moves focus to the new crew member's card, so the close
  // that follows it must NOT drag focus back to the button that opened this.
  const skipRestoreRef = useRef(false);

  const roleOptions = useMemo(
    () => [...new Set([...roles.filter(Boolean), ...SEED_ROLES])].sort((a, b) => a.localeCompare(b)),
    [roles],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('add');
    const query = next.toString();
    // replace, not push: the drawer is not a place you should have to press
    // Back out of, and pushing would leave ?add=1 in the history so that Back
    // from anywhere later reopens an empty form. `scroll: false` keeps the
    // roster exactly where the owner left it.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  /** Escape, the backdrop, the ✕ and Cancel all come through here. */
  const requestClose = useCallback(() => {
    // With the discard question up, this can only have come from Escape — the
    // ✕, Cancel and the scrim are all behind that dialog's own backdrop. Escape
    // takes the safe half of a destructive choice, so it dismisses the question
    // and leaves the half-written form alone rather than answering "discard".
    if (confirmDiscard) {
      setConfirmDiscard(false);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    close();
  }, [close, confirmDiscard, dirty]);

  const discard = useCallback(() => {
    setConfirmDiscard(false);
    setDirty(false);
    close();
  }, [close]);

  // -- open / close side effects ---------------------------------------------

  // Read by the Escape listener below. requestClose changes identity whenever
  // `dirty` flips or the URL changes, and this effect must NOT re-run on that:
  // its cleanup restores focus, so a dependency that changes mid-edit would
  // yank focus out of the field being typed into on the first keystroke.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The page behind a drawer must not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The first thing you came here to type.
    nameRef.current?.focus();

    // Escape is also handled on the panel's own keydown; this second listener is
    // for the case where focus has escaped the panel entirely (a browser
    // extension, a stray click on the scrim) and the panel would never see it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    const opener = openerRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (skipRestoreRef.current) {
        skipRestoreRef.current = false;
        return;
      }
      // Back where they were. Without this, closing the drawer drops focus onto
      // <body> and the next Tab starts again from the top of the page.
      opener?.focus?.();
    };
  }, [open]);

  // Reopening is a fresh form. The drawer's markup is unmounted while closed, so
  // the uncontrolled fields clear themselves; these are the controlled ones plus
  // the object URL, which leaks until it is revoked.
  useEffect(() => {
    if (open) return;
    setDirty(false);
    setConfirmDiscard(false);
    setPhone('');
    setEmail('');
    setRole('');
    setNewRole('');
    setPhotoName(null);
    setPhotoProblem(null);
    setPhotoPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, [open]);

  // -- the result -------------------------------------------------------------

  useEffect(() => {
    if (state.status !== 'added') return;
    formRef.current?.reset();
    skipRestoreRef.current = true;
    onAdded({ id: state.id, name: state.name, message: state.message });
    close();
    // Keyed on the state object alone: useFormState hands back a new one per
    // submit, so this fires once per save. Including `close`/`onAdded` would
    // re-run it whenever the URL changed and announce the same person twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!open) return null;

  const roleValue = role === NEW_ROLE ? newRole : role;

  return (
    <div
      className={styles.drawerBackdrop}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          requestClose();
          return;
        }
        if (event.key !== 'Tab') return;
        // The discard confirmation owns focus while it is up — pulling it back
        // into the form underneath would put the caret somewhere the owner
        // cannot see, behind that dialog's own scrim.
        if (confirmDiscard) return;
        // FOCUS TRAP. A modal that lets Tab walk out onto the roster behind it
        // is a modal for sighted mouse users only: keyboard focus ends up on
        // controls covered by the scrim, which cannot be seen or scrolled to.
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
          (node) => !node.hasAttribute('hidden') && node.getClientRects().length > 0,
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className={styles.drawerScrim} onClick={requestClose} />

      <section
        ref={panelRef}
        className={`${styles.drawer} ${styles.addDrawer}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
      >
        <header className={styles.drawerHead}>
          <div>
            <h2 id={`${formId}-title`}>Add a crew member</h2>
            <p>Name, number, and how they&apos;re paid. Everything else can wait.</p>
          </div>
          <button type="button" className={styles.drawerClose} onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>

        {state.status === 'error' ? (
          <p className={styles.addError} role="alert">
            {state.message}
          </p>
        ) : null}

        <form id={formId} ref={formRef} action={formAction} className={styles.addForm}>
          {/* Touched, not different-from-default: this form starts empty, so
              anything typed into it is something to lose. */}
          <div
            className={styles.addFormBody}
            onInput={(event) => {
              if (event.nativeEvent.isTrusted) setDirty(true);
            }}
            onChange={(event) => {
              if (event.nativeEvent.isTrusted) setDirty(true);
            }}
          >
            <fieldset className={styles.addSection}>
              <legend>Basics</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${formId}-name`}>Name</label>
                  <input id={`${formId}-name`} ref={nameRef} name="name" required placeholder="Mike Torres" autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor={`${formId}-phone`}>Mobile number</label>
                  <input
                    id={`${formId}-phone`}
                    name="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="(248) 555-0117"
                    value={phone}
                    onChange={(event) => setPhone(formatPhoneAsTyped(event.target.value))}
                    aria-describedby={`${formId}-phone-why`}
                  />
                  {/* The real reason, not "it's required": assigning somebody to
                      a job sends them a text (sendCrewAssignmentSms), and a
                      customer picking a time sends them another
                      (sendCrewScheduleSelectedSms). Both go through
                      deliverCrewSms, which has nowhere to send. */}
                  <small id={`${formId}-phone-why`} className="field-hint">
                    We text this number when you assign them a job or a customer books a time — it&apos;s how they find
                    out about work. The email below is optional; this isn&apos;t.
                  </small>
                </div>

                <div className="field full">
                  <label htmlFor={`${formId}-role`}>Role</label>
                  {/* A LIST, NOT A TEXT BOX. Role is what the roster filters and
                      groups by, so free text meant one mistyped "QA Tester"
                      became a permanent filter category nobody could remove.
                      Naming a genuinely new role is still one click — it just
                      cannot happen by accident any more. */}
                  <select
                    id={`${formId}-role`}
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    aria-describedby={`${formId}-role-hint`}
                  >
                    <option value="">Laborer (default)</option>
                    {roleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={NEW_ROLE}>+ Add a new role…</option>
                  </select>
                  {role === NEW_ROLE ? (
                    <input
                      className={styles.addNewRole}
                      value={newRole}
                      onChange={(event) => setNewRole(event.target.value)}
                      placeholder="Name the new role, e.g. Crane operator"
                      aria-label="New role name"
                      autoFocus
                    />
                  ) : null}
                  <small id={`${formId}-role-hint`} className="field-hint">
                    Roles you already use are listed. A new one becomes a filter for everybody, so it&apos;s worth
                    checking the list first.
                  </small>
                  {/* One input carries the answer, whichever control produced it —
                      two fields sharing name="roleLabel" would post whichever the
                      browser reached first. */}
                  <input type="hidden" name="roleLabel" value={roleValue} />
                </div>
              </div>
            </fieldset>

            <fieldset className={styles.addSection}>
              <legend>Field app</legend>
              <div className="form-grid">
                <div className="field full">
                  <label htmlFor={`${formId}-email`}>Email address</label>
                  <input
                    id={`${formId}-email`}
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="mike@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <small className="field-hint">
                    The field app signs in by emailed link, so an invitation needs an address. Leave it blank and they
                    still get their job texts — they just can&apos;t log hours from their phone yet.
                  </small>
                </div>
              </div>
            </fieldset>

            <fieldset className={styles.addSection}>
              <legend>Compensation</legend>
              <div className="form-grid">
                <PayTypeFields idPrefix={formId} showPayrollId={false} />
              </div>
            </fieldset>

            <fieldset className={styles.addSection}>
              <legend>Advanced</legend>
              <div className="form-grid">
                <PayrollIdField idPrefix={formId} />

                <div className="field">
                  <label htmlFor={`${formId}-photo`}>Crew photo (optional)</label>
                  <input
                    id={`${formId}-photo`}
                    ref={photoRef}
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPhotoPreview((previous) => {
                        if (previous) URL.revokeObjectURL(previous);
                        return file ? URL.createObjectURL(file) : null;
                      });
                      setPhotoName(file?.name ?? null);
                      // Checked here as well as on the server, because a 6 MB
                      // photo otherwise fails only after the owner has filled in
                      // the whole form and pressed Save.
                      setPhotoProblem(
                        file && file.size > 4 * 1024 * 1024
                          ? 'That photo is over 4 MB. Pick a smaller one, or the save will be refused.'
                          : null,
                      );
                    }}
                  />
                  <small className="field-hint">JPG, PNG, WebP or AVIF, up to 4 MB. It becomes their avatar on the roster.</small>
                  {photoProblem ? <small className={styles.addPhotoProblem}>{photoProblem}</small> : null}
                  {photoPreview ? (
                    <div className={styles.addPhotoPreview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoPreview} alt={`Preview of the photo for ${photoName ?? 'this crew member'}`} />
                      <span>{photoName}</span>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          if (photoRef.current) photoRef.current.value = '';
                          setPhotoPreview((previous) => {
                            if (previous) URL.revokeObjectURL(previous);
                            return null;
                          });
                          setPhotoName(null);
                          setPhotoProblem(null);
                        }}
                      >
                        Remove photo
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </fieldset>
          </div>

          {/* TWO OUTCOMES, ONE SET OF FIELDS. `intent` rides with whichever
              button was pressed (SaveButton forwards name/value), so the owner
              decides about the invitation at the moment they decide about the
              person — not on a second screen afterwards. Both buttons disable
              themselves while the action is in flight, which is what stops the
              same crew member being added three times by an impatient click. */}
          <footer className={styles.addActions}>
            <SaveButton
              name="intent"
              value="invite"
              pendingLabel="Adding…"
              savedLabel="Added ✓"
              disabled={!email.trim()}
              aria-label={email.trim() ? undefined : 'Save and invite — add an email address first'}
            >
              Save and invite
            </SaveButton>
            <SaveButton
              className="btn secondary"
              name="intent"
              value="save"
              pendingLabel="Adding…"
              savedLabel="Added ✓"
            >
              Save without inviting
            </SaveButton>
            <button type="button" className="btn ghost" onClick={requestClose}>
              Cancel
            </button>
          </footer>
          {!email.trim() ? (
            <p className={styles.addActionsHint}>Add an email address above to offer them the field app.</p>
          ) : null}
        </form>

        {/* Leaving the PAGE while half-filled — the sidebar, a job link, a
            breadcrumb — is a different exit from closing this drawer, and only
            UnsavedGuard can catch it: a client-side navigation fires no
            beforeunload at all. */}
        <UnsavedGuard
          formId={formId}
          title="Leave without adding them?"
          body="You have started adding a crew member. If you leave now, nothing is saved."
          stayLabel="Keep adding"
          leaveLabel="Leave and lose it"
        />
      </section>

      {confirmDiscard ? (
        <div className="unsaved-guard-backdrop" role="dialog" aria-modal="true" aria-labelledby={`${formId}-discard`}>
          <div className="unsaved-guard-panel">
            <h3 id={`${formId}-discard`}>Discard this crew member?</h3>
            <p>You have filled in part of the form. Closing now throws it away.</p>
            <div className="unsaved-guard-actions">
              {/* Keeping is the default and takes the focus: the other button
                  cannot be undone. */}
              <button type="button" className="btn primary" onClick={() => setConfirmDiscard(false)} autoFocus>
                Keep adding
              </button>
              <button type="button" className="btn secondary" onClick={discard}>
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
