'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import SaveFieldContactButton from '@/components/SaveFieldContactButton';
import styles from './field-intake-hint.module.css';

export type FieldIntakePage = 'leads' | 'jobs' | 'schedule' | 'clients' | 'crew' | 'booking' | 'quick-stops' | 'recurring' | 'voice';

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
    description: 'Text, send a voice memo, or call your shared field line hands-free (using Voice credits) from your truck to log new prospects and update lead details without typing forms.',
    examples: [
      '"Met Dave at 124 Main St, needs roof replacement, phone (248) 555-0192."',
      '"New lead: Sarah Miller on Oak Ave, wants kitchen remodel estimate."',
      '"Follow up with Dave at 124 Main St tomorrow morning."',
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
    description: 'Reschedule jobs, book estimate visits, or adjust crew dates from the road with a quick voice note, text, or hands-free call (using Voice credits).',
    examples: [
      '"Move the Smith job to Friday at 10am."',
      '"Reschedule Johnson estimate to next Tuesday morning."',
      '"Book Friday afternoon for final inspection on J-104."',
    ],
  },
  booking: {
    pillLabel: 'Voice & Text-to-Book',
    title: '🎙️ Voice & Text-to-Book',
    tag: 'Arrival windows',
    description: 'Hold arrival windows, block off time, or adjust booking availability from the road with a quick voice note, text, or hands-free call (using Voice credits).',
    examples: [
      '"Block off this Friday afternoon for truck maintenance."',
      '"Hold tomorrow morning slot for 142 Elm St estimate."',
      '"Block out next Monday for doctor appointment."',
    ],
  },
  'quick-stops': {
    pillLabel: 'Voice & Text-to-Quick-Stop',
    title: '🎙️ Voice & Text-to-Quick-Stop',
    tag: 'Same-day route fill',
    description: 'Review and accept nearby filler stops hands-free while driving. Text or call our shared field line to adjust detour limits or fit emergency repairs into today’s route.',
    examples: [
      '"Can we squeeze in a 30-min pipe repair on Elm St this afternoon?"',
      '"Accept quick stop for 84 Oak Ave between 2pm and 4pm."',
      '"Turn on quick stops for 10 miles around Royal Oak."',
    ],
  },
  recurring: {
    pillLabel: 'Voice & Text-to-Recurring',
    title: '🎙️ Voice & Text-to-Recurring',
    tag: 'Repeating service',
    description: 'Skip visits, pause maintenance agreements, or adjust recurring service frequencies hands-free from the truck by texting or calling your field line.',
    examples: [
      '"Skip next week\'s lawn service for the Miller property."',
      '"Change Johnson pool service from biweekly to weekly starting next month."',
      '"Pause recurring cleaning for 402 Pine St until June."',
    ],
  },
  voice: {
    pillLabel: 'Voice & Text Field Line',
    title: '🎙️ Voice & Text Field Line',
    tag: 'Hands-free copilot',
    description: 'Call or text your shared field number (using Voice credits) anytime from your truck or job site. Your AI receptionist and copilot logs jobs, leads, notes, and arrival windows instantly.',
    examples: [
      '"Met Dave at 124 Main St, needs roof replacement, phone (248) 555-0192."',
      '"Done framing on Smith job, starting drywall tomorrow."',
      '"Move Johnson estimate to next Tuesday morning."',
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
    description: 'Assign crew from the road and track job labor. Verified crew members can also text or call our shared field number (using Voice credits) to log job site updates, hours, and receipts.',
    examples: [
      '"Assign Mike and Dave to the Smith job tomorrow."',
      '"Put Alex on the Main St roof repair."',
      'Crew text: "Finished tile prep on J-101, starting grout."',
      'Crew text: "Logged 4 hours on Smith framing today"',
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
            <SaveFieldContactButton size="small" label="Save Field Line (.vcf)" className={styles.saveContactBtn} />
            <Link href="/features/text-to-job" className={styles.learnMoreLink}>
              How it works →
            </Link>
          </div>
        </div>
      )}
    </span>
  );
}
