'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { MessageSquare, PhoneCall, Copy, Check, IdCard, ArrowRight } from 'lucide-react';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';
import SaveFieldContactButton from '@/components/SaveFieldContactButton';
import { useAssistant } from '@/components/ai-assistant/AssistantProvider';
import { evaluateFieldNoteConfidence, type FieldConfidenceVerdict } from '@/lib/field-intake-quality';
import OwnerPhoneSetupModal, { type OwnerPhoneSetupData } from './OwnerPhoneSetupModal';
import styles from './text-to-job.module.css';

export type ExtractedItem = {
  id: string;
  pillar: 'jobs' | 'leads' | 'schedule' | 'crew';
  title: string;
  detail: string;
  targetTable: string;
  mutation: string;
  enabled: boolean;
  targetUrl?: string;
};

export type InboundMessage = {
  id: string;
  sender: string;
  type: 'sms' | 'voice' | 'receipt';
  time: string;
  rawText: string;
  audioDuration?: string;
  confidence?: number;
  qualityVerdict?: FieldConfidenceVerdict;
  matchedJobRef?: string;
  targetRecordUrl?: string;
  extractedItems: ExtractedItem[];
};

export function getMessageVerdict(msg: InboundMessage): FieldConfidenceVerdict {
  if (msg.qualityVerdict) return msg.qualityVerdict;
  return evaluateFieldNoteConfidence(msg.rawText, {
    type: msg.type,
    matchedJobRef: msg.matchedJobRef,
    extractedItemsCount: msg.extractedItems?.length,
    isLead: msg.extractedItems?.some((i) => i.pillar === 'leads'),
  });
}

