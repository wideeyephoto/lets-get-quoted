'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import SaveFieldContactButton from '@/components/SaveFieldContactButton';
import styles from './field-intake-hint.module.css';

export type FieldIntakePage = 'leads' | 'jobs' | 'schedule' | 'clients' | 'crew';

interface FieldIntakeConfig {
  pillLabel: string;
  title: string;
  description: string;
  tag: string;
  examples: string[];
}

const CONFIGS: Record<FieldIntakePage, FieldIntakeConfig> = {
  leads: {
    pillLabel: 'Voice & Text-to-Lead',
    title: '🎙️ Voice & Text-to-Lead',
    tag: 'From the road',
    description: 'Text, send a voice memo, or call your shared field line hands-free (using Voice credits) from your truck to log new prospects without typing forms.',
    examples: [
      '"Met Dave at 124 Main St, needs roof replacement, phone 555-0192."',
      '"New lead: Sarah Miller on Oak Ave, wants kitchen remodel estimate."',
    ],
  },
  jobs: {
    pillLabel: 'Voice & Text-to-Job',
    title: '🎙️ Voice & Text-to-Job',
    tag: 'Owner & Crew',
    description: 'You and your verified crew can text, send voice memos, or call our shared field number (using Voice credits) to update job address, status, site notes, material costs, gate codes, or punch list items.',
    examples: [
      '"Update address for Smith job to 638 South Rochester Rd."',
      '"Gate code for Smith job on Main St is 4821."',
      '"Done with framing on Smith job, starting drywall tomorrow."',
      '"Used $75 of cement and $40 dump fee on the Miller job."',
      '"Add task for J-102: pick up 4 bags of grout."',
    ],
  },
  schedule: {
    pillLabel: 'Voice & Text-to-Schedule',
    title: '🎙️ Voice & Text-to-Schedule',
    tag: 'Calendar dispatch',
    description: 'Reschedule jobs or customer estimate visits from the road with a quick voice note, text, or hands-free call (using Voice credits).',
    examples: [
      '"Move the Smith job to Friday at 10am."',
      '"Reschedule Johnson estimate to next Tuesday morning."',
    ],
  },
  clients: {
    pillLabel: 'Voice & Text-to-Client',
    title: '🎙️ Voice & Text-to-Client',
    tag: 'Customer book',
    description: 'Update client phone numbers, emails, addresses, or client profile notes by sending a quick text or voice message.',
    examples: [
      '"Update phone for Dave Miller to (248) 555-9876."',
      '"Client note for Sarah Johnson: prefer text updates only, dog in backyard."',
    ],
  },
  crew: {
    pillLabel: 'Voice & Text-to-Crew',
    title: '🎙️ Voice & Text-to-Crew',
    tag: 'Field assignments',
    description: 'Assign crew from the road. Verified crew members can also message or call our shared field number (using Voice credits) to log job site updates and expenses.',
    examples: [
      '"Assign Mike and Dave to the Smith job tomorrow."',
      '"Put Alex on the Main St roof repair."',
      'Crew text: "Finished tile prep on J-101"',
    ],
  },
};

export default function FieldIntakeHint({
  page,
  compact = false,
}: {
  page: FieldIntakePage;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const config = CONFIGS[page];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className={styles.hintWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.hintPill}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={`hint-popover-${page}`}
        aria-label={`Learn how to update ${page} by voice or text`}
      >
        <span className={styles.hintIcon}>🎙️</span>
        <span>{compact ? 'Text/Voice' : config.pillLabel}</span>
      </button>

      {open && (
        <div id={`hint-popover-${page}`} className={styles.hintPopover} role="tooltip">
          <div className={styles.popoverHeader}>
            <span className={styles.popoverTitle}>
              {config.title}
            </span>
            <span className={styles.popoverTag}>{config.tag}</span>
          </div>

          <p className={styles.popoverDesc}>{config.description}</p>

          <div className={styles.examplesHeader}>Example voice notes & texts</div>
          <div className={styles.exampleList}>
            {config.examples.map((ex, idx) => (
              <div key={idx} className={styles.exampleItem}>
                {ex}
              </div>
            ))}
          </div>

          <div className={styles.popoverFooter}>
            <SaveFieldContactButton size="small" label="Save Field Line (.vcf)" />
            <Link href="/features/text-to-job" className={styles.learnMoreLink}>
              How it works →
            </Link>
          </div>
        </div>
      )}
    </span>
  );
}
