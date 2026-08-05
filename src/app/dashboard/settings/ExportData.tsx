'use client';

import { useState } from 'react';
import ModalDialog from '@/components/modal-dialog';
import { EXPORT_SETS, type ExportSetId } from '@/lib/data-export-sets';

/**
 * "Export business data" — one action, with the choice behind it.
 *
 * Four CSV pills side by side made picking the SET the first decision, when the
 * first decision is almost always "give me all of it". Everything is ticked to
 * start with, so the plain answer is one press and the specific answer is two.
 */
export default function ExportData() {
  const [picked, setPicked] = useState<Set<ExportSetId>>(() => new Set(EXPORT_SETS.map((set) => set.id)));
  const all = picked.size === EXPORT_SETS.length;
  const none = picked.size === 0;
  const href = `/api/export/all${all ? '' : `?sets=${[...picked].join(',')}`}`;

  function toggle(id: ExportSetId) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <ModalDialog triggerLabel="Export business data" triggerClassName="btn primary" title="Export business data">
      <div className="cash-bill-form">
        <p className="cash-bill-form-head">Choose what to include</p>
        <ul className="export-picker">
          {EXPORT_SETS.map((set) => (
            <li key={set.id}>
              <label>
                <input type="checkbox" checked={picked.has(set.id)} onChange={() => toggle(set.id)} />
                <span>
                  <strong>{set.label}</strong>
                  <small>{set.hint}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="cash-bill-note">
          {none
            ? 'Pick at least one to download.'
            : `${picked.size === 1 ? 'One file' : `${picked.size} files`} in a single .zip. The columns match what the importer accepts, so anything you export here can be brought back in as-is.`}
        </p>
        <div className="cash-bill-form-actions">
          {/* A plain link, not a fetch: the browser's own download handling is
              what saves the file, and routing an archive through JavaScript
              only adds a way for it to end up in memory instead of on disk. */}
          <a className={`btn primary${none ? ' is-disabled' : ''}`} href={href} aria-disabled={none} download>
            Download {none ? '' : all ? 'everything' : `${picked.size}`}
          </a>
        </div>
      </div>
    </ModalDialog>
  );
}
