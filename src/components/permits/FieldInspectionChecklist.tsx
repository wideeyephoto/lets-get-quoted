'use client';

import React, { useState } from 'react';
import styles from './FieldInspectionChecklist.module.css';

export type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  citation?: string;
  defaultChecked?: boolean;
};

export const DEFAULT_FIELD_INSPECTION_ITEMS: ChecklistItem[] = [
  {
    id: 'permit_card_posted',
    title: 'Post Physical Permit Card',
    description: 'Ensure official city permit placard is posted and visible from the street or front window.',
    citation: 'MRC § R105.7',
  },
  {
    id: 'ladder_safety_access',
    title: 'Secure Ladder Access for Inspector',
    description: 'Set OSHA-compliant ladder tied off at the top and extending 3 feet above roofline/eave.',
    citation: 'OSHA 1926.1053',
  },
  {
    id: 'underlayment_ice_photos',
    title: 'Underlayment & Ice Barrier Verification',
    description: 'Have photos or exposed ice barrier documentation ready for building inspector verification.',
    citation: '2015 MRC § R905.1.2',
  },
  {
    id: 'manufacturer_specs',
    title: 'Manufacturer Specifications on Site',
    description: 'Keep shingle bundle wrapper or product installation instructions available on the job site.',
    citation: 'MRC § R905.2.1',
  },
  {
    id: 'approved_plans',
    title: 'Approved Drawings & Scope Notes',
    description: 'Have stamped plans, load calculations, or scope documentation readily accessible.',
    citation: 'MRC § R106.3.1',
  },
];

export interface FieldInspectionChecklistProps {
  permitNumber?: string | null;
  authorityName?: string | null;
  items?: ChecklistItem[];
}

export function FieldInspectionChecklist({
  permitNumber,
  authorityName,
  items = DEFAULT_FIELD_INSPECTION_ITEMS,
}: FieldInspectionChecklistProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    items.forEach((item) => {
      if (item.defaultChecked) initial.add(item.id);
    });
    return initial;
  });

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const total = items.length;
  const completed = checkedIds.size;
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isAllReady = completed === total;

  return (
    <section className={styles.card} aria-label="Field Inspection Readiness">
      <div className={styles.header}>
        <h3 className={styles.title}>
          <span>🔍</span> On-Site Inspection Readiness
        </h3>
        <span className={styles.badge}>
          {isAllReady ? '✓ 100% Ready' : `${completed} of ${total} Ready`}
        </span>
      </div>

      <p className={styles.lead}>
        Verify these items on site before the municipal inspector arrives to guarantee a first-time pass.
        {permitNumber && authorityName && (
          <strong> Permit #{permitNumber} ({authorityName}).</strong>
        )}
      </p>

      <div className={styles.progressBarContainer} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.progressBar} style={{ width: `${progressPct}%` }} />
      </div>

      <ul className={styles.checklist}>
        {items.map((item) => {
          const isDone = checkedIds.has(item.id);
          return (
            <li
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`${styles.checkItem} ${isDone ? styles.checkItemDone : ''}`}
            >
              <input
                type="checkbox"
                id={`chk-${item.id}`}
                checked={isDone}
                onChange={() => toggleItem(item.id)}
                onClick={(e) => e.stopPropagation()}
                className={styles.checkbox}
              />
              <div className={styles.itemContent}>
                <p className={`${styles.itemTitle} ${isDone ? styles.itemTitleDone : ''}`}>
                  {item.title}
                </p>
                <p className={styles.itemDesc}>{item.description}</p>
                {item.citation && <span className={styles.citation}>{item.citation}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.footerNote}>
        <span>⚠️ Failure to post permit or provide safe access causes failed inspections and municipal re-inspection fees.</span>
      </div>
    </section>
  );
}
