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
    description: 'Text or send a voice memo (using AI Intake) to your shared field line to capture new prospects or stage estimates for review. Live hands-free calling uses Voice credits.',
    examples: [
      '"Met Dave at 124 Main St, needs roof replacement, phone (248) 555-0192."',
      '"New lead: Sarah Miller on Oak Ave, wants kitchen remodel estimate."',
      '"Estimate request from Jim Taylor at 88 Pine St, phone (586) 555-0144."',
    ],
  },
  jobs: {
    pillLabel: 'Voice & Text-to-Job',
    title: '🎙️ Voice & Text-to-Job',
    tag: 'Owner field notes',
    description: 'Text or send voice memos (using AI Intake) to append internal job notes, gate codes, site observations, material costs, or tasks. True job creation and address mutations are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Gate code for Smith job on Main St is 4821."',
      '"Drywall delivery arriving tomorrow morning at 8am on J-101."',
      '"Used $75 of cement and $40 dump fee on the Miller job."',
      '"Add task for J-102: pick up 4 bags of grout."',
    ],
  },
  schedule: {
    pillLabel: 'Voice & Text-to-Schedule',
    title: '🎙️ Voice & Text-to-Schedule',
    tag: 'Field notes',
    description: 'Text or dictate site progress notes and material costs (using AI Intake). Calendar rescheduling and arrival-window changes are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Note for Smith job: framing inspection scheduled for Friday."',
      '"Add note to J-103: client requested afternoon arrival."',
      '"Add task for Miller job: confirm dumpster drop-off date."',
    ],
  },
  booking: {
    pillLabel: 'Voice & Text-to-Book',
    title: '🎙️ Voice & Text-to-Book',
    tag: 'Availability note',
    description: 'Text notes or stage new prospect inquiries from the field (using AI Intake). Arrival-window booking holds and calendar slots are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"New lead: Greg Hall on Maple Rd, needs gutter estimate."',
      '"Note for J-105: homeowner requested Monday morning window."',
      '"Add task for office: block out Friday afternoon for truck service."',
    ],
  },
  'quick-stops': {
    pillLabel: 'Voice & Text-to-Quick-Stop',
    title: '🎙️ Voice & Text-to-Quick-Stop',
    tag: 'Route notes',
    description: 'Log road notes, capture new nearby leads, or track supplies (using AI Intake). Same-day quick stop acceptance and detour routes are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Met Dave next door to Smith job, wants estimate for tree trimming."',
      '"Used $35 hardware store run for emergency pipe repair."',
      '"Add task for shop: restock 1/2-inch copper fittings."',
    ],
  },
  recurring: {
    pillLabel: 'Voice & Text-to-Recurring',
    title: '🎙️ Voice & Text-to-Recurring',
    tag: 'Service notes',
    description: 'Log maintenance site notes, material receipts, or new service inquiries (using AI Intake). Recurring schedule intervals and pauses are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Note for Miller lawn service: back gate lock is sticking."',
      '"New lead: Bob Taylor across from Miller job wants biweekly mowing."',
      '"Used $48 fertilizer bag on Oak Ave property."',
    ],
  },
  voice: {
    pillLabel: 'Voice & Text Field Line',
    title: '🎙️ Voice & Text Field Line',
    tag: 'Field intake',
    description: 'Text or send voice memos to your shared field line (using AI Intake). Live hands-free phone calls use Voice credits when a dedicated number is active.',
    examples: [
      '"Met Dave at 124 Main St, needs roof replacement, phone (248) 555-0192."',
      '"Gate code for Smith job is 4821."',
      '"Used $75 cement and $40 dump fee on Miller job."',
    ],
  },
  clients: {
    pillLabel: 'Voice & Text-to-Client',
    title: '🎙️ Voice & Text-to-Client',
    tag: 'Client notes',
    description: 'Capture new client inquiries or log site observations (using AI Intake). Direct client profile edits are managed in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Met Dave Miller at 124 Main St, needs estimate, phone (248) 555-9876."',
      '"Note for Sarah Johnson: prefer text updates only, dog in backyard."',
    ],
  },
  crew: {
    pillLabel: 'Voice & Text-to-Crew',
    title: '🎙️ Voice & Text-to-Crew',
    tag: 'Crew review',
    description: 'Owners can log field notes and material receipts (using AI Intake). Crew field mutations are currently unlaunched and managed directly in the dashboard. Live calls use Voice credits.',
    examples: [
      '"Note for Smith framing: Mike and Dave on site today."',
      '"Used $120 lumber and fasteners on Main St repair."',
      '"Add task for crew on J-101: pick up remaining trim."',
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
