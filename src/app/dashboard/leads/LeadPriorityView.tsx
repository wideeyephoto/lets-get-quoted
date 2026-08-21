'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { primaryAction, priorityTone, rankLeads, type RankedLead } from '@/lib/lead-priority';
import type { LeadViewItem } from './LeadsWorkspace';
import { archiveLeadAction, snoozeLeadAction, unsnoozeLeadAction, updateLeadStatusAction } from './actions';
import RowMenu from './RowMenu';
import styles from './priority.module.css';
import leadStyles from './leads.module.css';

/**
 * The Priority inbox — what to do next, in order, and why.
 *
 * Three things were wrong with the old one and all three were structural.
 * It included won and lost leads, so the list was not a queue. It ranked by
 * heat alone, so a lead nobody had answered in four days sat under a warm one
 * that arrived this morning. And it explained itself with a colored dot.
 *
 * Now: closed leads never appear, lib/lead-priority does the ordering, and
 * every card prints the sentence that put it where it is.
 *
 * One primary action per card, chosen from how the homeowner asked to be
 * reached — the old row offered call / text / snooze / open to everybody,
 * including a Call button to a lead who had asked not to be called, and on a
 * phone those four left about 42px for the name.
 */

type Props = {
  leads: LeadViewItem[];
  snoozed: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  /** See LeadsWorkspace: controls only an owner can actually run. */
  ownerControls: boolean;
};

export default function LeadPriorityView({ leads, snoozed, run, ownerControls }: Props) {
  const { actNow, followUp, snoozed: snoozedRanked } = useMemo(
    () => rankLeads(leads, { snoozed }),
    [leads, snoozed],
  );

  if (leads.length === 0 && snoozed.length === 0) {
    return <p className="empty-state">No active leads right now.</p>;
  }

  return (
    <div className={styles.priority}>
      <Group
        ownerControls={ownerControls}
        id="act-now"
        title="Act now"
        blurb="Nobody has replied, or you said you would and haven’t."
        tone="urgent"
        entries={actNow}
        run={run}
        empty="Nothing is overdue. Every open lead has had a reply and a quote is not sitting untouched."
      />
      <Group
        ownerControls={ownerControls}
        id="follow-up"
        title="Follow up"
        blurb="In flight — recently touched, nothing overdue."
        entries={followUp}
        run={run}
        empty="Nothing in flight."
      />
      {snoozedRanked.length > 0 ? (
        <Group
          ownerControls={ownerControls}
          id="snoozed"
          title="Snoozed"
          blurb="Out of the queue until the date you set."
          entries={snoozedRanked}
          run={run}
          snoozedGroup
          empty=""
        />
      ) : null}
    </div>
  );
}