export function parseFieldNoteToItems(
  text: string,
  currentCompanionName: string
): {
  matchedRef: string;
  items: ExtractedItem[];
  isLead: boolean;
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const items: ExtractedItem[] = [];
  const idPrefix = `sim-${Date.now()}`;

  // 1. Detect Job Reference or Client Name
  let matchedRef = 'Job J-104 (Miller)';
  const jobMatch = clean.match(/\b(?:job\s*(?:#|j-)?(\d+)|([A-Z][a-z]+)\s+(?:job|remodel|roof|residence|addition|project))\b/i);
  const clientNameMatch = clean.match(/\b(Miller|Johnson|Smith|Davis|Wilson|Taylor|Clark|Jenkins|Perez|Morgan|Anderson|Martinez)\b/i);
  const addressMatch = clean.match(/\b(\d{2,5}\s+[A-Z][a-zA-Z]+(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Way|Blvd))?)\b/i);
  const leadKeywordMatch = clean.match(/\b(?:new\s+lead|lead)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);

  if (leadKeywordMatch) {
    matchedRef = `New Lead: ${leadKeywordMatch[1]}`;
  } else if (clean.toLowerCase().includes('sarah jenkins')) {
    matchedRef = 'New Lead: Sarah Jenkins';
  } else if (clean.toLowerCase().includes('dave miller')) {
    matchedRef = 'New Lead: Dave Miller';
  } else if (clean.toLowerCase().includes('lead') && clientNameMatch) {
    matchedRef = `New Lead: ${clientNameMatch[1]}`;
  } else if (jobMatch) {
    if (jobMatch[1]) matchedRef = `Job J-${jobMatch[1]}`;
    else if (jobMatch[2]) matchedRef = `Job (${jobMatch[2]})`;
  } else if (clientNameMatch && addressMatch) {
    matchedRef = `Job (${clientNameMatch[1]} · ${addressMatch[1]})`;
  } else if (clientNameMatch) {
    matchedRef = `Job (${clientNameMatch[1]})`;
  } else if (addressMatch) {
    matchedRef = `Site (${addressMatch[1]})`;
  }

  const isLead =
    lower.includes('lead') ||
    lower.includes('new customer') ||
    lower.includes('prospect') ||
    matchedRef.startsWith('New Lead:');

  // 2. Financials / Dollar Amount Extraction
  const dollarMatch = clean.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)|\b(\d+)\s*(?:dollars|bucks)\b/i);
  if (dollarMatch) {
    const rawVal = dollarMatch[1] || dollarMatch[2];
    const num = parseFloat(rawVal.replace(/,/g, ''));
    const formatted = `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    let lineDesc = 'Scope adjustment and required materials';
    if (lower.includes('pex') || lower.includes('plumb')) {
      lineDesc = 'Extra 3/4" PEX lines and rough-in fittings added';
    } else if (lower.includes('plywood') || lower.includes('rot') || lower.includes('decking')) {
      lineDesc = 'CDX 1/2" exterior subdecking replacement and fasteners';
    } else if (lower.includes('capacitor') || lower.includes('freon') || lower.includes('refrigerant')) {
      lineDesc = 'Dual run capacitor & R-410A refrigerant itemization';
    } else if (lower.includes('romex') || lower.includes('outlet') || lower.includes('gfci')) {
      lineDesc = 'Dedicated circuit, 12/2 Romex & GFCI outlet';
    } else if (lower.includes('drywall') || lower.includes('paint')) {
      lineDesc = 'Additional drywall patching and primer labor';
    }

    items.push({
      id: `${idPrefix}-quote`,
      pillar: 'jobs',
      title: `+${formatted} Quote Change Order`,
      detail: lineDesc,
      targetTable: 'quote_line_items',
      mutation: `Quote Math: +${formatted} Added`,
      enabled: true,
    });
  }

  // 3. Lead & Contact Profile Extraction
  const phoneMatch = clean.match(/(?:\+?1[-. ]?)?\(?([2-9][0-9]{2})\)?[-. ]?([2-9][0-9]{2})[-. ]?([0-9]{4})/);
  if (isLead || phoneMatch) {
    const phoneDisplay = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : '(248) 555-0991';
    let leadName = 'Prospective Customer';
    if (leadKeywordMatch) leadName = leadKeywordMatch[1];
    else if (clientNameMatch) leadName = clientNameMatch[1];
    if (clean.toLowerCase().includes('sarah jenkins')) leadName = 'Sarah Jenkins';
    else if (clean.toLowerCase().includes('dave miller')) leadName = 'Dave Miller';

    let service = 'Inbound Trade Inquiry';
    if (lower.includes('drain') || lower.includes('backup') || lower.includes('clog')) {
      service = 'Emergency Drain Clearing';
    } else if (lower.includes('tankless') || lower.includes('water heater')) {
      service = 'Tankless Water Heater Replacement';
    } else if (lower.includes('roof') || lower.includes('leak')) {
      service = 'Roof Leak Inspection & Repair';
    } else if (lower.includes('ac') || lower.includes('cool') || lower.includes('heat')) {
      service = 'HVAC Diagnostic & Repair';
    } else if (lower.includes('tree') || lower.includes('limb')) {
      service = 'Tree Branch Removal';
    }

    items.push({
      id: `${idPrefix}-lead`,
      pillar: 'leads',
      title: `New Lead: ${leadName}`,
      detail: `Phone: ${phoneDisplay} · Service: ${service}`,
      targetTable: 'leads',
      mutation: 'Lead Created · High Urgency',
      enabled: true,
    });
  }

  // 4. Scheduling & Arrival Slots
  const hasScheduleContext =
    lower.includes('schedule') ||
    lower.includes('arrival') ||
    lower.includes('appointment') ||
    lower.includes('estimate') ||
    lower.includes('window') ||
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(clean);

  const scheduleMatch = hasScheduleContext
    ? clean.match(
        /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|morning|afternoon))?\b|\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i
      )
    : null;

  if (scheduleMatch) {
    const day = scheduleMatch[1]
      ? scheduleMatch[1].charAt(0).toUpperCase() + scheduleMatch[1].slice(1).toLowerCase()
      : 'Today';
    let time = scheduleMatch[2] || scheduleMatch[3] || 'Morning';
    if (time.toLowerCase() === '8am' || time.toLowerCase() === '8 am') time = '8:00 AM';
    else if (time.toLowerCase() === '9am' || time.toLowerCase() === '9 am') time = '9:00 AM';
    else if (time.toLowerCase() === '10am' || time.toLowerCase() === '10 am') time = '10:00 AM';
    else if (time.toLowerCase() === '11am' || time.toLowerCase() === '11 am') time = '11:00 AM';
    else if (time.toLowerCase() === '2pm' || time.toLowerCase() === '2 pm') time = '2:00 PM';

    items.push({
      id: `${idPrefix}-sched`,
      pillar: 'schedule',
      title: `Schedule Arrival: ${day} ${time}`,
      detail: 'Dispatch slot reserved on calendar without booking collisions',
      targetTable: 'schedule_occurrences',
      mutation: `Slot: ${day} ${time}`,
      enabled: true,
    });
  }

  // 5. Punch Lists & Crew Delegation
  const punchListMatches = [...clean.matchAll(/(?:^|\s)(\d+)[.)]\s*([^\d\n]+?)(?=(?:\s+\d+[.)]|$))/g)];
  if (punchListMatches.length > 0) {
    punchListMatches.forEach((m, idx) => {
      const taskText = m[2].trim().replace(/[.,;]+$/, '');
      items.push({
        id: `${idPrefix}-task-${idx + 1}`,
        pillar: 'crew',
        title: `Punch List #${idx + 1}: ${taskText.charAt(0).toUpperCase() + taskText.slice(1)}`,
        detail: `Itemized field task assigned to crew checklist`,
        targetTable: 'crew_tasks',
        mutation: 'Status: Pending',
        enabled: true,
      });
    });
  } else if (
    lower.includes('punch list') ||
    lower.includes('touch up') ||
    lower.includes('latch') ||
    lower.includes('caulk')
  ) {
    items.push({
      id: `${idPrefix}-task-1`,
      pillar: 'crew',
      title: 'Task Done: Touch-up and Punch List',
      detail: 'Sign-off required for customer walkthrough',
      targetTable: 'crew_tasks',
      mutation: 'Status: Completed',
      enabled: true,
    });
  }

  // 6. Crew Assignment
  const assignMatch = clean.match(/\b(?:assign\s+([A-Z][a-z]+)|ask\s+([A-Z][a-z]+)|need\s+([A-Z][a-z]+))\b/i);
  if (assignMatch && !punchListMatches.length) {
    const worker = assignMatch[1] || assignMatch[2] || assignMatch[3];
    items.push({
      id: `${idPrefix}-crew`,
      pillar: 'crew',
      title: `Assign Crew: ${worker}`,
      detail: `Push alert dispatched with site credentials`,
      targetTable: 'crew_assignments',
      mutation: `Assigned: ${worker}`,
      enabled: true,
    });
  }

  // 7. Milestones & Inspections
  if (lower.includes('inspection') || lower.includes('passed') || lower.includes('clearance')) {
    items.push({
      id: `${idPrefix}-milestone`,
      pillar: 'jobs',
      title: 'Milestone: Inspection Sign-Off Logged',
      detail: 'Timestamped inspection clearance verified in job activity feed',
      targetTable: 'job_activity_feed',
      mutation: 'Inspection Logged',
      enabled: true,
    });
  } else if (lower.includes('photo') || lower.includes('pic') || lower.includes('receipt')) {
    items.push({
      id: `${idPrefix}-media`,
      pillar: 'jobs',
      title: 'Attached Photo Proof to Job Timeline',
      detail: 'Timestamped jobsite photo archived to timeline',
      targetTable: 'job_activity_feed',
      mutation: '1 Photo Stored',
      enabled: true,
    });
  } else if (lower.includes('walkthrough')) {
    items.push({
      id: `${idPrefix}-stage`,
      pillar: 'jobs',
      title: 'Stage: Final Walkthrough Ready',
      detail: 'Customer walkthrough notification ready for release',
      targetTable: 'jobs',
      mutation: 'Walkthrough Ready',
      enabled: true,
    });
  } else if (
    lower.includes('site') ||
    lower.includes('gate') ||
    lower.includes('key') ||
    lower.includes('finished') ||
    lower.includes('locked')
  ) {
    items.push({
      id: `${idPrefix}-activity`,
      pillar: 'jobs',
      title: 'Jobsite Progress & Access Note Logged',
      detail: clean,
      targetTable: 'job_activity_feed',
      mutation: 'History Stored',
      enabled: true,
    });
  }

  // Fallback if no specific items matched
  if (items.length === 0) {
    items.push({
      id: `${idPrefix}-note-1`,
      pillar: 'jobs',
      title: 'Field Update Logged to Job Timeline',
      detail: clean,
      targetTable: 'job_activity_feed',
      mutation: 'History Stored',
      enabled: true,
    });
    items.push({
      id: `${idPrefix}-note-2`,
      pillar: 'crew',
      title: 'Action Item Logged on Site',
      detail: `Technician field update recorded by ${currentCompanionName}`,
      targetTable: 'crew_tasks',
      mutation: 'Status: Logged',
      enabled: true,
    });
  }

  return { matchedRef, items, isLead };
}

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
    alert_phone: string | null;
    trade: string | null;
    call_tracking_number: string | null;
  } | null;
  crewMembers?: CrewRow[];
  initialMessages?: InboundMessage[];
  sharedPhoneNumber?: string;
  isQualified?: boolean;
  qualificationUnavailable?: boolean;
  ownerPhoneSetup: OwnerPhoneSetupData;
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
    punchList: '“Smith punch list: 1) replace basement GFCI 2) label panel breakers”',
    newLead: '“New lead: Dave Miller 248-555-0199 needs 200A panel upgrade estimate”',
    receipts: '“Bought $185 supplies at Home Depot for Miller: 250ft 12/2 wire, boxes”',
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
  sharedPhoneNumber,
  isQualified = true,
  qualificationUnavailable = false,
  ownerPhoneSetup,
  activeJobCount,
  leadCount,
  crewCount,
}: TextToJobWorkspaceProps) {
  const { companion, companionId, companionTrade } = useAssistant();
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

  // Setup & Advanced Accordions
  const [showWhitelistAccordion, setShowWhitelistAccordion] = useState<boolean>(false);
  const [showSiriAccordion, setShowSiriAccordion] = useState<boolean>(false);

  // Visor Card Customizer State
  const [printBizName, setPrintBizName] = useState(
    account?.business_name || 'Apex Contracting & Trade Pro'
  );
  const [printTrade, setPrintTrade] = useState(
    account?.trade && AVAILABLE_TRADES.includes(account.trade) ? account.trade : 'Electrical'
  );
  const [cardTheme, setCardTheme] = useState<'laminated' | 'stealth'>('laminated');

  const selectedPhrases =
    TRADE_PHRASES[printTrade] || TRADE_PHRASES['General Contractor'] || TRADE_PHRASES['Electrical'];

  function handlePrintVisorCard() {
    if (typeof window === 'undefined') return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    const isStealth = cardTheme === 'stealth';
    const biz = printBizName || businessTitle;
    const phoneDisplay = isQualified ? fieldPhoneNumber : 'Alert Phone Setup Required';

    const cardHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${biz} - Quick Reference Visor Card</title>
  <style>
    @page {
      size: landscape;
      margin: 0.35in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: ${isStealth ? '#0a1018' : '#ffffff'};
      color: ${isStealth ? '#f5f0e7' : '#0f172a'};
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .card {
      width: 100%;
      max-width: 680px;
      background: ${isStealth ? '#0f1f2e' : '#ffffff'};
      color: ${isStealth ? '#f5f0e7' : '#0f172a'};
      border: 2px solid ${isStealth ? '#ff7a21' : '#0f172a'};
      border-radius: 14px;
      padding: 20px 24px;
      position: relative;
    }
    .notch {
      position: absolute;
      top: -2px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 8px;
      background: #94a3b8;
      border-radius: 0 0 6px 6px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid ${isStealth ? 'rgba(255, 122, 33, 0.4)' : '#0f172a'};
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .biz-title {
      font-size: 18px;
      font-weight: 900;
      color: ${isStealth ? '#f5f0e7' : '#0f172a'};
      letter-spacing: -0.02em;
    }
    .trade-sub {
      font-size: 11px;
      font-weight: 700;
      color: ${isStealth ? '#94a3b8' : '#64748b'};
      text-transform: uppercase;
      margin-top: 2px;
    }
    .hotline-tag {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12.5px;
      font-weight: 900;
      color: ${isStealth ? '#ff8e42' : '#ea580c'};
      background: ${isStealth ? 'rgba(255, 122, 33, 0.15)' : '#fff7ed'};
      border: 1px solid ${isStealth ? '#ff7a21' : '#fdba74'};
      padding: 4px 10px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .phrase-box {
      border: 1px solid ${isStealth ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'};
      background: ${isStealth ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc'};
      border-radius: 8px;
      padding: 8px 10px;
    }
    .phrase-box.wide {
      grid-column: 1 / -1;
      background: ${isStealth ? 'rgba(255, 122, 33, 0.08)' : '#fffbeb'};
      border-color: ${isStealth ? 'rgba(255, 122, 33, 0.3)' : '#fde68a'};
    }
    .phrase-label {
      font-size: 9.5px;
      font-weight: 900;
      text-transform: uppercase;
      color: ${isStealth ? '#ff8e42' : '#ea580c'};
      letter-spacing: 0.05em;
      margin-bottom: 3px;
      display: block;
    }
    .phrase-text {
      font-size: 11.5px;
      font-weight: 600;
      line-height: 1.35;
      color: ${isStealth ? '#f5f0e7' : '#1e293b'};
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid ${isStealth ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'};
      padding-top: 8px;
      font-size: 10px;
      color: ${isStealth ? '#94a3b8' : '#475569'};
    }
    .footer strong {
      color: ${isStealth ? '#ff8e42' : '#0f172a'};
    }
    .footer-right {
      font-weight: 800;
      text-transform: uppercase;
      opacity: 0.75;
    }
    @media print {
      body {
        padding: 0;
        background: transparent;
      }
      .card {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="notch"></div>
    <div class="header">
      <div>
        <div class="biz-title">${biz}</div>
        <div class="trade-sub">${printTrade} &bull; Text-to-Job Field Guide</div>
      </div>
      <div class="hotline-tag">📱 Text: ${phoneDisplay}</div>
    </div>
    <div class="grid">
      <div class="phrase-box">
        <span class="phrase-label">1. Change Orders &amp; Quotes</span>
        <div class="phrase-text">${selectedPhrases.changeOrder}</div>
      </div>
      <div class="phrase-box">
        <span class="phrase-label">2. Milestones &amp; Inspections</span>
        <div class="phrase-text">${selectedPhrases.milestone}</div>
      </div>
      <div class="phrase-box">
        <span class="phrase-label">3. Punch List Tasks</span>
        <div class="phrase-text">${selectedPhrases.punchList}</div>
      </div>
      <div class="phrase-box">
        <span class="phrase-label">4. Emergency Leads</span>
        <div class="phrase-text">${selectedPhrases.newLead}</div>
      </div>
      <div class="phrase-box wide">
        <span class="phrase-label">5. Receipts &amp; Job Photos</span>
        <div class="phrase-text">${selectedPhrases.receipts}</div>
      </div>
    </div>
    <div class="footer">
      <div>↺ <strong>15-Min SMS Undo:</strong> Reply <code>UNDO</code> to revert any change. 📞 Call or text hands-free (calls use Voice credits).</div>
      <div class="footer-right">Your AI Copilot (Currently: ${companion.name}) Field Hotline &bull; Let's Get Quoted</div>
    </div>
  </div>
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(cardHtml);
    printWindow.document.close();
  }

  function handleCopyVisorCheatsheet() {
    const text = `📱 ${printBizName || businessTitle} Field Ingest Hotline: ${fieldPhoneNumber}
(Verified Mobile: ${alertPhone} · Powered by Your AI Copilot: ${companion.name})

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

📞 Hands-Free Dictation: Call ${fieldPhoneNumber} from your truck to dictate updates hands-free using your Voice credits.
🛡️ 15-Min SMS Undo: Reply UNDO within 15 minutes to revert.`;
    navigator.clipboard.writeText(text);
    setNotification('📋 Copied text cheatsheet to clipboard!');
    setTimeout(() => setNotification(null), 3500);
  }

  // Field Note Composer & Dictation State
  const [simText, setSimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceUsed, setIsVoiceUsed] = useState(false);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

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

  // Keyboard Shortcuts: Escape to close modals, Arrow keys to browse messages
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowPrintModal(false);
        setShowSimModal(false);
      }
      if (
        !showPrintModal &&
        !showSimModal &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        if (e.key === 'ArrowDown') {
          const currentIndex = filteredMessages.findIndex((m) => m.id === selectedMsgId);
          if (currentIndex < filteredMessages.length - 1) {
            e.preventDefault();
            setSelectedMsgId(filteredMessages[currentIndex + 1].id);
          }
        } else if (e.key === 'ArrowUp') {
          const currentIndex = filteredMessages.findIndex((m) => m.id === selectedMsgId);
          if (currentIndex > 0) {
            e.preventDefault();
            setSelectedMsgId(filteredMessages[currentIndex - 1].id);
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPrintModal, showSimModal, filteredMessages, selectedMsgId]);

  const fieldPhoneNumber = qualificationUnavailable
    ? 'Phone status unavailable'
    : isQualified
      ? formatUsPhone(sharedPhoneNumber || '+19479412323')
      : '🔒 Setup Alert Phone to Unlock';

  const rawCallableNumber = isQualified
    ? sharedPhoneNumber || '+19479412323'
    : '';

  const alertPhone = account?.alert_phone ? formatUsPhone(account.alert_phone) : '(No cell phone set)';
  const businessTitle = account?.business_name || 'Your Company';

  const activeCrewList = crewMembers;
  const verifiedCrewCount = activeCrewList.filter((c) => c.active && Boolean(c.phone) && c.phoneVerified).length;
  const totalAuthorizedDevices = (isQualified ? 1 : 0) + verifiedCrewCount;

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

  function startVoiceDictation() {
    if (typeof window === 'undefined') return;
    const win = window as any;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotification('🎙️ Speech recognition is not supported in this browser. You can type on the keypad.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setIsVoiceUsed(true);
        setNotification('🎙️ Listening... speak your field note');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        if (transcript.trim()) {
          setSimText(transcript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setNotification('⚠️ Microphone access denied. Allow mic permissions to dictate.');
        } else if (event.error !== 'no-speech') {
          setNotification(`Microphone notice: ${event.error}`);
        }
        setTimeout(() => setNotification(null), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setNotification('Could not start microphone dictation.');
      setTimeout(() => setNotification(null), 3000);
    }
  }

  function handleSimulate() {
    const textToParse = simText.trim();
    if (!textToParse) return;

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }

    const { matchedRef, items: newExtractedItems, isLead } = parseFieldNoteToItems(
      textToParse,
      companion.name
    );

    const simVerdict = evaluateFieldNoteConfidence(textToParse, {
      type: isVoiceUsed ? 'voice' : 'sms',
      matchedJobRef: matchedRef,
      extractedItemsCount: newExtractedItems.length,
      isLead,
    });

    const newSimMsg: InboundMessage = {
      id: `sim-${Date.now()}`,
      sender: `Alert Phone (${alertPhone})`,
      type: isVoiceUsed ? 'voice' : 'sms',
      time: 'Just now',
      rawText: `“${textToParse}”`,
      audioDuration: isVoiceUsed ? '0:08' : undefined,
      confidence: simVerdict.score,
      qualityVerdict: simVerdict,
      matchedJobRef: matchedRef,
      extractedItems: newExtractedItems,
    };

    setMessages([newSimMsg, ...messages]);
    setSelectedMsgId(newSimMsg.id);
    setShowSimModal(false);
    setIsVoiceUsed(false);
    setNotification(
      `⚡ Field note parsed (${simVerdict.score}% quality · ${simVerdict.label})! Created ${newExtractedItems.length} updates.`
    );
    setTimeout(() => setNotification(null), 4500);
  }

  return (
    <div className={styles.container}>
      {/* 0. Keep a read failure distinct from a phone that genuinely needs setup. */}
      {qualificationUnavailable ? (
        <div className={styles.topQualificationBanner} role="status">
          <div className={styles.topQualificationLeft}>
            <span className={styles.topQualificationIcon} aria-hidden="true">⚠️</span>
            <div>
              <strong className={styles.topQualificationTitle}>We could not confirm your phone status</strong>
              <p className={styles.topQualificationText}>
                Your saved number has not been changed. Refresh this page in a moment to check it again.
              </p>
            </div>
          </div>
        </div>
      ) : !isQualified ? (
        <div className={styles.topQualificationBanner}>
          <div className={styles.topQualificationLeft}>
            <span className={styles.topQualificationIcon} aria-hidden="true">🔒</span>
            <div>
              <strong className={styles.topQualificationTitle}>
                Field Hotline Locked — Cell Phone Setup Required
              </strong>
              <p className={styles.topQualificationText}>
                To protect against spam and whitelist your phone, connect your mobile number in Notifications. Once saved, your field hotline unlocks immediately.
              </p>
            </div>
          </div>
          <OwnerPhoneSetupModal
            setup={ownerPhoneSetup}
            sharedPhoneNumber={sharedPhoneNumber}
            triggerClassName={styles.topQualificationBtn}
            triggerLabel={<>📱 Connect Cell Phone <span aria-hidden="true">&rarr;</span></>}
          />
        </div>
      ) : null}

      {/* 1. Unified Hero Header / AI Copilot Field Line Card */}
      <div className={isQualified ? `msg-setup-copilot-card ${styles.headerUnifiedCard}` : styles.header}>
        <div className={styles.headerMainRow}>
          <div className={styles.sparkyHeaderRow}>
            <SparkyAvatar
              companionId={companionId}
              trade={companionTrade || account?.trade || 'general'}
              size="lg"
              status="online"
            />
            <div className={styles.headerTitleCol}>
              <div className={styles.sparkyBadgeRow}>
                {isQualified ? (
                  <>
                    <span className="msg-setup-copilot-live-dot" aria-hidden="true" />
                    <span className="msg-setup-copilot-badge">🎙️ AI Copilot Field Line Ready</span>
                    <span className="msg-setup-copilot-sparky-tag">✦ {companion.name} Active</span>
                  </>
                ) : (
                  <span className={styles.badge}>
                    ✦ Your AI Copilot (Currently: {companion.name}) · {companion.badgeLabel}
                  </span>
                )}
              </div>
              <div className={styles.headerTitleRow}>
                <h1 className={styles.title}>Text-to-Job Dashboard</h1>
              </div>
            </div>
          </div>

          {isQualified ? (
            <div className={styles.hotlineCol}>
              <div className="msg-setup-copilot-phone-box">
                <span className="msg-setup-copilot-phone-label">Hotline</span>
                <a
                  href={`tel:${rawCallableNumber.replace(/[^\d+]/g, '')}`}
                  className="msg-setup-copilot-num"
                  title="Click to call hotline"
                >
                  {fieldPhoneNumber}
                </a>
                <button
                  type="button"
                  onClick={handleCopyNumber}
                  className={`msg-setup-copilot-copy-btn ${copiedNumber ? 'copied' : ''}`}
                  title="Copy phone number"
                  aria-label="Copy phone number"
                >
                  {copiedNumber ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                  <span>{copiedNumber ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              {account?.alert_phone && (
                <span className="msg-setup-verified-tag" title="Inbound updates accepted from this verified mobile">
                  From: {alertPhone}
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className={styles.headerQuickGuideBtn}
              title="Open Printable Visor Card & Quick Commands Guide"
            >
              🪪 Quick Commands / Visor Card
            </button>
          )}
        </div>

        <p className={styles.subtitle}>
          {!isQualified && !qualificationUnavailable ? (
            <>
              Text, send voice memos, or call{' '}
              <OwnerPhoneSetupModal
                setup={ownerPhoneSetup}
                sharedPhoneNumber={sharedPhoneNumber}
                triggerClassName={styles.inlinePhoneSetupBtn}
                triggerLabel="Setup Alert Phone to Unlock"
              />{' '}
              hands-free (using Voice credits)—your AI Copilot (Currently: {companion.name}) updates quotes,
              punch lists, and schedules instantly.
            </>
          ) : (
            <>
              Text notes, material receipts, gate codes, or punch lists to update job records automatically—your AI Copilot (Currently: {companion.name}) organizes records instantly. Call directly from your truck to dictate updates hands-free using your Voice credits.
            </>
          )}
        </p>

        {isQualified && (
          <div className="msg-setup-copilot-actions">
            <SaveFieldContactButton size="small" label="Save Contact Card (.vcf)" />
            <a
              href={`sms:${rawCallableNumber.replace(/[^\d+]/g, '')}`}
              className="msg-setup-action-btn"
            >
              <MessageSquare size={13} aria-hidden="true" />
              <span>Text Copilot</span>
            </a>
            <a
              href={`tel:${rawCallableNumber.replace(/[^\d+]/g, '')}`}
              className="msg-setup-action-btn"
            >
              <PhoneCall size={13} aria-hidden="true" />
              <span>Call Hotline</span>
            </a>
            <button
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="msg-setup-copilot-link"
              title="Open Printable Visor Card & Quick Commands Guide"
            >
              <IdCard size={14} aria-hidden="true" />
              <span>Quick Commands / Visor Card</span>
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && <div className={styles.notificationToast}>{notification}</div>}

      {/* Field Note Composer: Voice Dictation & Keypad Input */}
      <div className={styles.composerCard} id="field-note-composer">
        <div className={styles.composerHeader}>
          <div className={styles.composerTitleGroup}>
            <div className={styles.composerTitleRow}>
              <span className={styles.composerIcon} aria-hidden="true">⚡</span>
              <h2 className={styles.composerTitle}>Direct Field Note &amp; Voice Dictation</h2>
              <span className={styles.composerLiveTag}>✦ Live AI Intake</span>
            </div>
            <p className={styles.composerSubtitle}>
              Type on your keypad or tap the microphone to dictate hands-free. Copilot will extract change orders, new leads, punch lists, and schedule slots instantly.
            </p>
          </div>
          {isListening && (
            <div className={styles.composerListeningBadge}>
              <span className={styles.composerPulseDot} aria-hidden="true" />
              <span>Listening to voice dictation…</span>
            </div>
          )}
        </div>

        <div className={styles.composerInputWrap}>
          <textarea
            ref={composerInputRef}
            id="field-note-input"
            value={simText}
            onChange={(e) => setSimText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSimulate();
              }
            }}
            placeholder="Type or dictate a field note... e.g. 'Add $450 to Miller job at 124 Main for extra romex, schedule inspection Thursday 9am'"
            className={`${styles.composerTextarea} ${isListening ? styles.composerTextareaListening : ''}`}
            rows={3}
            aria-label="Field message text input"
          />

          <div className={styles.composerActionBar}>
            <div className={styles.composerLeftActions}>
              <button
                type="button"
                onClick={startVoiceDictation}
                className={`${styles.composerVoiceBtn} ${isListening ? styles.composerVoiceBtnActive : ''}`}
                aria-label={isListening ? 'Stop microphone dictation' : 'Start voice-to-text dictation'}
                title={isListening ? 'Click to stop listening' : 'Click to dictate via microphone'}
              >
                {isListening ? (
                  <>
                    <span className={styles.composerWaveform} aria-hidden="true">
                      <span className={styles.composerWaveBar} />
                      <span className={styles.composerWaveBar} />
                      <span className={styles.composerWaveBar} />
                      <span className={styles.composerWaveBar} />
                    </span>
                    <span>Stop Dictating</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">🎙️</span>
                    <span>Voice to Text</span>
                  </>
                )}
              </button>

              {simText.trim() && (
                <button
                  type="button"
                  onClick={() => setSimText('')}
                  className={styles.composerClearBtn}
                  title="Clear text field"
                >
                  Clear
                </button>
              )}
            </div>

            <div className={styles.composerRightActions}>
              <span className={styles.composerKeyHint}>
                <span>Keypad / Enter</span> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
              </span>
              <button
                type="button"
                onClick={handleSimulate}
                disabled={!simText.trim()}
                className={`${styles.composerSubmitBtn} ${!simText.trim() ? styles.composerSubmitBtnDisabled : ''}`}
              >
                <span>⚡ Turn into Parsed Data</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Presets for Contractors */}
        <div className={styles.composerPresets}>
          <span className={styles.composerPresetsLabel}>Try a realistic field example:</span>
          <div className={styles.composerPresetsList}>
            <button
              type="button"
              onClick={() => {
                setSimText('Add $450 to Miller job at 124 Main for extra romex and schedule inspection Thursday 9am.');
                composerInputRef.current?.focus();
              }}
              className={styles.composerPresetChip}
            >
              💰 Change Order (+$450)
            </button>
            <button
              type="button"
              onClick={() => {
                setSimText('New lead: Sarah Jenkins 248-555-0991 emergency main drain backup needs estimate Friday 9am.');
                composerInputRef.current?.focus();
              }}
              className={styles.composerPresetChip}
            >
              👤 New Lead (Sarah Jenkins)
            </button>
            <button
              type="button"
              onClick={() => {
                setSimText('Johnson punch list: 1) caulked exterior trim 2) painted hallway baseboards 3) fix loose door latch.');
                composerInputRef.current?.focus();
              }}
              className={styles.composerPresetChip}
            >
              📋 Remodel Punch List
            </button>
            <button
              type="button"
              onClick={() => {
                setSimText('Add $550 change order for 4 sheets plywood rot repair on Johnson roof.');
                composerInputRef.current?.focus();
              }}
              className={styles.composerPresetChip}
            >
              🏠 Roofing Rot Repair ($550)
            </button>
            <button
              type="button"
              onClick={() => {
                setSimText('Replace 45/5 capacitor on Carrier AC for Smith. Added 2 lbs R-410A refrigerant. Quote $285 total.');
                composerInputRef.current?.focus();
              }}
              className={styles.composerPresetChip}
            >
              ⚡ HVAC Repair ($285)
            </button>
          </div>
        </div>
      </div>

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
                        {(() => {
                          const msgVerdict = getMessageVerdict(msg);
                          return (
                            <span
                              className={`${styles.feedConfidenceBadge} ${
                                msgVerdict.level === 'ready'
                                  ? styles.feedConfidenceBadgeReady
                                  : msgVerdict.level === 'review'
                                  ? styles.feedConfidenceBadgeReview
                                  : styles.feedConfidenceBadgeLow
                              }`}
                            >
                              {msgVerdict.badgeText}
                            </span>
                          );
                        })()}
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
                  {selectedMessage.extractedItems.some((i) => i.pillar === 'leads') ? (
                    <Link
                      href={selectedMessage.targetRecordUrl || '/dashboard/leads'}
                      className={styles.openJobLink}
                    >
                      Open Lead ↗
                    </Link>
                  ) : (
                    <Link
                      href={selectedMessage.targetRecordUrl || '/dashboard/jobs'}
                      className={styles.openJobLink}
                    >
                      Open Job ↗
                    </Link>
                  )}
                  {(() => {
                    const selectedVerdict = getMessageVerdict(selectedMessage);
                    return (
                      <div
                        className={`${styles.receiptConfidencePill} ${
                          selectedVerdict.level === 'ready'
                            ? styles.receiptConfidencePillReady
                            : selectedVerdict.level === 'review'
                            ? styles.receiptConfidencePillReview
                            : styles.receiptConfidencePillLow
                        }`}
                      >
                        {selectedVerdict.badgeText} &bull; {selectedVerdict.score}% Quality
                      </div>
                    );
                  })()}
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

              {/* Quality & Confidence Breakdown */}
              {(() => {
                const selectedVerdict = getMessageVerdict(selectedMessage);
                return (
                  <div className={styles.receiptQualityBox}>
                    <div className={styles.receiptQualityTitle}>
                      <span>Extraction Quality Breakdown</span>
                      <span
                        className={`${styles.receiptQualityScoreTag} ${
                          selectedVerdict.level === 'ready'
                            ? styles.receiptQualityScoreTagReady
                            : selectedVerdict.level === 'review'
                            ? styles.receiptQualityScoreTagReview
                            : styles.receiptQualityScoreTagLow
                        }`}
                      >
                        {selectedVerdict.score}% Quality &bull; {selectedVerdict.label}
                      </span>
                    </div>
                    <ul className={styles.receiptQualityReasons}>
                      {selectedVerdict.reasons.map((reason, idx) => (
                        <li key={idx} className={styles.receiptQualityReasonItem}>
                          <span>
                            {selectedVerdict.level === 'ready'
                              ? '✓'
                              : selectedVerdict.level === 'review'
                              ? '•'
                              : '⚠️'}
                          </span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

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

                    const linkHref =
                      item.targetUrl ||
                      (item.pillar === 'jobs'
                        ? selectedMessage.targetRecordUrl || '/dashboard/jobs'
                        : item.pillar === 'leads'
                        ? selectedMessage.targetRecordUrl || '/dashboard/leads'
                        : item.pillar === 'schedule'
                        ? '/dashboard/schedule'
                        : '/dashboard/crew');

                    const linkText =
                      item.pillar === 'jobs'
                        ? '↗ Open Quote'
                        : item.pillar === 'leads'
                        ? '↗ Open Lead'
                        : item.pillar === 'schedule'
                        ? '↗ Calendar'
                        : '↗ Crew Task';

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
                            <Link
                              href={linkHref}
                              onClick={(e) => e.stopPropagation()}
                              className={styles.receiptItemDeepLink}
                              title={`Jump to ${linkText}`}
                            >
                              {linkText}
                            </Link>
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
                  {selectedMessage.id.startsWith('sim-') ? (
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={selectedMessage.extractedItems.filter((i) => i.enabled).length === 0}
                      className={`${styles.applyBtn} ${
                        selectedMessage.extractedItems.filter((i) => i.enabled).length === 0
                          ? styles.applyBtnDisabled
                          : ''
                      }`}
                    >
                      ⚡ In-Memory Simulation Preview · Test Only
                    </button>
                  ) : (
                    <Link
                      href={
                        selectedMessage.targetRecordUrl ||
                        (selectedMessage.extractedItems.some((i) => i.pillar === 'leads')
                          ? '/dashboard/leads'
                          : '/dashboard/jobs')
                      }
                      className={styles.applyBtn}
                      style={{ textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ↗ View in {selectedMessage.extractedItems.some((i) => i.pillar === 'leads') ? 'Lead Record' : 'Job File'}
                    </Link>
                  )}
                </div>
                <div className={styles.receiptFooterNote}>
                  {selectedMessage.id.startsWith('sim-') ? (
                    <span>💡 Simulated intake preview — not persisted to database</span>
                  ) : (
                    <span>✓ Automatically verified and filed to timeline upon receipt</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* =========================================================================
          Setup & Advanced Configuration (Collapsible Accordions)
          ========================================================================= */}
      <div className={styles.setupAdvancedSection}>
        <div className={styles.setupAdvancedHeader}>
          <div className={styles.setupAdvancedTitleGroup}>
            <span className={styles.badge}>⚙️ Team Access &amp; Voice Setup</span>
            <h2 className={styles.setupAdvancedTitle}>Who Can Text Your AI Copilot (Currently: {companion.name}) &amp; Driving Voice Setup</h2>
            <p className={styles.setupAdvancedSubtitle}>
              Manage authorized crew phone numbers, or view 1-minute Siri &amp; Google Assistant steering wheel dictation setup.
            </p>
          </div>
        </div>

        <div className={styles.accordionGroup}>
          {/* Accordion 1: Authorized Phone Whitelist */}
          <div className={styles.accordionCard}>
            <button
              type="button"
              onClick={() => setShowWhitelistAccordion(!showWhitelistAccordion)}
              className={styles.accordionHeaderBtn}
              aria-expanded={showWhitelistAccordion}
              aria-controls={showWhitelistAccordion ? 'whitelist-accordion-body' : undefined}
            >
              <div className={styles.accordionHeaderLeft}>
                <span className={styles.accordionIcon}>👥</span>
                <div>
                  <strong className={styles.accordionTitle}>
                    Who Can Text Your AI Copilot (Currently: {companion.name}) (Team Phone Access)
                  </strong>
                  <p className={styles.accordionSubtitle}>
                    {totalAuthorizedDevices} {totalAuthorizedDevices === 1 ? 'phone' : 'phones'} configured to send job updates directly to your AI Copilot (Currently: {companion.name})
                  </p>
                </div>
              </div>
              <span className={styles.accordionChevron}>
                {showWhitelistAccordion ? '▲ Hide Team Numbers' : '▼ Manage Team Numbers'}
              </span>
            </button>

            {showWhitelistAccordion && (
              <div id="whitelist-accordion-body" className={styles.accordionBody}>
                {/* Simple alert if unverified */}
                {!isQualified && !qualificationUnavailable && (
                  <div className={styles.qualificationWarningCard}>
                    <span style={{ fontSize: '24px' }}>📱</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#f5f0e7', fontSize: '15px' }}>
                        Connect Your Cell Phone to Start Texting
                      </strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4 }}>
                        Add your mobile number so your AI Copilot (Currently: {companion.name}) recognizes you when you text from the job site.
                      </p>
                    </div>
                    <OwnerPhoneSetupModal
                      setup={ownerPhoneSetup}
                      sharedPhoneNumber={sharedPhoneNumber}
                      triggerClassName={styles.verifyBtn}
                      triggerLabel={<>📱 Connect Mobile Phone <span aria-hidden="true">&rarr;</span></>}
                    />
                  </div>
                )}

                <div className={styles.sendersCard}>
                  <div className={styles.sendersHeader}>
                    <div className={styles.sendersTitleGroup}>
                      <h3 className={styles.sendersTitle}>Authorized Phone Numbers</h3>
                      <p className={styles.sendersSubtitle}>
                        When these phone numbers text <strong>{fieldPhoneNumber}</strong>, your AI Copilot (Currently: {companion.name}) automatically links updates to the correct technician.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <Link href="/dashboard/crew?tab=people&add=1" className={styles.vcardBtn}>
                        + Add Crew Member
                      </Link>
                      <OwnerPhoneSetupModal
                        setup={ownerPhoneSetup}
                        sharedPhoneNumber={sharedPhoneNumber}
                        triggerClassName={styles.resetBtn}
                        triggerLabel="Manage My Phone"
                      />
                    </div>
                  </div>

                  <div className={styles.sendersTableWrap}>
                    <table className={styles.sendersTable}>
                      <thead>
                        <tr>
                          <th>Team Member</th>
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
                                <span className={styles.liveDot} /> Active
                              </span>
                            ) : qualificationUnavailable ? (
                              <span className={styles.senderStatusUnavailable}>Status unavailable</span>
                            ) : (
                              <OwnerPhoneSetupModal
                                setup={ownerPhoneSetup}
                                sharedPhoneNumber={sharedPhoneNumber}
                                triggerClassName={styles.senderVerifyLink}
                                triggerLabel={<>⚠️ Connect <span aria-hidden="true">&rarr;</span></>}
                              />
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
                                  <span className={styles.liveDot} /> Active
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
                </div>
              </div>
            )}
          </div>

          {/* Accordion 2: Siri & Hands-Free Setup */}
          <div className={styles.accordionCard}>
            <button
              type="button"
              onClick={() => setShowSiriAccordion(!showSiriAccordion)}
              className={styles.accordionHeaderBtn}
              aria-expanded={showSiriAccordion}
              aria-controls={showSiriAccordion ? 'siri-accordion-body' : undefined}
            >
              <div className={styles.accordionHeaderLeft}>
                <span className={styles.accordionIcon}>🎙️</span>
                <div>
                  <strong className={styles.accordionTitle}>
                    Apple Siri &amp; Google Assistant Hands-Free Driving
                  </strong>
                  <p className={styles.accordionSubtitle}>
                    1-Minute Setup &bull; Dictate updates directly into Apple CarPlay or Android Auto while driving
                  </p>
                </div>
              </div>
              <span className={styles.accordionChevron}>
                {showSiriAccordion ? '▲ Hide Guide' : '▼ View Voice Setup'}
              </span>
            </button>

            {showSiriAccordion && (
              <div id="siri-accordion-body" className={styles.accordionBody}>
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
                      ) : qualificationUnavailable ? (
                        <span className={styles.senderStatusUnavailable}>Phone status unavailable</span>
                      ) : (
                        <OwnerPhoneSetupModal
                          setup={ownerPhoneSetup}
                          sharedPhoneNumber={sharedPhoneNumber}
                          triggerClassName={styles.verifyBtn}
                          triggerLabel="📱 Setup Alert Phone to Download"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setShowPrintModal(true)}
                        className={styles.printCardBtn}
                      >
                        🪪 Printable Visor Card
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
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          Unified Cockpit Command Footer Bar
          ========================================================================= */}
      <div className={styles.unifiedBottomBar}>
        <div className={styles.unifiedBarLeft}>
          <button
            type="button"
            onClick={handleCopyNumber}
            className={styles.unifiedPhoneBadgeBtn}
            title="Click to copy field hotline number"
          >
            📱 {fieldPhoneNumber}
            <span className={styles.copySmallHint}>
              {copiedNumber ? '✓ Copied' : '📋 Copy'}
            </span>
          </button>
          <span className={styles.unifiedUndoBadge} title="Field intake notes and updates are automatically processed">
            ⚡ Live Field Ingest Active
          </span>
        </div>

        <div className={styles.unifiedBarCenter}>
          <Link href="/dashboard/jobs" className={styles.unifiedStatLink}>
            📁 <strong>{activeJobCount}</strong> Jobs
          </Link>
          <Link href="/dashboard/leads" className={styles.unifiedStatLink}>
            👤 <strong>{leadCount}</strong> Leads
          </Link>
          <Link href="/dashboard/schedule" className={styles.unifiedStatLink}>
            📅 Calendar
          </Link>
          <Link href="/dashboard/crew" className={styles.unifiedStatLink}>
            👷 <strong>{crewCount}</strong> Crew
          </Link>
        </div>

        <div className={styles.unifiedBarRight}>
          <button
            type="button"
            onClick={() => {
              composerInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              composerInputRef.current?.focus();
            }}
            className={styles.unifiedActionBtnPrimary}
          >
            ⚡ Dictate or Type a Note
          </button>
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
                  Type or dictate a note to see how your AI Copilot (Currently: {companion.name}) creates change orders, punch list tasks, and schedule slots.
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
                    📱 Text / Call: {isQualified ? fieldPhoneNumber : '🔒 Setup Alert Phone to Unlock'}
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
                <span>↺ <strong>15-Min Undo:</strong> Reply <code>UNDO</code> to revert. 📞 Call or text hands-free (calls use Voice credits).</span>
                <span className={styles.cardPoweredBy}>Your AI Copilot (Currently: {companion.name}) Field Hotline &bull; Let&apos;s Get Quoted</span>
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
