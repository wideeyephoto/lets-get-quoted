'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { formSignature, shouldShowSave, type FormEntry } from '@/lib/form-dirty';

// When a SaveButton is rendered inside this provider, a successful save scrolls
// the window to the top — used on the Lead/Job detail pages so the owner lands
// back at the updated hero after editing any field. Off (false) everywhere else.
const ScrollTopOnSaveContext = createContext(false);

export function ScrollTopOnSaveProvider({ children }: { children: ReactNode }) {
  return <ScrollTopOnSaveContext.Provider value={true}>{children}</ScrollTopOnSaveContext.Provider>;
}

type Props = {
  children?: React.ReactNode;
  pendingLabel?: string;
  savedLabel?: string;
  className?: string;
  // Lets one form host multiple submit buttons that call different (bound)
  // server actions — e.g. "Save & text" vs "Save, no text".
  formAction?: (formData: FormData) => void | Promise<void>;
  'aria-label'?: string;
  // Submitted with the form when THIS button is the one pressed — lets one form
  // offer two choices (e.g. pay per cycle vs. pay up front) over one set of
  // shared fields, instead of duplicating the fields into two forms.
  name?: string;
  value?: string;
  /**
   * Skip the browser's constraint check for THIS button.
   *
   * A form can host two submits that want different fields — the duplicate
   * panel's "Merge" needs the required survivor radio, "Not duplicates" has no
   * interest in which record would have survived and must not be blocked by it.
   */
  formNoValidate?: boolean;
  /** Native tooltip, for saying what a second submit does differently. */
  title?: string;
  // Blocked for a reason other than "already submitting" — e.g. a prerequisite
  // the owner has to go and set up first. Kept separate from `pending` so the
  // label and the busy state don't have to lie about which one it is.
  disabled?: boolean;
  /**
   * Hide until the owning form has actually been edited.
   *
   * OPT-IN, and it has to be. This button is on ~40 forms, and plenty of them
   * have nothing to be dirty about: "Send test digest" submits no fields at all,
   * "Turn on recommended" is an action rather than an edit, and a form with no
   * inputs would compare equal to itself forever and never show its button
   * again. So the default is unchanged and settings panels ask for this.
   */
  onlyWhenChanged?: boolean;
};

// Submit button for a Server Action form. Shows a pending state while the
// action is in flight, then briefly confirms success once it completes.
export default function SaveButton({
  children = 'Save changes',
  pendingLabel = 'Saving…',
  savedLabel = 'Saved ✓',
  className = 'btn primary',
  formAction,
  'aria-label': ariaLabel,
  disabled = false,
  name,
  value,
  formNoValidate = false,
  title,
  onlyWhenChanged = false,
}: Props) {
  const { pending } = useFormStatus();
  const scrollTopOnSave = useContext(ScrollTopOnSaveContext);
  const [showSaved, setShowSaved] = useState(false);
  const wasPending = useRef(false);

  // -- "Only once something changed" ------------------------------------------
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseline = useRef<string>('');
  const [dirty, setDirty] = useState(false);

  const readForm = useCallback((form: HTMLFormElement) => {
    // Cast rather than widen the lib type: FormDataEntryValue is string | File,
    // and File structurally satisfies the {name, size} the signature needs.
    return formSignature(Array.from(new FormData(form).entries()) as unknown as FormEntry[]);
  }, []);

  useEffect(() => {
    if (!onlyWhenChanged) return;
    const form = buttonRef.current?.form;
    if (!form) return;
    baseline.current = readForm(form);
    const check = () => setDirty(readForm(form) !== baseline.current);
    // 'input' catches typing; 'change' catches checkboxes, selects, files and
    // anything a script sets and dispatches. Both, because neither covers the
    // other — a <select> fires only change, a text field fires input per key.
    form.addEventListener('input', check);
    form.addEventListener('change', check);
    // A form React re-renders with fresh defaults after a revalidation has a new
    // resting state, and the old baseline would leave it permanently "dirty".
    form.addEventListener('reset', () => {
      // After the browser has applied the reset, not before.
      requestAnimationFrame(() => { baseline.current = readForm(form); setDirty(false); });
    });
    return () => {
      form.removeEventListener('input', check);
      form.removeEventListener('change', check);
    };
  }, [onlyWhenChanged, readForm]);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setShowSaved(true);
      if (scrollTopOnSave) window.scrollTo({ top: 0, behavior: 'smooth' });
      // What was just submitted is the new resting state. Without this the form
      // stays "dirty" after a successful save and the button never goes away —
      // which is the whole point of it appearing in the first place.
      const form = buttonRef.current?.form;
      if (onlyWhenChanged && form) {
        baseline.current = readForm(form);
        setDirty(false);
      }
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    wasPending.current = pending;
  }, [pending, scrollTopOnSave, onlyWhenChanged, readForm]);

  const visible = shouldShowSave({ onlyWhenChanged, dirty, pending, justSaved: showSaved });

  return (
    <button
      ref={buttonRef}
      type="submit"
      className={className}
      /* Hidden rather than unmounted: the effects above reach the form through
         this button's own .form property, and a button that removes itself takes
         its listeners with it and can never come back. `hidden` also keeps it
         out of the accessibility tree and out of the layout. */
      hidden={!visible}
      /* Disabled too, so a clean form cannot be submitted by pressing Enter in a
         text field — implicit submission finds the first submit button whether
         it is visible or not. */
      disabled={pending || disabled || !visible}
      aria-busy={pending}
      formAction={formAction}
      formNoValidate={formNoValidate}
      title={title}
      aria-label={ariaLabel}
      name={name}
      value={value}
    >
      {pending ? pendingLabel : showSaved ? savedLabel : children}
    </button>
  );
}
