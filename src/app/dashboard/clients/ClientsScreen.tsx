'use client';

import { useState } from 'react';
import Link from 'next/link';
import ClientsWorkspace, { type ClientRow } from './ClientsWorkspace';
import DuplicateClients from './DuplicateClients';
import type { DuplicateMember } from './DuplicateGroupForm';
import type { ClientMapPin } from './ClientsMap';
import type { ClientsView } from '@/lib/dashboard-views';
import type { DuplicateGroup } from '@/lib/client-duplicates';
import pageStyles from './clients-page.module.css';
import ClientHeaderActions from './ClientHeaderActions';
import FieldIntakeHint from '@/components/field-intake-hint';

/**
 * The customer book, given its rows.
 *
 * Split out of page.tsx so the demo renders the same screen — see the note on
 * CampaignsScreen. Everything that writes (Add a client, Import) is withheld
 * under readOnly rather than shown and then failing on submit.
 */
export default function ClientsScreen({
  rows,
  pins,
  todayKey,
  view,
  repeatCount,
  showExistingFlash = false,
  mergedCount = 0,
  duplicateGroups = [],
  mergeAction,
  dismissDuplicateAction,
  dismissError = false,
  openAdd = false,
  basePath = '/dashboard',
  readOnly = false,
}: {
  rows: ClientRow[];
  pins: ClientMapPin[];
  todayKey: string;
  view: ClientsView;
  repeatCount: number;
  showExistingFlash?: boolean;
  /** How many records the merge just absorbed, for the confirmation line. */
  mergedCount?: number;
  duplicateGroups?: DuplicateGroup<DuplicateMember>[];
  /** Withheld on the demo, where nothing may write. */
  mergeAction?: (formData: FormData) => Promise<void>;
  /** The other answer: not the same customer. Also withheld on the demo. */
  dismissDuplicateAction?: (formData: FormData) => Promise<void>;
  /** The dismissal could not be stored — said on the panel, not thrown. */
  dismissError?: boolean;
  openAdd?: boolean;
  basePath?: string;
  readOnly?: boolean;
}) {
  const [dupesOpen, setDupesOpen] = useState(dismissError);

  const duplicateButton = duplicateGroups.length > 0 ? (
    <button
      type="button"
      className={`btn dupe-badge ${dupesOpen ? 'is-active' : ''}`}
      onClick={() => setDupesOpen((open) => !open)}
      aria-expanded={dupesOpen}
      aria-controls="duplicate-clients-panel"
      title={dupesOpen ? 'Hide duplicate suggestions' : 'Review duplicate suggestions'}
    >
      Possible duplicates · {duplicateGroups.length}
    </button>
  ) : null;

  return (
    <main className={`wide-shell workspace-shell ${pageStyles.screen}`}>
      {showExistingFlash ? (
        <p className="flash flash-info">That phone or email is already on a customer — here they are, rather than a second copy.</p>
      ) : null}

      {mergedCount > 0 ? (
        <p className="flash flash-success">
          Merged {mergedCount} duplicate record{mergedCount === 1 ? '' : 's'} into this customer. Their
          jobs, leads, recurring plans and Quick Stop requests all moved across.
        </p>
      ) : null}

      {/* When opened, the duplicate resolution panel expands above the workspace card.
          When closed, no card occupies space here. */}
      {duplicateGroups.length > 0 && dupesOpen ? (
        <div id="duplicate-clients-panel">
          <DuplicateClients
            groups={duplicateGroups}
            action={readOnly ? undefined : mergeAction}
            dismissAction={readOnly ? undefined : dismissDuplicateAction}
            dismissError={dismissError}
            onClose={() => setDupesOpen(false)}
          />
        </div>
      ) : null}

      <section className={`panel workspace-section-card ${pageStyles.workspaceCard}`} aria-labelledby="clients-title">
        <div className={`section-heading workspace-section-heading ${pageStyles.workspaceHeading}`}>
          <div className={pageStyles.headingCopy}>
            <p className={`eyebrow ${pageStyles.eyebrow}`}>Clients</p>
            <div className={pageStyles.titleRow}>
              <h1 id="clients-title" className={pageStyles.title}>Customers</h1>
              {readOnly ? null : <ClientHeaderActions basePath={basePath} />}
            </div>
          </div>

          {readOnly ? null : (
            <div className={pageStyles.heroActions}>
              <FieldIntakeHint page="clients" />
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="empty-state">
            No clients yet. Add your first customer above, or{' '}
            <Link href={`${basePath}/clients/import`}>import your existing customer list</Link>. Every job you create adds
            its customer here automatically too.
          </p>
        ) : null}
        {/* Rendered even with an empty book so search, layout preferences and
            the post-add dialog keep one stable owner. */}
        <ClientsWorkspace
          clients={rows}
          pins={pins}
          todayKey={todayKey}
          initialView={view}
          openAdd={openAdd}
          basePath={basePath}
          readOnly={readOnly}
          duplicateButton={duplicateButton}
        />
      </section>

    </main>
  );
}
