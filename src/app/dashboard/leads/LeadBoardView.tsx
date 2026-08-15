'use client';

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LeadStatus } from '@/lib/leads';
import { queueStageLabel } from '@/lib/lead-queue';
import { BOARD_CLOSED, BOARD_COLUMNS, boardActions } from '@/lib/lead-priority';
import type { LeadViewItem } from './LeadsWorkspace';
import { declineLeadAction, updateLeadStatusAction } from './actions';
import styles from './board.module.css';
import leadStyles from './leads.module.css';

/**
 * The Board — the pipeline as columns.
 *
 * Five equal columns gave Won and Lost the same room as work in progress, and
 * squeezed the three that matter to about 148px of card. Three active columns
 * now, with Won and Lost behind one collapsed "Closed" group: closed leads are
 * a reference, not a workload, and they were also still being offered actions
 * that contradicted their own stage — a lost lead with a Decline button.
 *
 * It is called a Kanban and the cards were not draggable. They are now, and
 * dragging is NOT the only way: every card carries a "Move to…" menu, because a
 * drag cannot be done with a keyboard, is miserable on a touchscreen, and is
 * invisible to anybody who does not think to try it.
 */

type Props = {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
};

const DECLINE_REASONS: { key: string; label: string }[] = [
  { key: 'out_of_area', label: 'Out of area' },
  { key: 'excluded_work', label: 'Not our work' },
  { key: 'below_minimum', label: 'Too small' },
  { key: 'fully_booked', label: 'Fully booked' },
];

const ALL_STAGES: LeadStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost'];

