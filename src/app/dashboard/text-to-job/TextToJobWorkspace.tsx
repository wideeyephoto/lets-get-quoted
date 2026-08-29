'use client';

import { useState } from 'react';
import Link from 'next/link';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';
import styles from './text-to-job.module.css';

export type ExtractedItem = {
  id: string;
  pillar: 'jobs' | 'leads' | 'schedule' | 'crew';
  title: string;
  detail: string;
  targetTable: string;
  mutation: string;
  enabled: boolean;
};

export type InboundMessage = {
  id: string;
  sender: string;
  type: 'sms' | 'voice' | 'receipt';
  time: string;
  rawText: string;
  audioDuration?: string;
  confidence: number;
  matchedJobRef?: string;
  extractedItems: ExtractedItem[];
};

export type CrewRow = {
  id: string;
  name: string;
  phone: string | null;
  role_label: string | null;
  active: boolean;
  phoneVerified?: boolean;
  verificationReason?: 'signed_in' | 'verified_sms' | 'owner_verified' | 'unverified';
};

const SAMPLE_INBOUND_MESSAGES: InboundMessage[] = [
  {
    id: 'msg-1',
    sender: 'Alert Phone (Owner)',
    type: 'voice',
    time: '8:42 AM · 12 mins ago',
    rawText:
      '“Rough plumbing passed inspection at 124 Main. Need Mike and drywall crew Thursday 8am. Added $450 extra PEX lines to Miller quote.”',
    audioDuration: '0:14',
    confidence: 99.6,
    matchedJobRef: 'Job J-104 (Miller)',
    extractedItems: [
      {
        id: 'item-1-1',
        pillar: 'jobs',
        title: '+$450.00 Quote Change Order',
        detail: 'Extra 3/4" PEX lines and rough-in fittings added to Miller quote',
        targetTable: 'quote_line_items',
        mutation: 'Quote: $3,250 → $3,700',
        enabled: true,
      },
      {
        id: 'item-1-2',
        pillar: 'jobs',
        title: 'Milestone: Rough Inspection Passed',
        detail: 'Logged timestamped inspection clearance to job activity feed',
        targetTable: 'job_activity_feed',
        mutation: 'Status: Rough Passed',
        enabled: true,
      },
      {
        id: 'item-1-3',
        pillar: 'schedule',
        title: 'Schedule Arrival: Thursday 8:00 AM',
        detail: 'Drywall & insulation crew arrival window reserved',
        targetTable: 'schedule_occurrences',
        mutation: 'Slot: Thu 8:00 AM',
        enabled: true,
      },
      {
        id: 'item-1-4',
        pillar: 'crew',
        title: 'Assign Crew: Mike T. (Van #2)',
        detail: 'Drywall hanging assignment with push alert',
        targetTable: 'crew_assignments',
        mutation: 'Assigned: Mike T.',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-2',
    sender: 'Alert Phone (Owner)',
    type: 'sms',
    time: 'Yesterday · 4:15 PM',
    rawText:
      'Met Dave Miller 248-555-0812 oak limb removal estimate Tuesday 9am. High urgency near roofline.',
    confidence: 98.9,
    matchedJobRef: 'New Lead: Dave Miller',
    extractedItems: [
      {
        id: 'item-2-1',
        pillar: 'leads',
        title: 'New Lead: Dave Miller',
        detail: 'Phone: (248) 555-0812 · Service: Oak Limb Removal',
        targetTable: 'leads',
        mutation: 'Lead Created · High Urgency',
        enabled: true,
      },
      {
        id: 'item-2-2',
        pillar: 'leads',
        title: 'Tag: Urgent Safety Hazard',
        detail: 'Tree branch touching electrical service line near roof',
        targetTable: 'lead_tags',
        mutation: 'Tagged: Priority Hazard',
        enabled: true,
      },
      {
        id: 'item-2-3',
        pillar: 'schedule',
        title: 'Estimate Window: Tuesday 9:30 AM',
        detail: 'Route clustered with Royal Oak morning route',
        targetTable: 'calendar_slots',
        mutation: 'Route Match: 94%',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-3',
    sender: 'Crew Phone (Carlos M.)',
    type: 'sms',
    time: 'Aug 27 · 2:10 PM',
    rawText:
      'Johnson punch list done: 1) caulked exterior siding trim 2) painted baseboards in hallway. Ready for final walkthrough.',
    confidence: 99.7,
    matchedJobRef: 'Job J-92 (Johnson)',
    extractedItems: [
      {
        id: 'item-3-1',
        pillar: 'crew',
        title: 'Task Done: Caulk Exterior Siding',
        detail: 'Completed and signed off by Carlos M.',
        targetTable: 'crew_tasks',
        mutation: 'Status: Completed',
        enabled: true,
      },
      {
        id: 'item-3-2',
        pillar: 'crew',
        title: 'Task Done: Paint Hallway Baseboards',
        detail: 'Completed and signed off by Carlos M.',
        targetTable: 'crew_tasks',
        mutation: 'Status: Completed',
        enabled: true,
      },
      {
        id: 'item-3-3',
        pillar: 'jobs',
        title: 'Milestone: Ready for Final Walkthrough',
        detail: 'Trigger punch list clearance audit stamp',
        targetTable: 'job_activity_feed',
        mutation: 'Status: Walkthrough Ready',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-4',
    sender: 'Alert Phone (Owner)',
    type: 'receipt',
    time: 'Aug 26 · 11:20 AM',
    rawText:
      'Supply House receipt $184.50 — 2x Romex 250ft 12/2 wire rolls for Miller electrical rough-in.',
    confidence: 99.4,
    matchedJobRef: 'Job J-104 (Miller)',
    extractedItems: [
      {
        id: 'item-4-1',
        pillar: 'jobs',
        title: '+$184.50 Job Supply Cost Logged',
        detail: 'Supply House · 2x Romex 250ft 12/2 wire rolls',
        targetTable: 'job_costs',
        mutation: 'Job Profitability Updated',
        enabled: true,
      },
    ],
  },
];

function formatUsPhone(phone?: string | null): string {
  if (!phone) return '(947) 941-2323';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export interface TextToJobWorkspaceProps {
  account: {
    business_name: string | null;
    company_name: string | null;
    alert_phone: string | null;
    phone: string | null;
    trade: string | null;
    call_tracking_number: string | null;
  } | null;
  crewMembers?: CrewRow[];
  initialMessages?: InboundMessage[];
  isDedicatedNumber?: boolean;
  sharedPhoneNumber?: string;
  isQualified?: boolean;
  activeJobCount: number;
  leadCount: number;
  crewCount: number;
}

const TRADE_PHRASES: Record<string, {
  changeOrder: string;
  milestone: string;
  punchList: string;
  newLead: string;
  receipts: string;
}> = {
  Electrical: {
    changeOrder: '“Add $450 to Miller job for extra 12/2 Romex line and pantry GFCI”',
    milestone: '“Miller 200A service upgrade passed rough inspection. Schedule drywall.”',
    punchList: '“Punch list for Smith: 1) label breaker panel 2) test master bedroom arc-faults”',
    newLead: '“New lead: Dave Miller 248-555-0812 burning smell in main panel needs emergency visit”',
    receipts: '“Supply house receipt ($184.20 Square D breakers & Romex wire)”',
  },
  HVAC: {
    changeOrder: '“Add $285 to Johnson job for 45/5 dual capacitor and 2 lbs R-410A refrigerant”',
    milestone: '“Carrier furnace install complete and pressure tested. Ready for final inspection.”',
    punchList: '“Punch list for Davis: 1) install Ecobee thermostat 2) seal plenum ductwork”',
    newLead: '“New lead: Sarah Jenkins 248-555-0991 AC blowing warm air needs repair ASAP”',
    receipts: '“Johnstone Supply receipt ($340 filter driers and recovery tank)”',
  },
  Plumbing: {
    changeOrder: '“Add $350 to Roberts job for extra 3/4 PEX loop and pressure regulator valve”',
    milestone: '“Rough plumbing inspection passed on Elm St. Drywall crew cleared to hang.”',
    punchList: '“Punch list for Miller: 1) caulk master shower surround 2) test garbage disposal”',
    newLead: '“New lead: Tom Clark 248-555-0122 main sewer line backup needs emergency snake”',
    receipts: '“Ferguson receipt ($148.50 SharkBite valves & PVC fittings)”',
  },
  Roofing: {
    changeOrder: '“Add $550 change order for 4 sheets CDX plywood decking rot repair on Johnson roof”',
    milestone: '“Tear-off and ice & water shield complete. Shingle crew starts tomorrow 7am.”',
    punchList: '“Punch list for Smith: 1) magnet sweep driveway for nails 2) seal chimney flashing”',
    newLead: '“New lead: Rachel Adams 248-555-0433 active roof leak in attic needs tarping”',
    receipts: '“ABC Supply receipt ($1,240 CertainTeed Landmark shingles & drip edge)”',
  },
  'General Contractor': {
    changeOrder: '“Add $1,200 to Henderson kitchen for custom quartz overhang and waterfall edge”',
    milestone: '“Rough framing & MEP passed inspection on Oak St. Insulation scheduled Friday.”',
    punchList: '“Punch list for Wilson: 1) touch up hallway baseboard paint 2) adjust soft-close cabinet hinges”',
    newLead: '“New lead: Mark Vance 248-555-0774 full master bathroom remodel needs estimate”',
    receipts: '“Home Depot receipt ($485 drywall sheets & Schluter Ditra membrane)”',
  },
  Landscaping: {
    changeOrder: '“Add $650 to Miller job for 5 yards dark mulch and 12 boxwood shrubs”',
    milestone: '“Grading and paver patio base compacted. Paver installation starts Thursday.”',
    punchList: '“Punch list for Taylor: 1) edge front walkways 2) adjust sprinkler zone 3 timers”',
    newLead: '“New lead: Karen White 248-555-0319 spring cleanup and retaining wall rebuild”',
    receipts: '“Nursery invoice ($890 sod rolls, fertilizer, and edging stone)”',
  },
  Painting: {
    changeOrder: '“Add $380 to Davis job for 2 coats satin enamel on all interior doors and trim”',
    milestone: '“Drywall patching & primer coat complete. Color coat starts tomorrow 8am.”',
    punchList: '“Punch list for Parker: 1) touch up ceiling seam 2) razor scrape window glass”',
    newLead: '“New lead: Greg Scott 248-555-0642 exterior whole-home repaint estimate”',
    receipts: '“Sherwin-Williams receipt ($290 Duration interior satin & blue tape)”',
  },
};

const AVAILABLE_TRADES = [
  'Electrical',
  'HVAC',
  'Plumbing',
  'Roofing',
  'General Contractor',
  'Landscaping',
  'Painting',
];

export default function TextToJobWorkspace({
  account,
  crewMembers = [],
  initialMessages,
  isDedicatedNumber = false,
  sharedPhoneNumber,
  isQualified = true,
  activeJobCount,
  leadCount,
  crewCount,
}: TextToJobWorkspaceProps) {
  const [feedFilter, setFeedFilter] = useState<'all' | 'voice' | 'sms' | 'leads' | 'crew'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<InboundMessage[]>(
    initialMessages && initialMessages.length > 0 ? initialMessages : SAMPLE_INBOUND_MESSAGES
  );
  const [selectedMsgId, setSelectedMsgId] = useState<string>(
    (initialMessages && initialMessages.length > 0 ? initialMessages[0].id : SAMPLE_INBOUND_MESSAGES[0].id)
  );
  const [notification, setNotification] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [showSimModal, setShowSimModal] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Visor Card Customizer State
  const [printBizName, setPrintBizName] = useState(
    account?.company_name || 'Apex Contracting & Trade Pro'
  );
  const [printTrade, setPrintTrade] = useState(
    account?.trade && AVAILABLE_TRADES.includes(account.trade) ? account.trade : 'Electrical'
  );
  const [cardTheme, setCardTheme] = useState<'laminated' | 'stealth'>('laminated');

  const selectedPhrases =
    TRADE_PHRASES[printTrade] || TRADE_PHRASES['General Contractor'] || TRADE_PHRASES['Electrical'];

  function handlePrintVisorCard() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  function handleCopyVisorCheatsheet() {
    const text = `📱 ${printBizName || businessTitle} Field Ingest Hotline: ${fieldPhoneNumber}

1. CHANGE ORDERS & QUOTES:
   ${selectedPhrases.changeOrder}

2. MILESTONES & INSPECTIONS:
   ${selectedPhrases.milestone}

3. PUNCH LIST TASKS:
   ${selectedPhrases.punchList}

4. EMERGENCY LEADS:
   ${selectedPhrases.newLead}

5. RECEIPTS & EXPENSES:
   ${selectedPhrases.receipts}

🛡️ 15-Min SMS Undo: Reply UNDO within 15 minutes to revert.`;
    navigator.clipboard.writeText(text);
    setNotification('📋 Copied text cheatsheet to clipboard!');
    setTimeout(() => setNotification(null), 3500);
  }

  // Simulator State
  const [simText, setSimText] = useState(
    'Replace 45/5 capacitor on Carrier AC for Smith. Added 2 lbs R-410A refrigerant. Quote $285 total invoice ready.'
  );

  const filteredMessages = messages.filter((m) => {
    if (feedFilter === 'voice' && m.type !== 'voice') return false;
    if (feedFilter === 'sms' && m.type !== 'sms' && m.type !== 'receipt') return false;
    if (feedFilter === 'leads' && !m.extractedItems.some((i) => i.pillar === 'leads')) return false;
    if (feedFilter === 'crew' && !m.extractedItems.some((i) => i.pillar === 'crew')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesText = m.rawText.toLowerCase().includes(q);
      const matchesSender = m.sender.toLowerCase().includes(q);
      const matchesJob = m.matchedJobRef?.toLowerCase().includes(q) ?? false;
      const matchesItems = m.extractedItems.some(
        (i) => i.title.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q)
      );
      return matchesText || matchesSender || matchesJob || matchesItems;
    }
    return true;
  });

  const selectedMessage =
    messages.find((m) => m.id === selectedMsgId) ||
    filteredMessages[0] ||
    messages[0];

  const fieldPhoneNumber = isQualified
    ? isDedicatedNumber && account?.call_tracking_number
      ? formatUsPhone(account.call_tracking_number)
      : formatUsPhone(sharedPhoneNumber || '+19479412323')
    : '🔒 Setup Alert Phone to Unlock';

  const rawCallableNumber = isQualified
    ? isDedicatedNumber && account?.call_tracking_number
      ? account.call_tracking_number
      : sharedPhoneNumber || '+19479412323'
    : '';

  const alertPhone = account?.alert_phone ? formatUsPhone(account.alert_phone) : '(No cell phone set)';
  const businessTitle = account?.business_name || account?.company_name || 'Your Company';

  const defaultCrew: CrewRow[] = [
    {
      id: 'default-crew-1',
      name: 'Carlos M.',
      phone: '(248) 555-0188',
      role_label: 'Lead Tech (Van #1)',
      active: true,
      phoneVerified: true,
      verificationReason: 'verified_sms',
    },
    {
      id: 'default-crew-2',
      name: 'Mike T.',
      phone: '(248) 555-0192',
      role_label: 'Drywall & Framing Tech',
      active: true,
      phoneVerified: true,
      verificationReason: 'owner_verified',
    },
  ];

  const activeCrewList = crewMembers.length > 0 ? crewMembers : defaultCrew;
  const verifiedCrewCount = activeCrewList.filter((c) => c.active && Boolean(c.phone) && c.phoneVerified).length;
  const totalAuthorizedDevices = (isQualified ? 1 : 0) + verifiedCrewCount;
  const unverifiedCrewCount = activeCrewList.filter((c) => c.active && Boolean(c.phone) && !c.phoneVerified).length;

  function toggleItem(msgId: string, itemId: string) {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId) return msg;
        return {
          ...msg,
          extractedItems: msg.extractedItems.map((item) => {
            if (item.id !== itemId) return item;
            return { ...item, enabled: !item.enabled };
          }),
        };
      })
    );
  }

  function handleApply() {
    const enabledCount = selectedMessage.extractedItems.filter((i) => i.enabled).length;
    setNotification(
      `✓ Applied ${enabledCount} verified updates to ${selectedMessage.matchedJobRef || 'records'}.`
    );
    setTimeout(() => setNotification(null), 4000);
  }

  function handleSimulateUndo() {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== selectedMessage.id) return msg;
        return {
          ...msg,
          extractedItems: msg.extractedItems.map((item) => ({ ...item, enabled: false })),
        };
      })
    );
    setNotification(`↩ Undone via SMS: All updates from this note were reverted.`);
    setTimeout(() => setNotification(null), 4500);
  }

  function handleCopyNumber() {
    if (!isQualified) {
      setNotification('⚠️ Please add your cell phone in Settings first to unlock your field hotline number.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }
    navigator.clipboard.writeText(rawCallableNumber.replace(/[^\d+]/g, ''));
    setCopiedNumber(true);
    setNotification(`📋 Copied real field hotline (${fieldPhoneNumber}) to clipboard!`);
    setTimeout(() => {
      setCopiedNumber(false);
      setNotification(null);
    }, 3500);
  }

  function toggleAudio() {
    if (isPlayingAudio) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    setIsPlayingAudio(true);
    const spokenText = selectedMessage.rawText.replace(/^[“"']|[”"']$/g, '');

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.onend = () => {
        setIsPlayingAudio(false);
        setNotification(null);
      };
      utterance.onerror = () => {
        setIsPlayingAudio(false);
      };
      window.speechSynthesis.speak(utterance);
      setNotification(`▶ Playing voice note audio...`);
    } else {
      setNotification('▶ Playing audio transcript with background noise filter...');
      setTimeout(() => {
        setIsPlayingAudio(false);
        setNotification(null);
      }, 4000);
    }
  }

  function handleSimulate() {
    if (!simText.trim()) return;

    const lower = simText.toLowerCase();
    const isLead = lower.includes('lead') || lower.includes('new customer') || lower.includes('prospect');
    const isRoof = lower.includes('roof') || lower.includes('plywood') || lower.includes('shingle');
    const isPunch = lower.includes('punch') || lower.includes('list') || lower.includes('touch up');

    let newExtractedItems: ExtractedItem[] = [];
    let matchedRef = 'Job J-88 (Smith)';

    if (isLead) {
      matchedRef = 'New Lead: Sarah Jenkins';
      newExtractedItems = [
        {
          id: `sim-lead-1`,
          pillar: 'leads',
          title: 'New Lead: Sarah Jenkins',
          detail: 'Phone: (248) 555-0991 · Service: Main Drain Backup',
          targetTable: 'leads',
          mutation: 'Lead Created · Emergency Priority',
          enabled: true,
        },
        {
          id: `sim-lead-2`,
          pillar: 'schedule',
          title: 'Emergency Priority Dispatch Slot',
          detail: 'Auto-clustered within 4 miles of Van #1',
          targetTable: 'calendar_slots',
          mutation: 'Scheduled: Today 11:30 AM',
          enabled: true,
        },
      ];
    } else if (isRoof) {
      matchedRef = 'Job J-105 (Johnson Roof)';
      newExtractedItems = [
        {
          id: `sim-roof-1`,
          pillar: 'jobs',
          title: '+$550.00 Change Order: Plywood Rot Repair',
          detail: 'CDX 1/2" exterior subdecking replacement and fasteners',
          targetTable: 'quote_line_items',
          mutation: 'Total: $8,400 → $8,950',
          enabled: true,
        },
        {
          id: `sim-roof-2`,
          pillar: 'jobs',
          title: 'Attached Photo Proof to Job Timeline',
          detail: 'Timestamped sub-fascia water damage photo filed',
          targetTable: 'job_activity_feed',
          mutation: '1 Photo Stored',
          enabled: true,
        },
      ];
    } else if (isPunch) {
      matchedRef = 'Job J-94 (Smith Remodel)';
      newExtractedItems = [
        {
          id: `sim-punch-1`,
          pillar: 'crew',
          title: 'Task Done: Touch Up Kitchen Paint',
          detail: 'Carlos M. sign-off',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed',
          enabled: true,
        },
        {
          id: `sim-punch-2`,
          pillar: 'crew',
          title: 'Task Done: Fix Loose Door Latch',
          detail: 'Carlos M. sign-off',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed',
          enabled: true,
        },
        {
          id: `sim-punch-3`,
          pillar: 'jobs',
          title: 'Stage: Final Walkthrough Ready',
          detail: 'Customer notification ready for release',
          targetTable: 'jobs',
          mutation: 'Walkthrough Ready',
          enabled: true,
        },
      ];
    } else {
      newExtractedItems = [
        {
          id: `sim-hvac-1`,
          pillar: 'jobs',
          title: '+$285.00 Repair Line Items Added',
          detail: '45/5 Dual Capacitor + 2 lbs R-410A Refrigerant itemization',
          targetTable: 'quote_line_items',
          mutation: 'Invoice Ready: $285.00',
          enabled: true,
        },
        {
          id: `sim-hvac-2`,
          pillar: 'jobs',
          title: 'Carrier Outdoor Unit Serial #CR-4409 Logged',
          detail: 'Updated equipment maintenance history',
          targetTable: 'job_activity_feed',
          mutation: 'History Stored',
          enabled: true,
        },
        {
          id: `sim-hvac-3`,
          pillar: 'crew',
          title: 'Work Completed on Site',
          detail: 'Technician service ticket signed off',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed',
          enabled: true,
        },
      ];
    }

    const newSimMsg: InboundMessage = {
      id: `sim-${Date.now()}`,
      sender: `Alert Phone (${alertPhone})`,
      type: 'sms',
      time: 'Just now (Simulator)',
      rawText: `“${simText}”`,
      confidence: 99.4,
      matchedJobRef: matchedRef,
      extractedItems: newExtractedItems,
    };

    setMessages([newSimMsg, ...messages]);
    setSelectedMsgId(newSimMsg.id);
    setShowSimModal(false);
    setNotification(`⚡ Field note test added to feed! Created ${newExtractedItems.length} verified updates.`);
    setTimeout(() => setNotification(null), 4000);
  }

  return (
    <div className={styles.container}>
      {/* 0. Top Alert Banner When Unqualified */}
      {!isQualified && (
        <div className={styles.topQualificationBanner}>
          <div className={styles.topQualificationLeft}>
            <span className={styles.topQualificationIcon}>🔒</span>
            <div>
              <strong className={styles.topQualificationTitle}>
                Field Hotline Locked — Cell Phone Setup Required
              </strong>
              <p className={styles.topQualificationText}>
                To protect against spam and whitelist your phone, connect your mobile number in Notifications. Once saved, your field hotline unlocks immediately.
              </p>
            </div>
          </div>
          <Link href="/dashboard/automations#urgent-lead-sms" className={styles.topQualificationBtn}>
            📱 Connect Cell Phone &rarr;
          </Link>
        </div>
      )}

      {/* 1. Clean Hero Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.sparkyHeaderRow}>
            <SparkyAvatar size="lg" status="online" trade={account?.trade || 'general'} />
            <div>
              <div className={styles.sparkyBadgeRow}>
                <span className={styles.badge}>✦ Sparky · Smart AI Contractor Assistant</span>
                {isDedicatedNumber ? (
                  <span className={styles.dedicatedPill}>
                    ⭐ Dedicated 2-Way Line
                  </span>
                ) : isQualified ? (
                  <span className={styles.sharedPill}>
                    🔒 Shared Platform Line ({fieldPhoneNumber})
                  </span>
                ) : (
                  <span className={styles.unqualifiedPill}>
                    ⚠️ Mobile Whitelist Setup Required
                  </span>
                )}
                <span className={styles.livePill}>
                  <span className={styles.liveDot} /> {totalAuthorizedDevices} Whitelisted Devices
                </span>
              </div>
              <div className={styles.headerTitleRow}>
                <h1 className={styles.title}>Text-to-Job Dashboard</h1>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className={styles.headerQuickGuideBtn}
                  title="Open Printable Visor Card & Quick Commands Guide"
                >
                  🪪 Quick Commands / Visor Card
                </button>
              </div>
              <p className={styles.subtitle}>
                Just send a message by voice or text to Sparky, your smart assistant, and he&apos;ll organize
                things, submit and update job records, change orders, punch lists, and schedule slots automatically.
              </p>
            </div>
          </div>
        </div>
        {isQualified && (
          <div className={styles.headerActions}>
            <button type="button" onClick={handleCopyNumber} className={styles.copyBtn}>
              {copiedNumber ? '✓ Copied Number' : `📋 Copy ${fieldPhoneNumber}`}
            </button>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && <div className={styles.notificationToast}>{notification}</div>}

      {/* Primary Workspace: Inbound Messages Stream & Receipt-Style Inspector */}
      <div className={styles.workspaceGrid}>
          {/* Left Column: Inbound Messages Stream */}
          <div className={styles.feedCard}>
            <div className={styles.feedCardHeader}>
              <h3 className={styles.feedCardTitle}>Recent Field Notes</h3>
              <span className={styles.feedCount}>{filteredMessages.length} Messages</span>
            </div>

            {/* Quick Filter Pills */}
            <div className={styles.feedFilters}>
              <button
                type="button"
                onClick={() => setFeedFilter('all')}
                className={`${styles.filterBtn} ${feedFilter === 'all' ? styles.filterBtnActive : ''}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('voice')}
                className={`${styles.filterBtn} ${feedFilter === 'voice' ? styles.filterBtnActive : ''}`}
              >
                🎙️ Voice Memos
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('sms')}
                className={`${styles.filterBtn} ${feedFilter === 'sms' ? styles.filterBtnActive : ''}`}
              >
                💬 SMS &amp; Receipts
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('leads')}
                className={`${styles.filterBtn} ${feedFilter === 'leads' ? styles.filterBtnActive : ''}`}
              >
                👤 Leads
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('crew')}
                className={`${styles.filterBtn} ${feedFilter === 'crew' ? styles.filterBtnActive : ''}`}
              >
                👷 Crew Tasks
              </button>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by job, client, or keyword..."
              className={styles.searchInput}
            />

            <div className={styles.feedList}>
              {filteredMessages.length === 0 ? (
                <div className={styles.emptyFeed}>No messages matched your filter criteria.</div>
              ) : (
                filteredMessages.map((msg) => {
                  const isSelected = msg.id === selectedMessage?.id;
                  return (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedMsgId(msg.id)}
                      className={`${styles.feedItem} ${isSelected ? styles.feedItemSelected : ''}`}
                    >
                      <div className={styles.feedItemHead}>
                        <span className={styles.feedSenderTag}>{msg.sender}</span>
                        <span className={styles.feedTimeTag}>{msg.time}</span>
                      </div>

                      <p className={styles.feedRawSnippet}>{msg.rawText}</p>

                      <div className={styles.feedItemFooter}>
                        <span className={styles.feedTypeBadge}>
                          {msg.type === 'voice'
                            ? '🎙️ Voice Memo'
                            : msg.type === 'receipt'
                            ? '🧾 Receipt OCR'
                            : '💬 SMS Text'}
                        </span>
                        {msg.matchedJobRef && (
                          <span className={styles.feedMatchedBadge}>
                            {msg.matchedJobRef}
                          </span>
                        )}
                        <span className={styles.feedConfidenceBadge}>
                          ✓ {msg.confidence}% Confidence
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Receipt-Style Job File Inspector */}
          {selectedMessage && (
            <div className={styles.receiptCard}>
              <div className={styles.receiptHeader}>
                <div>
                  <span className={styles.receiptBadge}>Job File Updates</span>
                  <h3 className={styles.receiptTitle}>
                    {selectedMessage.matchedJobRef || 'Field Intake'}
                  </h3>
                  <p className={styles.receiptSubtitle}>
                    Received {selectedMessage.time} from {selectedMessage.sender}
                  </p>
                </div>
                <div className={styles.receiptHeaderRight}>
                  <Link href="/dashboard/jobs" className={styles.openJobLink}>
                    Open Job ↗
                  </Link>
                  <div className={styles.receiptConfidencePill}>
                    ✓ {selectedMessage.confidence}% Verified
                  </div>
                </div>
              </div>

              {/* Inbound Audio Player / Snippet Box */}
              <div className={styles.inboundPreviewBox}>
                <p className={styles.inboundPreviewText}>{selectedMessage.rawText}</p>
                {selectedMessage.type === 'voice' && (
                  <div className={styles.audioPlayerStrip}>
                    <button
                      type="button"
                      onClick={toggleAudio}
                      className={`${styles.audioPlayBtn} ${
                        isPlayingAudio ? styles.audioPlayBtnActive : ''
                      }`}
                    >
                      {isPlayingAudio ? '⏸ Pause' : `▶ Listen (${selectedMessage.audioDuration})`}
                    </button>
                    <div className={styles.waveformGraphic}>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '40%' }}></span>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '80%' }}></span>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '100%' }}></span>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '60%' }}></span>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '90%' }}></span>
                      <span className={`${styles.waveformBar} ${isPlayingAudio ? styles.waveformBarActive : ''}`} style={{ height: '50%' }}></span>
                    </div>
                    <span className={styles.audioFilteredTag}>🔇 Spoken Transcript</span>
                  </div>
                )}
              </div>

              {/* Itemized Job Receipt Lines */}
              <div className={styles.receiptLinesSection}>
                <div className={styles.receiptLinesHead}>
                  <span>Itemized Changes</span>
                  <span>
                    {selectedMessage.extractedItems.filter((i) => i.enabled).length} of{' '}
                    {selectedMessage.extractedItems.length} Applied
                  </span>
                </div>

                <div className={styles.receiptLinesList}>
                  {selectedMessage.extractedItems.map((item) => {
                    const icon =
                      item.pillar === 'jobs'
                        ? '💼'
                        : item.pillar === 'leads'
                        ? '👤'
                        : item.pillar === 'schedule'
                        ? '📅'
                        : '👷';

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(selectedMessage.id, item.id)}
                        className={`${styles.receiptLineRow} ${
                          !item.enabled ? styles.receiptLineDisabled : ''
                        }`}
                      >
                        <div
                          className={`${styles.receiptCheck} ${
                            item.enabled ? styles.receiptCheckOn : ''
                          }`}
                        >
                          {item.enabled ? '✓' : ''}
                        </div>
                        <div className={styles.receiptLineContent}>
                          <div className={styles.receiptLineTitleRow}>
                            <span className={styles.receiptLineIcon}>{icon}</span>
                            <strong className={styles.receiptLineTitle}>{item.title}</strong>
                            <span className={styles.receiptMutation}>{item.mutation}</span>
                          </div>
                          <p className={styles.receiptLineDesc}>{item.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions Footer */}
              <div className={styles.receiptFooter}>
                <div className={styles.receiptFooterActionRow}>
                  <button type="button" onClick={handleApply} className={styles.applyBtn}>
                    ✓ Apply Updates to {selectedMessage.matchedJobRef || 'Job File'}
                  </button>
                  <button type="button" onClick={handleSimulateUndo} className={styles.undoBtn}>
                    ↩ Simulate Replying &ldquo;UNDO&rdquo; via SMS
                  </button>
                </div>
                <div className={styles.receiptFooterNote}>
                  <span>🛡️ 15-minute SMS rollback active (Reply <strong>UNDO</strong> to revert)</span>
                </div>
              </div>
            </div>
          )}
        </div>

      {/* =========================================================================
          Setup & Advanced Configuration (Who Can Text & Hands-Free Setup)
          ========================================================================= */}
      <div className={styles.setupAdvancedSection}>
        <div className={styles.setupAdvancedHeader}>
          <div className={styles.setupAdvancedTitleGroup}>
            <span className={styles.badge}>⚙️ Setup &amp; Advanced</span>
            <h2 className={styles.setupAdvancedTitle}>Field Line Whitelist &amp; Driving Setup</h2>
            <p className={styles.setupAdvancedSubtitle}>
              Manage authorized crew phone numbers, anti-spam security shield, and Siri / Google Assistant hands-free steering wheel dictation.
            </p>
          </div>
        </div>

        {/* Who Can Text (Authorized Senders Whitelist) */}
        <div className={styles.sendersContainer}>
          {/* Qualification Alert if unverified */}
          {!isQualified && (
            <div className={styles.qualificationWarningCard}>
              <span style={{ fontSize: '24px' }}>🔒</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#f5f0e7', fontSize: '15px' }}>
                  Alert Phone Setup Required to Unlock Your Hotline
                </strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4 }}>
                  To prevent internet spam and scrapers, your field hotline is locked until you connect your cell phone. Once saved, your phone is instantly whitelisted.
                </p>
              </div>
              <Link href="/dashboard/automations#urgent-lead-sms" className={styles.verifyBtn}>
                📱 Add Mobile Phone in Notifications &rarr;
              </Link>
            </div>
          )}

          {/* Anti-Spam Security Shield Metrics Banner */}
          <div className={styles.shieldMetricsCard}>
            <div className={styles.shieldMetricsHeader}>
              <span className={styles.shieldIcon}>🛡️</span>
              <div>
                <h4 className={styles.shieldTitle}>
                  {isDedicatedNumber
                    ? 'Dedicated Line Security & Whitelist'
                    : 'Shared Platform Line Anti-Spam Shield'}
                </h4>
                <p className={styles.shieldDesc}>
                  {isDedicatedNumber
                    ? `Your private local business number accepts customer inquiries into your Inbox, while restricting internal job mutations to your ${totalAuthorizedDevices} authorized phones below.`
                    : `To prevent web scrapers and spam bots from touching your accounting, only the ${totalAuthorizedDevices} verified phone numbers below can text ${fieldPhoneNumber} to update job records. All stranger texts are safely blocked.`}
                </p>
              </div>
            </div>
            <div className={styles.shieldStatsGrid}>
              <div className={styles.shieldStatBox}>
                <span className={styles.shieldStatLabel}>Whitelisted Phones</span>
                <strong className={styles.shieldStatVal}>{totalAuthorizedDevices} Verified</strong>
              </div>
              <div className={styles.shieldStatBox}>
                <span className={styles.shieldStatLabel}>Pending Verification</span>
                <strong className={styles.shieldStatVal} style={{ color: unverifiedCrewCount > 0 ? '#f59e0b' : '#8fa6b5' }}>
                  {unverifiedCrewCount} {unverifiedCrewCount === 1 ? 'Device' : 'Devices'}
                </strong>
              </div>
              <div className={styles.shieldStatBox}>
                <span className={styles.shieldStatLabel}>Anti-Spam Filter</span>
                <strong className={styles.shieldStatVal} style={{ color: '#4ade80' }}>
                  ✓ 100% Protected
                </strong>
              </div>
              <div className={styles.shieldStatBox}>
                <span className={styles.shieldStatLabel}>Unknown Caller Policy</span>
                <strong className={styles.shieldStatVal} style={{ color: '#38bdf8' }}>
                  Zero Job Mutations
                </strong>
              </div>
            </div>
          </div>

          <div className={styles.sendersCard}>
            <div className={styles.sendersHeader}>
              <div className={styles.sendersTitleGroup}>
                <h3 className={styles.sendersTitle}>Authorized Phone Numbers</h3>
                <p className={styles.sendersSubtitle}>
                  Only verified phone numbers listed below can text <strong>{fieldPhoneNumber}</strong> to update job files. Unrecognized numbers are routed safely to your Lead Inbox.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Link href="/dashboard/crew?tab=people&add=1" className={styles.vcardBtn}>
                  + Add Crew Member
                </Link>
                <Link href="/dashboard/automations#urgent-lead-sms" className={styles.resetBtn}>
                  Manage Alert Phone
                </Link>
              </div>
            </div>

            <div className={styles.sendersTableWrap}>
              <table className={styles.sendersTable}>
                <thead>
                  <tr>
                    <th>Authorized Person</th>
                    <th>Cell Phone</th>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Owner */}
                  <tr>
                    <td>
                      <div className={styles.senderNameCell}>
                        <div className={styles.senderAvatar}>👑</div>
                        <div>
                          <strong>{businessTitle} (Owner)</strong>
                          <div style={{ fontSize: '11px', color: '#8fa6b5' }}>Primary Account Phone</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.senderPhoneTag}>{alertPhone}</span>
                    </td>
                    <td>
                      <span className={styles.senderRoleBadge}>Owner / Admin</span>
                    </td>
                    <td>
                      <span className={styles.senderPillarsTag} style={{ color: '#ff8e42' }}>
                        All (Quotes, Leads, Schedule, Crew)
                      </span>
                    </td>
                    <td>
                      {isQualified ? (
                        <span className={styles.senderStatusActive} title="Verified primary account phone">
                          <span className={styles.liveDot} /> Verified &amp; Active
                        </span>
                      ) : (
                        <Link href="/dashboard/automations#urgent-lead-sms" style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                          ⚠️ Connect in Notifications &rarr;
                        </Link>
                      )}
                    </td>
                  </tr>

                  {/* Crew Members */}
                  {activeCrewList.map((crew) => (
                    <tr key={crew.id}>
                      <td>
                        <div className={styles.senderNameCell}>
                          <div className={styles.senderAvatar}>👷</div>
                          <div>
                            <strong>{crew.name}</strong>
                            <div style={{ fontSize: '11px', color: '#8fa6b5' }}>
                              {crew.role_label || 'Field Technician'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.senderPhoneTag}>
                          {crew.phone ? formatUsPhone(crew.phone) : '(No phone on file)'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.senderRoleBadge}>
                          {crew.role_label || 'Field Tech'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.senderPillarsTag} style={{ color: '#50e3bd' }}>
                          Punch Lists, Notes, Receipts
                        </span>
                      </td>
                      <td>
                        {!crew.active ? (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>Inactive</span>
                        ) : crew.phoneVerified ? (
                          <span
                            className={styles.senderStatusActive}
                            title={
                              crew.verificationReason === 'verified_sms'
                                ? 'Verified via SMS OTP code'
                                : crew.verificationReason === 'signed_in'
                                ? 'Authenticated field app user'
                                : 'Verified by owner'
                            }
                          >
                            <span className={styles.liveDot} /> Verified &amp; Authorized
                          </span>
                        ) : crew.phone ? (
                          <Link
                            href="/dashboard/crew?tab=people"
                            className={styles.senderVerifyLink}
                            title="Unverified phone number - click to verify in Crew Roster"
                          >
                            <span>⚠️ Verify in Crew</span> &rarr;
                          </Link>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '12px' }}>No phone on file</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.senderSecurityNotice}>
              <span style={{ fontSize: '22px' }}>🛡️</span>
              <div>
                <strong style={{ color: '#f5f0e7' }}>Zero Destructive Guesses:</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  If a customer or unknown caller texts <strong>{fieldPhoneNumber}</strong>, the system will never mutate existing job quotes. It places the inquiry safely in your Lead Inbox.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Siri & Hands-Free Setup */}
        <div className={styles.siriCard}>
          <div className={styles.siriHeader}>
            <span className={styles.badge}>🎙️ 1-Minute Setup</span>
            <h3 className={styles.siriTitle}>Hands-Free Voice Dictation While Driving</h3>
            <p className={styles.siriSubtitle}>
              Keep your hands on the wheel and eyes on the road. Dictate updates directly into your truck&apos;s Apple CarPlay or Android Auto.
            </p>
          </div>

          <div className={styles.siriGuideGrid}>
            <div className={styles.siriStepCard}>
              <span className={styles.siriStepNum}>Step 1</span>
              <h4 className={styles.siriStepTitle}>Save Contact Card</h4>
              <p className={styles.siriStepText}>
                Save phone number <strong>{fieldPhoneNumber}</strong> to your phone as <strong>Field Line</strong>.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {isQualified ? (
                  <a
                    href={`data:text/vcard;charset=utf-8,${encodeURIComponent(
                      `BEGIN:VCARD\nVERSION:3.0\nFN:${businessTitle} Field Hotline\nTEL;TYPE=CELL:${rawCallableNumber}\nNOTE:Text-to-Job Field Ingest Hotline\nEND:VCARD`
                    )}`}
                    download="field-hotline.vcf"
                    className={styles.vcardBtn}
                  >
                    📱 Download .vcf Card
                  </a>
                ) : (
                  <Link href="/dashboard/automations#urgent-lead-sms" className={styles.verifyBtn}>
                    📱 Setup Alert Phone to Download
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  className={styles.printCardBtn}
                >
                  🪪 Printable Visor Card (PDF / Screenshot)
                </button>
              </div>
            </div>

            <div className={styles.siriStepCard}>
              <span className={styles.siriStepNum}>Step 2</span>
              <h4 className={styles.siriStepTitle}>Apple Siri Voice Command</h4>
              <p className={styles.siriStepText}>
                Press your steering wheel voice button and say:
              </p>
              <div className={styles.siriCommandSnippet}>
                &ldquo;Hey Siri, text Field Line: Added $450 extra PEX lines to Miller job.&rdquo;
              </div>
            </div>

            <div className={styles.siriStepCard}>
              <span className={styles.siriStepNum}>Step 3</span>
              <h4 className={styles.siriStepTitle}>Google Assistant / Android Auto</h4>
              <p className={styles.siriStepText}>
                On Android, dictate naturally:
              </p>
              <div className={styles.siriCommandSnippet}>
                &ldquo;Hey Google, send a text to Field Line: Miller rough inspection passed.&rdquo;
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Metrics & Status Strip */}
      <div className={styles.metricsStrip}>
        <Link href="/dashboard/jobs" className={styles.metricPill}>
          <span className={styles.metricIcon}>📁</span>
          <span className={styles.metricLabel}>Quotes &amp; Costs:</span>
          <strong>{activeJobCount} Active Jobs</strong>
        </Link>
        <Link href="/dashboard/leads" className={styles.metricPill}>
          <span className={styles.metricIcon}>👤</span>
          <span className={styles.metricLabel}>CRM:</span>
          <strong>{leadCount} Leads</strong>
        </Link>
        <Link href="/dashboard/schedule" className={styles.metricPill}>
          <span className={styles.metricIcon}>📅</span>
          <span className={styles.metricLabel}>Schedule:</span>
          <strong>Live Calendar</strong>
        </Link>
        <Link href="/dashboard/crew" className={styles.metricPill}>
          <span className={styles.metricIcon}>👷</span>
          <span className={styles.metricLabel}>Crew Tasks:</span>
          <strong>{crewCount} Techs</strong>
        </Link>
        <div className={styles.undoPill}>
          <span>⏱️ 15-Min SMS Undo</span>
        </div>
      </div>

      {/* Upgrade Banner for Shared Line Users (Placed at Bottom) */}
      {!isDedicatedNumber && (
        <div className={styles.upgradeCallout}>
          <div className={styles.upgradeCalloutLeft}>
            <span className={styles.upgradeStarIcon}>⭐</span>
            <div>
              <strong className={styles.upgradeCalloutTitle}>
                Want homeowners to text your business directly?
              </strong>
              <p className={styles.upgradeCalloutText}>
                Your shared line is protected for internal crew notes only. Upgrade to a dedicated 2-way number to put on your truck decals, website, and Google listing so clients can text you too.
              </p>
            </div>
          </div>
          <Link href="/dashboard/settings" className={styles.upgradeCalloutBtn}>
            Claim Dedicated Number &rarr;
          </Link>
        </div>
      )}

      {/* Bottom Hotline Card (.vcf Download & Test Simulator) */}
      <div className={styles.bottomHotlineBar}>
        <div className={styles.bottomHotlineLeft}>
          <span style={{ fontSize: '22px' }}>📱</span>
          <div>
            <strong style={{ color: '#f5f0e7', fontSize: '13px' }}>
              {isQualified
                ? `Field Hotline: ${fieldPhoneNumber}`
                : 'Interactive Field Ingest Simulator'}
            </strong>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#8fa6b5' }}>
              {isQualified
                ? 'Save this contact card to phonebook or test custom field notes in the simulator.'
                : 'Test how Sparky extracts change orders, punch lists, and schedule slots from text.'}
            </p>
          </div>
        </div>
        <div className={styles.bottomActions}>
          <button type="button" onClick={() => setShowPrintModal(true)} className={styles.printCardBtn}>
            🪪 Printable Visor Card
          </button>
          <button type="button" onClick={() => setShowSimModal(true)} className={styles.testBtn}>
            ⚡ Test a Note
          </button>
          {isQualified && (
            <a
              href={`data:text/vcard;charset=utf-8,${encodeURIComponent(
                `BEGIN:VCARD\nVERSION:3.0\nFN:${businessTitle} Field Hotline\nTEL;TYPE=CELL:${rawCallableNumber}\nNOTE:Text-to-Job Field Ingest Hotline\nEND:VCARD`
              )}`}
              download="field-hotline.vcf"
              className={styles.vcardBtn}
            >
              📱 Save Hotline (.vcf)
            </a>
          )}
        </div>
      </div>

      {/* Simulator Modal Popup */}
      {showSimModal && (
        <div className={styles.modalOverlay} onClick={() => setShowSimModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <span className={styles.badge}>⚡ Test Sandbox</span>
                <h3 className={styles.modalTitle}>Test a Field Note</h3>
                <p className={styles.modalSubtitle}>
                  Type or dictate a note to see how Sparky creates change orders, punch list tasks, and schedule slots.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className={styles.modalCloseBtn}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className={styles.simInputRow}>
              <input
                type="text"
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                placeholder="e.g. Add $450 to Miller job for extra romex, schedule inspection Thursday 9am"
                className={styles.simInput}
                autoFocus
              />
              <button type="button" onClick={handleSimulate} className={styles.simSendBtn}>
                ⚡ Run Test
              </button>
            </div>

            <div className={styles.presetsRow}>
              <span className={styles.presetLabel}>Quick Presets:</span>
              <button
                type="button"
                onClick={() =>
                  setSimText('Add $550 change order for 4 sheets plywood rot repair on Johnson roof.')
                }
                className={styles.presetBtn}
              >
                Roofing Change Order ($550)
              </button>
              <button
                type="button"
                onClick={() =>
                  setSimText('New lead: Sarah Jenkins 248-555-0991 emergency main drain backup needs estimate ASAP.')
                }
                className={styles.presetBtn}
              >
                Plumbing Emergency Lead
              </button>
              <button
                type="button"
                onClick={() =>
                  setSimText('Final punch list for Smith: 1) touch up kitchen paint 2) fix loose door latch.')
                }
                className={styles.presetBtn}
              >
                Remodeling Punch List
              </button>
              <button
                type="button"
                onClick={() =>
                  setSimText('Replace 45/5 capacitor on Carrier AC for Smith. Added 2 lbs R-410A refrigerant. Quote $285 total.')
                }
                className={styles.presetBtn}
              >
                HVAC Repair ($285)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sun-Visor Card Modal (Formatted for Easy Screenshot & PDF Print) */}
      {showPrintModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPrintModal(false)}>
          <div className={`${styles.modalCard} ${styles.printModalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <span className={styles.badge}>🪪 Truck Visor &amp; Glovebox Guide</span>
                <h3 className={styles.modalTitle}>Printable Quick-Reference Card</h3>
                <p className={styles.modalSubtitle}>
                  Formatted for easy screenshot (<strong>Win + Shift + S</strong> / <strong>Cmd + Shift + 4</strong>) or 1-click printer export for your truck sun visor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className={styles.modalCloseBtn}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Customizer Toolbar */}
            <div className={styles.cardCustomizerRow}>
              <div className={styles.cardCustomizerGroup}>
                <label htmlFor="visor-biz-input" className={styles.cardCustomizerLabel}>
                  Company Name:
                </label>
                <input
                  id="visor-biz-input"
                  type="text"
                  value={printBizName}
                  onChange={(e) => setPrintBizName(e.target.value)}
                  className={styles.cardCustomizerInput}
                  placeholder="Your Company Name"
                />
              </div>

              <div className={styles.cardCustomizerGroup}>
                <label htmlFor="visor-trade-select" className={styles.cardCustomizerLabel}>
                  Trade Phrases:
                </label>
                <select
                  id="visor-trade-select"
                  value={printTrade}
                  onChange={(e) => setPrintTrade(e.target.value)}
                  className={styles.cardCustomizerSelect}
                >
                  {AVAILABLE_TRADES.map((trade) => (
                    <option key={trade} value={trade}>
                      {trade}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.cardCustomizerGroup}>
                <span className={styles.cardCustomizerLabel}>Card Theme:</span>
                <div className={styles.themeTogglePillRow}>
                  <button
                    type="button"
                    onClick={() => setCardTheme('laminated')}
                    className={`${styles.themeToggleBtn} ${cardTheme === 'laminated' ? styles.themeToggleBtnActive : ''}`}
                  >
                    ☀️ Laminated White
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardTheme('stealth')}
                    className={`${styles.themeToggleBtn} ${cardTheme === 'stealth' ? styles.themeToggleBtnActive : ''}`}
                  >
                    🌙 Stealth Dark
                  </button>
                </div>
              </div>
            </div>

            {/* High-Contrast Printable Physical Card */}
            <div
              className={`${styles.printableCardBox} ${
                cardTheme === 'stealth' ? styles.printableCardStealth : styles.printableCardLaminated
              }`}
              id="printable-truck-card"
            >
              <div className={styles.visorNotch} title="Visor Clip Slot">
                <div className={styles.visorClipShine} />
              </div>

              <div className={styles.cardTopHeader}>
                <div>
                  <h4 className={styles.cardCompanyTitle}>{printBizName || businessTitle}</h4>
                  <div className={styles.cardTradeSub}>
                    <span>{printTrade}</span>
                    <span>&bull;</span>
                    <span>Text-to-Job Field Guide</span>
                  </div>
                </div>
                <div className={styles.cardHotlineTag}>
                  <span>
                    📱 Text: {isQualified ? fieldPhoneNumber : '🔒 Setup Alert Phone to Unlock'}
                  </span>
                </div>
              </div>

              <div className={styles.cardPhrasesGrid}>
                <div className={styles.cardPhraseBox}>
                  <span className={styles.cardPhraseLabel}>1. Change Orders &amp; Quotes</span>
                  <p className={styles.cardPhraseText}>
                    {selectedPhrases.changeOrder}
                  </p>
                </div>

                <div className={styles.cardPhraseBox}>
                  <span className={styles.cardPhraseLabel}>2. Milestones &amp; Inspections</span>
                  <p className={styles.cardPhraseText}>
                    {selectedPhrases.milestone}
                  </p>
                </div>

                <div className={styles.cardPhraseBox}>
                  <span className={styles.cardPhraseLabel}>3. Punch List Tasks</span>
                  <p className={styles.cardPhraseText}>
                    {selectedPhrases.punchList}
                  </p>
                </div>

                <div className={styles.cardPhraseBox}>
                  <span className={styles.cardPhraseLabel}>4. Emergency Leads</span>
                  <p className={styles.cardPhraseText}>
                    {selectedPhrases.newLead}
                  </p>
                </div>

                <div className={`${styles.cardPhraseBox} ${styles.cardPhraseBoxWide}`}>
                  <span className={styles.cardPhraseLabel}>5. Receipts &amp; Job Photos</span>
                  <p className={styles.cardPhraseText}>
                    {selectedPhrases.receipts}
                  </p>
                </div>
              </div>

              <div className={styles.cardFooterRules}>
                <span>↺ <strong>15-Min SMS Undo:</strong> Reply <code>UNDO</code> to revert any change.</span>
                <span className={styles.cardPoweredBy}>Sparky Field Hotline &bull; Let&apos;s Get Quoted</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className={styles.printModalActions}>
              <button type="button" onClick={handlePrintVisorCard} className={styles.printActionBtn}>
                🖨️ Print / Save as PDF
              </button>
              <button type="button" onClick={handleCopyVisorCheatsheet} className={styles.copyCheatBtn}>
                📋 Copy Text Cheatsheet
              </button>
              <button type="button" onClick={() => setShowPrintModal(false)} className={styles.closeActionBtn}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
