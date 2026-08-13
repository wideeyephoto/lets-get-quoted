'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './dispatch.module.css';

/**
 * "Add person", with the two kinds of person behind it.
 *
 * ONE BUTTON, TWO ANSWERS. The header used to say "+ Add crew member", which
 * was the whole vocabulary this page had: an employee. Now that a firm can also
 * be in the directory, the question at the top of the page is which of the two
 * you are adding — and that question has to be asked before the form appears,
 * because an employee and a subcontractor share almost none of their fields.
 *
 * The two items are LINKS, not buttons, for the same reason AddCrewDrawer reads
 * its open state from the URL: ?add=1 and ?add=sub are the whole state, so the
 * drawers open from the sidebar's New menu, from a bookmark and from a hard
 * reload through exactly one code path. See the long note in AddCrewDrawer.
 */
export default function AddPersonMenu({ employeeHref, subcontractorHref }: { employeeHref: string; subcontractorHref: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    // Opened from the keyboard or the mouse alike, the first item takes focus:
    // a menu you have to Tab into is a menu a screen-reader user cannot tell
    // has opened.
    firstItemRef.current?.focus();

    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.addPersonWrap} ref={wrapRef}>
      <button
        type="button"
        className="btn primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        + Add person
      </button>
      {open ? (
        <div className={styles.addPersonMenu} role="menu" aria-label="Add a person">
          <Link
            href={employeeHref}
            role="menuitem"
            ref={firstItemRef}
            className={styles.addPersonItem}
            onClick={() => setOpen(false)}
          >
            <strong>Add employee</strong>
            <small>On your payroll, logs hours, uses the field app.</small>
          </Link>
          <Link href={subcontractorHref} role="menuitem" className={styles.addPersonItem} onClick={() => setOpen(false)}>
            <strong>Add subcontractor</strong>
            <small>An outside firm you send job offers to.</small>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