export default function LeadBoardView({ leads, run }: Props) {
  const [closedOpen, setClosedOpen] = useState(false);
  // Phones show one column at a time — a five-column board stacked vertically
  // was a 3,512px page you scrolled through four stages to reach the fifth.
  const [tab, setTab] = useState<LeadStatus>('new');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<LeadStatus | null>(null);
  // Announced when a lead moves, so a drag or a menu pick is not a silent
  // change for anybody not watching that corner of the screen.
  const [announcement, setAnnouncement] = useState('');

  const byStage = useMemo(() => {
    const map = new Map<LeadStatus, LeadViewItem[]>();
    for (const stage of ALL_STAGES) map.set(stage, []);
    for (const lead of leads) map.get(lead.status)?.push(lead);
    return map;
  }, [leads]);

  const closedCount = (byStage.get('won')?.length ?? 0) + (byStage.get('lost')?.length ?? 0);

  function move(lead: LeadViewItem, to: LeadStatus) {
    if (lead.status === to) return;
    setAnnouncement(`${lead.name} moved to ${queueStageLabel(to)}.`);
    run(() => updateLeadStatusAction(lead.id, to));
  }

  function onDrop(stage: LeadStatus) {
    setDropTarget(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((entry) => entry.id === id);
    if (lead) move(lead, stage);
  }

  const columnProps = (stage: LeadStatus) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(stage);
    },
    onDragLeave: () => setDropTarget((current) => (current === stage ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      onDrop(stage);
    },
  });

  return (
    <div className={styles.boardWrap}>
      <p className="sr-only" role="status">{announcement}</p>

      {/* Phones: stage tabs with counts, one column at a time. */}
      <div className={styles.stageTabs} role="tablist" aria-label="Pipeline stage">
        {BOARD_COLUMNS.map((column) => (
          <button
            key={column.status}
            type="button"
            role="tab"
            aria-selected={tab === column.status}
            className={styles.stageTab}
            onClick={() => setTab(column.status)}
          >
            {column.label}
            <span className={styles.stageTabCount}>{byStage.get(column.status)?.length ?? 0}</span>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'won'}
          className={styles.stageTab}
          onClick={() => setTab('won')}
        >
          Closed
          <span className={styles.stageTabCount}>{closedCount}</span>
        </button>
      </div>

      <div className={styles.board} data-tab={tab}>
        {BOARD_COLUMNS.map((column) => {
          const columnLeads = byStage.get(column.status) ?? [];
          return (
            <section
              key={column.status}
              className={`${styles.column}${dropTarget === column.status ? ` ${styles.columnDrop}` : ''}`}
              data-stage={column.status}
              aria-label={`${column.label} — ${columnLeads.length} lead${columnLeads.length === 1 ? '' : 's'}`}
              {...columnProps(column.status)}
            >
              <header className={styles.columnHead}>
                <h2>{column.label}</h2>
                <span>{columnLeads.length}</span>
              </header>
              <div className={styles.cards}>
                {columnLeads.map((lead) => (
                  <BoardCard
                    key={lead.id}
                    lead={lead}
                    run={run}
                    onMove={move}
                    dragging={dragId === lead.id}
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                  />
                ))}
                {columnLeads.length === 0 ? <p className={styles.empty}>Nothing here.</p> : null}
              </div>
            </section>
          );
        })}
      </div>

      {/* Closed: one collapsed group, not two columns of finished work taking
          the same room as the pipeline. */}
      <section className={styles.closed} data-tab-open={tab === 'won'}>
        <button
          type="button"
          className={styles.closedToggle}
          aria-expanded={closedOpen}
          aria-controls="board-closed"
          onClick={() => setClosedOpen((was) => !was)}
        >
          <span aria-hidden="true" className={styles.closedChev}>{closedOpen ? '▾' : '▸'}</span>
          Closed
          <span className={styles.closedCount}>{closedCount}</span>
          <span className={styles.closedHint}>Won and lost — finished work, kept for reference.</span>
        </button>
        {closedOpen ? (
          <div className={styles.closedBody} id="board-closed">
            {BOARD_CLOSED.map((column) => {
              const columnLeads = byStage.get(column.status) ?? [];
              return (
                <div
                  key={column.status}
                  className={`${styles.closedColumn}${dropTarget === column.status ? ` ${styles.columnDrop}` : ''}`}
                  {...columnProps(column.status)}
                >
                  <h3 className={styles.closedColumnHead}>
                    {column.label} <span>{columnLeads.length}</span>
                  </h3>
                  <div className={styles.cards}>
                    {columnLeads.map((lead) => (
                      <BoardCard
                        key={lead.id}
                        lead={lead}
                        run={run}
                        onMove={move}
                        dragging={dragId === lead.id}
                        onDragStart={() => setDragId(lead.id)}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      />
                    ))}
                    {columnLeads.length === 0 ? <p className={styles.empty}>Nothing here.</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BoardCard({
  lead,
  run,
  onMove,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  lead: LeadViewItem;
  run: Props['run'];
  onMove: (lead: LeadViewItem, to: LeadStatus) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [declining, setDeclining] = useState(false);
  const declineId = useId();
  const allowed = boardActions(lead.status);
  const moveRef = useRef<HTMLSelectElement>(null);

  return (
    <article
      id={`lead-row-${lead.id}`}
      className={`${styles.card}${dragging ? ` ${styles.cardDragging}` : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        // Firefox will not start a drag without data on the transfer.
        event.dataTransfer.setData('text/plain', lead.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {/* Name, job, priority/waiting, next action — and nothing else. The card
          was carrying source, estimated hours, a received date and a contact
          hint in 148px. */}
      <Link className={styles.cardName} href={`/dashboard/leads/${lead.id}`}>
        {lead.name}
        {lead.city ? <span className={styles.cardCity}> ({lead.city})</span> : null}
      </Link>
      <p className={styles.cardProject}>{lead.detail}</p>

      <p className={styles.cardMeta}>
        <span className={`${leadStyles.heatDot} ${styles.cardDot}`} data-score={lead.score} aria-hidden="true" />
        <span className={styles.cardHeat} data-score={lead.score}>{lead.scoreLabel}</span>
        {lead.waitingShort ? <span className={styles.cardWait}>{lead.waitingShort}</span> : null}
        {lead.estimateLabel ? <span className={styles.cardValue}>{lead.estimateLabel}</span> : null}
      </p>

      <div className={styles.cardActions}>
        {allowed.includes('contacted') ? (
          <button type="button" className={styles.cardBtn} onClick={() => run(() => updateLeadStatusAction(lead.id, 'contacted'))}>
            Mark contacted
          </button>
        ) : null}
        {allowed.includes('quote') ? (
          <Link className={styles.cardBtn} href={`/dashboard/leads/${lead.id}#lead-estimate`}>
            Send quote
          </Link>
        ) : null}
        {allowed.includes('won') ? (
          <button type="button" className={styles.cardBtn} onClick={() => run(() => updateLeadStatusAction(lead.id, 'won'))}>
            Mark won
          </button>
        ) : null}
        {allowed.includes('decline') ? (
          <button
            type="button"
            className={styles.cardBtn}
            aria-expanded={declining}
            aria-controls={declining ? declineId : undefined}
            onClick={() => setDeclining((was) => !was)}
          >
            Mark lost
          </button>
        ) : null}
        {lead.convertedJob ? (
          <Link className={styles.cardBtn} href={`/dashboard/jobs/${lead.convertedJob}`}>Open job →</Link>
        ) : null}
      </div>

      {declining ? (
        <div id={declineId} className={styles.decline}>
          <p>Why mark this lead lost?</p>
          <div className={styles.declineReasons}>
            {DECLINE_REASONS.map((reason) => (
              <button
                key={reason.key}
                type="button"
                className={styles.declineChip}
                onClick={() => { setDeclining(false); run(() => declineLeadAction(lead.id, reason.key, false)); }}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.declineCancel} onClick={() => setDeclining(false)}>Cancel</button>
        </div>
      ) : null}

      {/* The keyboard and touch path to the same thing dragging does. A real
          <select>, so it works with a keyboard, with a screen reader, and with
          a thumb — none of which can drag. */}
      <div className={styles.moveRow}>
        <label className={styles.moveLabel} htmlFor={`move-${lead.id}`}>Move to…</label>
        <select
          id={`move-${lead.id}`}
          ref={moveRef}
          className={styles.moveSelect}
          value={lead.status}
          onChange={(event) => onMove(lead, event.target.value as LeadStatus)}
        >
          {ALL_STAGES.map((stage) => (
            <option key={stage} value={stage}>{queueStageLabel(stage)}</option>
          ))}
        </select>
      </div>

      {/* No "More" menu here on purpose. Its only two items were "Open the full
          lead", which is what the name is, and "Send a quote", which is already
          a button at the stage where it applies. A card meant to show name, job,
          priority and the next action does not need a menu of things it is
          already showing. */}
    </article>
  );
}