function Group({
  id,
  title,
  blurb,
  entries,
  run,
  empty,
  tone,
  snoozedGroup = false,
  ownerControls,
}: {
  id: string;
  ownerControls: boolean;
  title: string;
  blurb: string;
  entries: RankedLead<LeadViewItem>[];
  run: Props['run'];
  empty: string;
  tone?: 'urgent';
  snoozedGroup?: boolean;
}) {
  if (entries.length === 0 && !empty) return null;
  return (
    <section className={styles.group} aria-labelledby={`prio-${id}`}>
      <header className={styles.groupHead}>
        <h2 id={`prio-${id}`} className={styles.groupTitle} data-tone={tone}>
          {title}
        </h2>
        <span className={styles.groupCount}>{entries.length}</span>
        <p className={styles.groupBlurb}>{blurb}</p>
      </header>
      {entries.length === 0 ? (
        <p className={styles.groupEmpty}>{empty}</p>
      ) : (
        <ul className={styles.cards}>
          {entries.map((entry) => (
            <PriorityCard key={entry.lead.id} entry={entry} run={run} snoozedGroup={snoozedGroup} ownerControls={ownerControls} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PriorityCard({
  entry,
  run,
  snoozedGroup,
  ownerControls,
}: {
  entry: RankedLead<LeadViewItem>;
  run: Props['run'];
  snoozedGroup: boolean;
  ownerControls: boolean;
}) {
  const lead = entry.lead;
  const action = primaryAction(lead);
  const [busy, setBusy] = useState(false);

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    run(async () => {
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <li id={`lead-row-${lead.id}`} className={styles.card} data-tier={entry.tier}>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          {/* The detail page is still owner-guarded, so for an office user this
              link bounces them off the board. The name still has to render, so
              it becomes plain text rather than disappearing. */}
          {ownerControls ? (
            <Link href={`/dashboard/leads/${lead.id}`} className={styles.cardName}>
              {lead.name}
              {lead.city ? <span className={styles.cardCity}> ({lead.city})</span> : null}
            </Link>
          ) : (
            <span className={styles.cardName}>
              {lead.name}
              {lead.city ? <span className={styles.cardCity}> ({lead.city})</span> : null}
            </span>
          )}
          {lead.estimateLabel ? <span className={styles.cardValue}>{lead.estimateLabel}</span> : null}
        </div>

        <p className={styles.cardProject}>{lead.detail}</p>

        {/* The ranking, in words. This is the whole point: the list is in an
            order, and the order has to be legible without asking anybody to
            interpret a color. */}
        <p className={styles.reason}>
          <span className={`${leadStyles.heatDot} ${styles.reasonDot}`} data-score={priorityTone(lead)} aria-hidden="true" />
          {snoozedGroup && lead.snoozedUntilLabel ? `Snoozed until ${lead.snoozedUntilLabel} · ` : ''}
          {entry.reason}
        </p>

        {lead.textOnly ? <p className={styles.pref}>They asked to be texted, not called.</p> : null}
      </div>

      {/* Actions BENEATH the information, full width on a phone. */}
      <div className={styles.cardActions}>
        {snoozedGroup ? (
          <button
            type="button"
            className={`btn primary ${styles.primaryBtn}`}
            disabled={busy}
            onClick={() => act(() => unsnoozeLeadAction(lead.id))}
          >
            Wake up now
          </button>
        ) : action.kind === 'edit' ? (
          <Link className={`btn primary ${styles.primaryBtn}`} href={action.href}>
            Add contact details
          </Link>
        ) : (
          <a className={`btn primary ${styles.primaryBtn}`} href={action.href}>
            {action.kind === 'text' ? '💬 Text' : action.kind === 'email' ? '✉️ Email' : '📞 Call'} {lead.name.split(/\s+/)[0]}
          </a>
        )}

        <RowMenu
          label={`More actions for ${lead.name}`}
          items={[
            // Owner-only destinations, dropped rather than shown disabled: the
            // detail page is still owner-guarded, and Mark won reaches job_feed
            // with the service role.
            ...(ownerControls
              ? [{ key: 'open', kind: 'link' as const, label: 'Open the full lead', href: `/dashboard/leads/${lead.id}` }]
              : []),
            ...(lead.status !== 'contacted'
              ? [{ key: 'contacted', kind: 'button' as const, label: 'Mark contacted', onSelect: () => act(() => updateLeadStatusAction(lead.id, 'contacted')) }]
              : []),
            ...(ownerControls
              ? [{ key: 'won', kind: 'button' as const, label: 'Mark won', onSelect: () => act(() => updateLeadStatusAction(lead.id, 'won')) }]
              : []),
            ...(snoozedGroup
              ? []
              : [{ key: 'snooze', kind: 'button' as const, label: 'Snooze 3 days', onSelect: () => act(() => snoozeLeadAction(lead.id, 3)) }]),
            { key: 'archive', kind: 'button', label: 'Archive', onSelect: () => act(() => archiveLeadAction(lead.id, true)) },
          ]}
        />
      </div>
    </li>
  );
}

/** Exposed for the harness and the tests — the words the groups use. */
export const PRIORITY_GROUP_TITLES = ['Act now', 'Follow up', 'Snoozed'] as const;
