'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './text-to-record-simulator.module.css';

export type ExtractedPillarItem = {
  id: string;
  pillar: 'Jobs' | 'Leads' | 'Schedule' | 'Crew';
  title: string;
  detail: string;
  table: string;
};

export type Scenario = {
  id: string;
  tabLabel: string;
  shortChip: string;
  icon: string;
  title: string;
  badge: string;
  badgeType: 'quote' | 'voice' | 'task' | 'safety' | 'lead';
  description: string;
  contractorSender: string;
  contractorInputType: 'text' | 'voice' | 'receipt';
  contractorText?: string;
  receiptDetails?: {
    vendor: string;
    date: string;
    items: { name: string; price: string; allocatedJob?: string }[];
    subtotal: string;
    tax: string;
    total: string;
  };
  voiceAudioDuration?: string;
  voiceTranscript?: string;
  voiceLanguage?: string;
  aiResponse: string;
  followUpText?: string;
  aiFollowUpResponse?: string;
  homeownerSms?: {
    recipient: string;
    phone: string;
    messageText: string;
    approvalAmount: string;
  };
  pillars: ExtractedPillarItem[];
  jobRecord: {
    jobNumber: string;
    clientName: string;
    address: string;
    status: string;
    statusColor?: string;
    badgeText: string;
    totalAmount?: string;
    previousAmount?: string;
    lineItems?: { label: string; amount: string; isNew?: boolean }[];
    tasks?: { text: string; done?: boolean }[];
    costsSummary?: {
      totalRevenue: string;
      totalCosts: string;
      grossProfit: string;
      marginPercent: number;
      items: { label: string; amount: string; isNew?: boolean; vendor: string }[];
    };
    voiceFeed?: {
      duration: string;
      transcript: string;
      timestamp: string;
    };
    leadDetails?: {
      phone: string;
      service: string;
      requestedDate: string;
      score: string;
    };
    safetyNotice?: string;
  };
};

const SCENARIOS: Scenario[] = [
  {
    id: 'change-order',
    tabLabel: 'Quote Change Order (+$450)',
    shortChip: '$450 Romex Change Order',
    icon: '💰',
    title: 'Add Quote Line Items & Recalculate Totals',
    badge: 'Change Order Auto-Calculated',
    badgeType: 'quote',
    description:
      'Spotted extra work on-site? Text your platform number with the price and description. Your AI Copilot updates the job estimate and lets you text the customer approval link with 1 tap.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText: 'Add $450 to Miller job for extra 12/2 Romex line and GFCI outlet in pantry',
    aiResponse:
      '✅ Added $450.00 Electrical Line Item to Job J-104 (Miller). Total quote updated from $2,800 to $3,250.\nReply SEND to text approval link to homeowner.',
    followUpText: 'SEND',
    aiFollowUpResponse:
      '🚀 Updated quote approval link sent to Dave Miller ((248) 555-0123). Homeowner viewed notice will alert your phone.',
    homeownerSms: {
      recipient: 'Dave Miller (Homeowner)',
      phone: '(248) 555-0123',
      messageText:
        'Hi Dave, Apex Electric added Change Order #1 ($450.00 for pantry 12/2 Romex line & GFCI outlet). Tap here to review & authorize with 1 tap: letsgetquoted.com/q/j-104-co1',
      approvalAmount: '$450.00',
    },
    pillars: [
      {
        id: 'co-p1',
        pillar: 'Jobs',
        title: 'Add Quote Line Item (+$450.00)',
        detail: 'Extra 12/2 Romex & Pantry GFCI itemized',
        table: 'quote_line_items',
      },
      {
        id: 'co-p2',
        pillar: 'Jobs',
        title: 'Recalculate Quote Total ($2,800 → $3,250)',
        detail: 'Tax & deposit amounts auto-rebalanced',
        table: 'jobs.quoted_amount',
      },
      {
        id: 'co-p3',
        pillar: 'Leads',
        title: 'Stage Client Approval SMS Link',
        detail: 'Ready to send 1-tap authorization to Dave Miller',
        table: 'client_notifications',
      },
    ],
    jobRecord: {
      jobNumber: 'J-104',
      clientName: 'Miller Residence',
      address: '124 Main St, Royal Oak, MI',
      status: 'Quote Sent to Client',
      statusColor: '#10b981',
      badgeText: '1-Tap Quote Delivery Sent',
      previousAmount: '$2,800.00',
      totalAmount: '$3,250.00',
      lineItems: [
        { label: 'Kitchen Subpanel & Circuit Setup', amount: '$2,800.00' },
        { label: 'Extra 12/2 Romex & Pantry GFCI (via SMS)', amount: '$450.00', isNew: true },
      ],
    },
  },
  {
    id: 'voice-memo',
    tabLabel: 'Voice Memo MMS (Noise Filtered)',
    shortChip: 'Voice Memo: Rough Inspection Passed',
    icon: '🎙️',
    title: 'Log Audio Memos & Progress Notes',
    badge: 'MMS Multimodal Audio AI',
    badgeType: 'voice',
    description:
      'Send a quick 10-second voice memo while driving. Your AI Copilot transcribes the audio, extracts milestone updates, and attaches the recording to the job feed.',
    contractorSender: 'You (Voice Memo MMS)',
    contractorInputType: 'voice',
    voiceAudioDuration: '0:09',
    voiceTranscript:
      '“Rough-in plumbing inspected and passed on Elm St. Waiting on drywall crew Thursday 8 AM.”',
    aiResponse:
      '🎙️ Logged Voice Memo to Job J-108 (Wilson - 428 Elm). Milestone: Rough Inspection Passed. Next task queued: Drywall crew on-site Thursday 8:00 AM.',
    pillars: [
      {
        id: 'vm-p1',
        pillar: 'Jobs',
        title: 'Milestone: Rough Inspection Passed',
        detail: 'Logged timestamped inspection clearance to activity feed',
        table: 'job_activity_feed',
      },
      {
        id: 'vm-p2',
        pillar: 'Schedule',
        title: 'Reserve Window: Thursday 8:00 AM',
        detail: 'Drywall & insulation logistics window blocked',
        table: 'schedule_occurrences',
      },
      {
        id: 'vm-p3',
        pillar: 'Crew',
        title: 'Assign Crew: Mike T. (Van #2)',
        detail: 'Drywall hanging task pushed to crew mobile feed',
        table: 'crew_assignments',
      },
    ],
    jobRecord: {
      jobNumber: 'J-108',
      clientName: 'Wilson Kitchen Remodel',
      address: '428 Elm St, Birmingham, MI',
      status: 'Rough Inspection Passed',
      statusColor: '#3b82f6',
      badgeText: 'Voice Memo Transcribed',
      voiceFeed: {
        duration: '0:09 MMS Audio',
        transcript:
          '“Rough-in plumbing inspected and passed on Elm St. Waiting on drywall crew Thursday 8 AM.”',
        timestamp: 'Today at 3:14 PM · Alert Phone (248) 555-0199',
      },
      tasks: [{ text: 'Drywall crew arrives Thursday 8:00 AM', done: false }],
    },
  },
  {
    id: 'bilingual-spanish',
    tabLabel: 'Bilingual Spanish Voice',
    shortChip: 'Spanish Voice Memo to English File',
    icon: '🌐',
    title: 'Spanish Voice Memo to English Job File',
    badge: 'Real-Time Spanish AI Audio Translation',
    badgeType: 'voice',
    description:
      'Crew members send voice memos in Spanish. Your AI Copilot transcribes, translates to clean English on the job record, and replies in Spanish with an instant SMS confirmation.',
    contractorSender: 'Carlos (Crew Van #3)',
    contractorInputType: 'voice',
    voiceAudioDuration: '0:11',
    voiceLanguage: 'es-US',
    voiceTranscript:
      '“Inspección aprobada en 124 Main. Necesitamos instaladores de paneles de yeso el jueves a las 8am. Faltan 2 cajas de tornillos.”',
    aiResponse:
      '🌐 [Auto-Translated from Spanish] Logged to Job J-104 (Miller - 124 Main):\n• Milestone: Rough Inspection Passed\n• Supply Note: 2 boxes drywall screws added\n• Queued task: Drywall hanging Thursday 8:00 AM.\n\nSMS reply sent to Carlos: "✓ Inspección registrada y materiales agregados."',
    pillars: [
      {
        id: 'sp-p1',
        pillar: 'Jobs',
        title: 'Milestone & Materials: Rough Inspection Passed',
        detail: 'Logged English audit note + 2 boxes drywall screws to feed',
        table: 'job_activity_feed',
      },
      {
        id: 'sp-p2',
        pillar: 'Schedule',
        title: 'Reserve Window: Thursday 8:00 AM',
        detail: 'Drywall crew logistics window blocked',
        table: 'schedule_occurrences',
      },
      {
        id: 'sp-p3',
        pillar: 'Crew',
        title: 'Spanish SMS Confirmation Receipt to Carlos',
        detail: 'Replying in native language: "✓ Inspección registrada"',
        table: 'crew_notifications',
      },
    ],
    jobRecord: {
      jobNumber: 'J-104',
      clientName: 'Miller Residence',
      address: '124 Main St, Royal Oak, MI',
      status: 'Rough Inspection Passed',
      statusColor: '#10b981',
      badgeText: 'Spanish Audio → English Ledger',
      voiceFeed: {
        duration: '0:11 Spanish MMS Audio',
        transcript:
          '“Inspección aprobada en 124 Main. Necesitamos instaladores de paneles de yeso el jueves a las 8am. Faltan 2 cajas de tornillos.”',
        timestamp: 'Today at 4:02 PM · Crew Phone (Carlos)',
      },
      tasks: [
        { text: 'Drywall hanging crew arrival Thursday 8:00 AM', done: false },
        { text: 'Supply run: Pick up 2 boxes drywall screws', done: false },
      ],
    },
  },
  {
    id: 'receipt-ocr',
    tabLabel: 'Receipt OCR & Auto-Margin',
    shortChip: 'Home Depot Receipt Photo OCR',
    icon: '🧾',
    title: 'Text Receipt Photos & Track Margin',
    badge: 'MMS Vision OCR & Auto-Margin',
    badgeType: 'quote',
    description:
      'Snap a picture of your Home Depot or supply receipt at the register. AI Copilot OCR extracts every item, matches the active job, and updates your real-time profit margin.',
    contractorSender: 'You (Receipt Photo MMS)',
    contractorInputType: 'receipt',
    contractorText: 'Home Depot receipt for Miller - 124 Main',
    receiptDetails: {
      vendor: 'THE HOME DEPOT #2741',
      date: 'Today · 2:45 PM',
      items: [
        { name: '3/4" x 100ft Blue PEX-A Tubing', price: '$84.90', allocatedJob: 'Miller (J-104)' },
        { name: 'SharkBite 3/4" Brass Tee (x4)', price: '$43.60', allocatedJob: 'Miller (J-104)' },
        { name: 'Oatey Pipe Clamps & Fasteners', price: '$11.20', allocatedJob: 'Smith (J-88)' },
      ],
      subtotal: '$139.70',
      tax: '$8.80',
      total: '$148.50',
    },
    aiResponse:
      '🧾 Logged $148.50 Home Depot receipt (3/4in PEX & SharkBite fittings) to Job J-104 (Miller).\nJob Material Costs: $620.00 | Total Quote: $3,250.00\nGross Profit: $2,630.00 (80.9% Margin).',
    pillars: [
      {
        id: 'rc-p1',
        pillar: 'Jobs',
        title: 'Add Job Material Expense ($148.50)',
        detail: 'Itemized 3/4" PEX & SharkBite fittings OCR extraction',
        table: 'quote_line_items',
      },
      {
        id: 'rc-p2',
        pillar: 'Jobs',
        title: 'Recalculate Real-Time Gross Margin (80.9%)',
        detail: 'Profit: $2,630.00 on $3,250.00 revenue',
        table: 'jobs.profit_margin',
      },
      {
        id: 'rc-p3',
        pillar: 'Schedule',
        title: 'Timestamp OCR Receipt at Royal Oak Site',
        detail: 'Attached verified photo proof to job folder',
        table: 'receipt_logs',
      },
    ],
    jobRecord: {
      jobNumber: 'J-104',
      clientName: 'Miller Residence',
      address: '124 Main St, Royal Oak, MI',
      status: 'Cost Tracked (80.9% Margin)',
      statusColor: '#10b981',
      badgeText: 'Receipt OCR Logged via MMS',
      costsSummary: {
        totalRevenue: '$3,250.00',
        totalCosts: '$620.00',
        grossProfit: '$2,630.00',
        marginPercent: 80.9,
        items: [
          { label: 'Home Depot: 3/4" PEX & SharkBite Fittings', amount: '$148.50', isNew: true, vendor: 'Home Depot' },
          { label: 'Electrical Subpanel & Romex 12/2', amount: '$471.50', vendor: 'City Electric' },
        ],
      },
    },
  },
  {
    id: 'punch-list',
    tabLabel: 'Punch List & Tasks',
    shortChip: '3-Item Punch List to Crew',
    icon: '📋',
    title: 'Dictate Crew Checklist Tasks',
    badge: 'Auto-Task Extraction',
    badgeType: 'task',
    description:
      'Walk the job site and text to-do items. Your AI Copilot breaks down multi-item punch lists into discrete tasks assigned directly to your field crew.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText:
      'Add punch list to Johnson: 1) Caulk exterior siding trim 2) Replace hallway GFCI plate 3) Touch up baseboard paint',
    aiResponse:
      '✅ Added 3 tasks to Job J-92 (Johnson - 88 Birch Ln): 1) Caulk exterior trim 2) Replace GFCI plate 3) Touch up paint. Pushed to crew feed.',
    pillars: [
      {
        id: 'pl-p1',
        pillar: 'Crew',
        title: 'Task 1: Caulk Exterior Siding Trim',
        detail: 'Pushed to field crew app checklist with sign-off',
        table: 'crew_tasks',
      },
      {
        id: 'pl-p2',
        pillar: 'Crew',
        title: 'Task 2: Replace Hallway GFCI Plate',
        detail: 'Assigned to electrical trim punch list',
        table: 'crew_tasks',
      },
      {
        id: 'pl-p3',
        pillar: 'Crew',
        title: 'Task 3: Touch Up Baseboard Paint',
        detail: 'Assigned to paint crew finishing checklist',
        table: 'crew_tasks',
      },
      {
        id: 'pl-p4',
        pillar: 'Jobs',
        title: 'Append Walkthrough Note to Activity Feed',
        detail: 'Johnson final walkthrough milestone logged',
        table: 'job_activity_feed',
      },
    ],
    jobRecord: {
      jobNumber: 'J-92',
      clientName: 'Johnson Exterior & Trim',
      address: '88 Birch Ln, Troy, MI',
      status: 'Punch List Active',
      statusColor: '#f59e0b',
      badgeText: '3 Tasks Added via Text',
      tasks: [
        { text: 'Caulk exterior siding trim', done: false },
        { text: 'Replace hallway GFCI cover plate', done: false },
        { text: 'Touch up baseboard paint in hallway', done: false },
      ],
    },
  },
  {
    id: 'safety-handling',
    tabLabel: 'Ambiguity Guard (Zero-Guess)',
    shortChip: 'Safety Guard: Disambiguate Smith',
    icon: '🛡️',
    title: 'Zero Destructive Guesses Safety Invariant',
    badge: 'Disambiguation Safety',
    badgeType: 'safety',
    description:
      'If two active jobs share a name, your AI Copilot never guesses. It texts back clarifying options so you never accidentally modify or close the wrong job.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText: 'Mark Smith job complete',
    aiResponse:
      '⚠️ You have 2 active Smith jobs:\n1) Smith - 84 Pine St ($1,200)\n2) Smith - 19 Oak Ave ($4,800)\nReply 1 or 2 to confirm completion.',
    followUpText: '1',
    aiFollowUpResponse:
      '✅ Marked Job J-84 (Smith - 84 Pine St) as COMPLETED. Final invoice draft ($1,200.00) ready for one-tap review.',
    pillars: [
      {
        id: 'sh-p1',
        pillar: 'Jobs',
        title: 'Disambiguate Smith (84 Pine vs 19 Oak)',
        detail: 'Matched exact project context before executing mutation',
        table: 'safety_guard',
      },
      {
        id: 'sh-p2',
        pillar: 'Jobs',
        title: 'Mark Job J-84 Status: COMPLETED',
        detail: 'Milestone updated and closed on schedule board',
        table: 'jobs.status',
      },
      {
        id: 'sh-p3',
        pillar: 'Jobs',
        title: 'Draft Final Invoice ($1,200.00)',
        detail: 'Payment link generated for instant client collection',
        table: 'invoices',
      },
    ],
    jobRecord: {
      jobNumber: 'J-84',
      clientName: 'Smith Siding Repair',
      address: '84 Pine St, Ferndale, MI',
      status: 'Completed (Ready to Invoice)',
      statusColor: '#10b981',
      badgeText: 'Safe Disambiguation Verified',
      safetyNotice: 'AI Copilot resolved target job via prompt disambiguation before status mutation.',
      totalAmount: '$1,200.00',
    },
  },
  {
    id: 'quick-lead',
    tabLabel: 'Quick Lead on the Fly',
    shortChip: 'New Lead: Dave Miller Roof Leak',
    icon: '🚀',
    title: 'Capture Leads While Driving',
    badge: 'Instant Lead Creation',
    badgeType: 'lead',
    description:
      'Got a quick referral or saw a neighbor while packing up? Text their name, number, and note. Your AI Copilot creates the lead and stages the estimate.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText:
      'New lead: Dave Miller, 248-555-0812, master bedroom roof leak around chimney, needs estimate Tuesday morning',
    aiResponse:
      '🚀 Created New Lead J-112: Dave Miller (248-555-0812). Chimney flashing / roof leak. Scheduled for Tuesday 9:30 AM estimate.',
    pillars: [
      {
        id: 'ql-p1',
        pillar: 'Leads',
        title: 'Create Staged Lead: Dave Miller',
        detail: 'Phone: (248) 555-0812 · Chimney Flashing / Roof Leak',
        table: 'leads',
      },
      {
        id: 'ql-p2',
        pillar: 'Leads',
        title: 'Triage Urgency: High Priority Water Leak',
        detail: 'Tagged emergency repair window',
        table: 'lead_tags',
      },
      {
        id: 'ql-p3',
        pillar: 'Schedule',
        title: 'Stage 30-min Estimate Window: Tuesday 9:30 AM',
        detail: 'Placed on Royal Oak East route cluster',
        table: 'calendar_slots',
      },
    ],
    jobRecord: {
      jobNumber: 'J-112',
      clientName: 'Dave Miller (New Lead)',
      address: 'Assigned from Phone Area Code · Royal Oak',
      status: 'Estimate Scheduled',
      statusColor: '#8b5cf6',
      badgeText: 'Lead Created via SMS',
      leadDetails: {
        phone: '(248) 555-0812',
        service: 'Roof Leak Inspection (Chimney Flashing)',
        requestedDate: 'Tuesday, 9:30 AM',
        score: 'High Priority · Urgent Water Leak',
      },
    },
  },
];

export default function TextToRecordSimulator() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('change-order');
  const [perspective, setPerspective] = useState<'contractor' | 'homeowner'>('contractor');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(9);
  const [disabledItemIds, setDisabledItemIds] = useState<Record<string, boolean>>({});
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [homeownerApproved, setHomeownerApproved] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Record<number, boolean>>({});

  const scenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  // Stop speech playback on tab switch
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingVoice(false);
    setVoiceSeconds(9);
    setHomeownerApproved(false);
    setCompletedTasks({});
  }, [activeScenarioId]);

  function toggleVoicePlayback() {
    if (isPlayingVoice) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingVoice(false);
      return;
    }

    setIsPlayingVoice(true);
    const initialSecs = scenario.id === 'bilingual-spanish' ? 11 : 9;
    setVoiceSeconds(initialSecs);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToSpeak =
        scenario.id === 'bilingual-spanish'
          ? 'Inspección aprobada en 124 Main. Necesitamos instaladores de paneles de yeso el jueves a las 8am.'
          : 'Rough-in plumbing inspected and passed on Elm Street. Waiting on drywall crew Thursday 8 AM.';
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      if (scenario.id === 'bilingual-spanish') {
        utterance.lang = 'es-US';
      }
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      utterance.onend = () => {
        setIsPlayingVoice(false);
      };
      utterance.onerror = () => {
        setIsPlayingVoice(false);
      };
      window.speechSynthesis.speak(utterance);
    }
  }

  // Live Browser Web Speech Recognition
  function toggleLiveMic() {
    if (typeof window === 'undefined') return;

    const win = window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onstart: () => void;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onstart: () => void;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
    };

    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      alert(
        'Speech recognition is active in Chrome, Safari, and Edge. Try speaking: "Add $450 to Miller job for extra romex line".'
      );
      return;
    }

    if (isRecordingLive) {
      setIsRecordingLive(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecordingLive(true);
        setLiveTranscript('Listening to your voice...');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || '')
          .join('');
        setLiveTranscript(`“${transcript}”`);
      };

      recognition.onend = () => {
        setIsRecordingLive(false);
      };

      recognition.onerror = () => {
        setIsRecordingLive(false);
      };

      recognition.start();
    } catch {
      setIsRecordingLive(false);
    }
  }

  function togglePillarItem(id: string) {
    setDisabledItemIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function toggleTaskComplete(idx: number) {
    setCompletedTasks((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  }

  const activePillarCount = scenario.pillars.filter((p) => !disabledItemIds[p.id]).length;

  return (
    <div className={styles.simulatorWrapper}>
      {/* Perspective & Control Bar */}
      <div className={styles.perspectiveBar}>
        <div className={styles.perspectiveLabelGroup}>
          <span className={styles.livePulseDot}></span>
          <span className={styles.perspectiveLabel}>Live Field Simulator</span>
          <span className={styles.carrierVerifiedBadge}>10DLC Carrier-Verified</span>
        </div>
        <div className={styles.perspectiveToggleGroup}>
          <button
            type="button"
            onClick={() => setPerspective('contractor')}
            className={`${styles.perspectiveBtn} ${
              perspective === 'contractor' ? styles.perspectiveBtnActive : ''
            }`}
          >
            📱 Contractor View (SMS to Copilot)
          </button>
          <button
            type="button"
            onClick={() => setPerspective('homeowner')}
            className={`${styles.perspectiveBtn} ${
              perspective === 'homeowner' ? styles.perspectiveBtnActive : ''
            }`}
          >
            👤 Homeowner View (Dave Miller)
          </button>
        </div>
      </div>

      {/* Scenario Tabs Container */}
      <div className={styles.tabBarContainer}>
        <div className={styles.tabBarHeader}>
          <span className={styles.tabBarLabel}>Select Real Field Scenario:</span>
          <span className={styles.tabSubhint}>Instant mutation without opening an app</span>
        </div>
        <div className={styles.tabBar}>
          {SCENARIOS.map((sc) => {
            const isActive = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                className={`${styles.tabBtn} ${isActive ? styles.tabActive : ''}`}
                onClick={() => setActiveScenarioId(sc.id)}
              >
                <span className={styles.tabIconWrapper}>{sc.icon}</span>
                <span>{sc.tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dual Workspace Frame */}
      <div className={styles.workspaceFrame}>
        {/* Left Column: Phone / SMS Interface */}
        <div className={styles.phoneColumn}>
          <div className={styles.phoneDevice}>
            {/* Phone Top Notch / Status Bar */}
            <div className={styles.phoneTopBar}>
              <span className={styles.phoneTime}>9:41</span>
              <div
                className={`${styles.phoneIsland} ${
                  isPlayingVoice || isRecordingLive ? styles.phoneIslandActive : ''
                }`}
              >
                {isPlayingVoice && (
                  <span className={styles.islandEq}>
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                )}
                {isRecordingLive && <span className={styles.islandRecDot}></span>}
              </div>
              <div className={styles.phoneSignals}>
                <span>5G</span>
                <span className={styles.signalIcon}>●●●●</span>
              </div>
            </div>

            {/* Recipient Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatAvatar}>
                {perspective === 'contractor' ? '⚡' : '🔨'}
              </div>
              <div className={styles.chatInfo}>
                <div className={styles.chatTitle}>
                  {perspective === 'contractor'
                    ? 'AI Copilot ⚡ · 24/7 Sidekick'
                    : 'Apex Electric & Plumbing'}
                </div>
                <div className={styles.chatSub}>
                  {perspective === 'contractor'
                    ? '(248) 555-0199 · Active Verified Line'
                    : 'Dave Miller (Homeowner)'}
                </div>
              </div>
              <div className={styles.headerIndicator}>
                <span className={styles.onlineDot}></span>
                <span className={styles.onlineText}>Online</span>
              </div>
            </div>

            {/* Chat Messages Stream */}
            <div className={styles.chatBody}>
              <div className={styles.chatDate}>Today · 3:14 PM</div>
              {perspective === 'homeowner' ? (
                /* Homeowner Perspective View */
                <div className={styles.bubbleHomeowner}>
                  <div className={styles.homeownerHeaderTag}>
                    <span>Apex Electric &middot; Change Order Notice</span>
                    <span className={styles.homeownerPill}>1-Tap Link</span>
                  </div>
                  <p className={styles.homeownerMessage}>
                    {scenario.homeownerSms?.messageText ||
                      'Hi Dave, Apex Electric added Change Order #1 ($450.00 for pantry 12/2 Romex line & GFCI outlet). Tap below to authorize:'}
                  </p>

                  <div className={styles.homeownerActionBox}>
                    <div className={styles.homeownerPriceRow}>
                      <span>Change Order Authorization:</span>
                      <strong className={styles.homeownerAmount}>
                        {scenario.homeownerSms?.approvalAmount || '$450.00'}
                      </strong>
                    </div>

                    <button
                      type="button"
                      onClick={() => setHomeownerApproved(true)}
                      className={`${styles.applePayBtn} ${
                        homeownerApproved ? styles.applePayBtnApproved : ''
                      }`}
                    >
                      {homeownerApproved
                        ? '✓ Authorized & Paid via Apple Pay'
                        : 'Pay 1-Tap Authorize & Pay Deposit'}
                    </button>
                  </div>

                  {homeownerApproved && (
                    <div className={styles.homeownerSuccessAlert}>
                      ⚡ Instant confirmation alert sent to contractor truck steering wheel!
                    </div>
                  )}
                </div>
              ) : (
                /* Contractor Perspective View */
                <>
                  {/* Scenario: Voice Playback */}
                  {scenario.contractorInputType === 'voice' && (
                    <div className={styles.contractorBubble}>
                      <div className={styles.senderTag}>{scenario.contractorSender}</div>
                      <div className={styles.voicePlayer}>
                        <button
                          type="button"
                          onClick={toggleVoicePlayback}
                          className={`${styles.voicePlayBtn} ${
                            isPlayingVoice ? styles.voicePlaying : ''
                          }`}
                          aria-label="Play Voice Memo"
                        >
                          {isPlayingVoice ? '⏸' : '▶'}
                        </button>
                        <div className={styles.waveformBars}>
                          <span style={{ height: '45%' }}></span>
                          <span style={{ height: '75%' }}></span>
                          <span style={{ height: '100%' }}></span>
                          <span style={{ height: '65%' }}></span>
                          <span style={{ height: '90%' }}></span>
                          <span style={{ height: '40%' }}></span>
                          <span style={{ height: '95%' }}></span>
                          <span style={{ height: '55%' }}></span>
                        </div>
                        <span className={styles.voiceDuration}>
                          {isPlayingVoice ? `0:0${voiceSeconds}` : scenario.voiceAudioDuration}
                        </span>
                      </div>

                      {/* Noise Filter EQ Visualizer */}
                      <div className={styles.noiseFilterBox}>
                        <div className={styles.noiseFilterTitle}>
                          <span>🔇 Gemini Noise Filter</span>
                          <span>{isPlayingVoice ? 'Filter: ACTIVE' : 'Floor: -42dB'}</span>
                        </div>
                        <div className={styles.noiseEqTrack}>
                          <div
                            className={styles.noiseBarClean}
                            style={{ height: isPlayingVoice ? '80%' : '35%' }}
                          />
                          <div
                            className={styles.noiseBarClean}
                            style={{ height: isPlayingVoice ? '95%' : '45%' }}
                          />
                          <div
                            className={styles.noiseBarRaw}
                            style={{ height: isPlayingVoice ? '15%' : '70%' }}
                            title="Filtered Diesel Engine Idle"
                          />
                          <div
                            className={styles.noiseBarClean}
                            style={{ height: isPlayingVoice ? '85%' : '40%' }}
                          />
                          <div
                            className={styles.noiseBarRaw}
                            style={{ height: isPlayingVoice ? '10%' : '60%' }}
                            title="Filtered Highway Wind"
                          />
                        </div>
                      </div>

                      <small className={styles.audioHint}>
                        {isPlayingVoice
                          ? '🔊 Playing voice note transcript...'
                          : 'Tap ▶ to hear voice memo'}
                      </small>
                    </div>
                  )}

                  {/* Scenario: Receipt OCR Attachment with Multi-Job Split */}
                  {scenario.contractorInputType === 'receipt' && scenario.receiptDetails && (
                    <div className={styles.contractorBubble}>
                      <div className={styles.senderTag}>You (Receipt MMS Photo)</div>
                      <div className={styles.receiptCard}>
                        <div className={styles.receiptBanner}>
                          <strong>{scenario.receiptDetails.vendor}</strong>
                          <span className={styles.receiptDate}>
                            {scenario.receiptDetails.date}
                          </span>
                        </div>
                        <div className={styles.receiptItemsList}>
                          {scenario.receiptDetails.items.map((item, idx) => (
                            <div key={idx} className={styles.receiptRow}>
                              <span>
                                {item.name}
                                {item.allocatedJob?.includes('Miller') && (
                                  <span className={styles.splitTagMiller}>Job: Miller</span>
                                )}
                                {item.allocatedJob?.includes('Smith') && (
                                  <span className={styles.splitTagSmith}>Job: Smith</span>
                                )}
                              </span>
                              <strong>{item.price}</strong>
                            </div>
                          ))}
                        </div>
                        <div className={styles.receiptTotalRow}>
                          <span>TOTAL</span>
                          <span>{scenario.receiptDetails.total}</span>
                        </div>
                      </div>
                      <p className={styles.bubbleCaption}>{scenario.contractorText}</p>
                    </div>
                  )}

                  {/* Scenario: Standard Contractor SMS */}
                  {scenario.contractorInputType === 'text' && scenario.contractorText && (
                    <div className={styles.contractorBubble}>
                      <div className={styles.senderTag}>{scenario.contractorSender}</div>
                      <p className={styles.bubbleText}>{scenario.contractorText}</p>
                    </div>
                  )}

                  {/* AI Platform Response */}
                  <div className={styles.aiBubble}>
                    <div className={styles.aiSenderTag}>
                      <span className={styles.aiGlowDot}></span>
                      AI Copilot (1.2s instant mutation)
                    </div>
                    <p className={styles.aiResponseText}>{scenario.aiResponse}</p>
                  </div>

                  {/* Optional Interactive Follow-up */}
                  {scenario.followUpText && scenario.aiFollowUpResponse && (
                    <>
                      <div className={styles.contractorBubble}>
                        <div className={styles.senderTag}>{scenario.contractorSender}</div>
                        <p className={styles.bubbleText}>{scenario.followUpText}</p>
                      </div>
                      <div className={styles.aiBubble}>
                        <div className={styles.aiSenderTag}>
                          <span className={styles.aiGlowDot}></span>
                          AI Copilot (0.9s)
                        </div>
                        <p className={styles.aiResponseText}>
                          {scenario.aiFollowUpResponse}
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Quick Action Test Chips */}
            <div className={styles.quickPromptChips}>
              <span className={styles.quickPromptLabel}>Try preset:</span>
              <button
                type="button"
                className={styles.quickChip}
                onClick={() => setActiveScenarioId('change-order')}
              >
                +$450 Romex
              </button>
              <button
                type="button"
                className={styles.quickChip}
                onClick={() => setActiveScenarioId('voice-memo')}
              >
                🎙️ Rough Passed
              </button>
              <button
                type="button"
                className={styles.quickChip}
                onClick={() => setActiveScenarioId('receipt-ocr')}
              >
                🧾 Home Depot
              </button>
              <button
                type="button"
                className={styles.quickChip}
                onClick={() => setActiveScenarioId('safety-handling')}
              >
                🛡️ Smith
              </button>
            </div>

            {/* Phone Input Bar with Real Mic Recording */}
            <div className={styles.chatInputBar}>
              <span className={styles.attachBtn} title="Attach site photo or receipt">
                📷
              </span>
              <button
                type="button"
                onClick={toggleLiveMic}
                className={`${styles.micBtn} ${
                  isRecordingLive ? styles.micBtnActive : ''
                }`}
                title="Tap to speak live with your microphone"
              >
                🎙️
              </button>
              <div className={styles.inputMock}>
                {isRecordingLive
                  ? '🔴 Listening to voice...'
                  : liveTranscript || 'Text or tap 🎙️ to dictate...'}
              </div>
              <span className={styles.sendMock}>↑</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Job Record Card & 4-Pillar Checklist */}
        <div className={styles.recordColumn}>
          <div className={styles.recordCard}>
            <div className={styles.recordHeader}>
              <div className={styles.recordMain}>
                <div className={styles.jobIdRow}>
                  <span className={styles.jobIdTag}>{scenario.jobRecord.jobNumber}</span>
                  <span className={styles.cloudSyncPill}>⚡ Live Sync Active</span>
                </div>
                <h4 className={styles.recordTitle}>{scenario.jobRecord.clientName}</h4>
                <span className={styles.recordAddress}>{scenario.jobRecord.address}</span>
              </div>
              <div
                className={styles.recordStatusBadge}
                style={{ color: scenario.jobRecord.statusColor }}
              >
                <span
                  className={styles.statusDot}
                  style={{ background: scenario.jobRecord.statusColor }}
                ></span>
                {scenario.jobRecord.status}
              </div>
            </div>

            <div className={styles.liveActivityBadge}>
              <span className={styles.pulseDot}></span>
              <span>{scenario.jobRecord.badgeText}</span>
            </div>

            {/* Interactive 4-Pillar Extraction Checklist */}
            {scenario.pillars && scenario.pillars.length > 0 && (
              <div className={styles.pillarChecklistSection}>
                <div className={styles.pillarChecklistHeader}>
                  <span className={styles.pillarChecklistTitle}>
                    ⚡ 4-Pillar Database Sync
                  </span>
                  <span className={styles.pillarChecklistCounter}>
                    ✓ {activePillarCount} of {scenario.pillars.length} syncing in real-time
                  </span>
                </div>

                <div className={styles.pillarList}>
                  {scenario.pillars.map((p) => {
                    const isExcluded = Boolean(disabledItemIds[p.id]);
                    return (
                      <div
                        key={p.id}
                        onClick={() => togglePillarItem(p.id)}
                        className={`${styles.pillarRow} ${
                          isExcluded ? styles.pillarRowDisabled : ''
                        }`}
                        title="Click to toggle sync for this table"
                      >
                        <div
                          className={`${styles.pillarCheckbox} ${
                            isExcluded ? styles.pillarCheckboxUnchecked : ''
                          }`}
                        >
                          {!isExcluded ? '✓' : ''}
                        </div>
                        <div className={styles.pillarContent}>
                          <div className={styles.pillarItemHead}>
                            <span className={styles.pillarItemTitle}>
                              [{p.pillar}] {p.title}
                            </span>
                            <span className={styles.pillarTargetBadge}>{p.table}</span>
                          </div>
                          <span className={styles.pillarItemDetail}>{p.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Line Items & Total Math (for Quote changes) */}
            {scenario.jobRecord.lineItems && (
              <div className={styles.lineItemsSection}>
                <div className={styles.sectionHeading}>Itemized Scope & Math</div>
                <div className={styles.lineItemsList}>
                  {scenario.jobRecord.lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`${styles.lineItemRow} ${
                        item.isNew ? styles.newItemGlow : ''
                      }`}
                    >
                      <span className={styles.itemLabel}>
                        {item.isNew && <span className={styles.newTag}>+ NEW LINE ITEM</span>}
                        {item.label}
                      </span>
                      <span className={styles.itemAmount}>{item.amount}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.totalRow}>
                  <div className={styles.totalLabel}>
                    <span>Updated Total</span>
                    {scenario.jobRecord.previousAmount && (
                      <span className={styles.prevAmount}>
                        Was {scenario.jobRecord.previousAmount}
                      </span>
                    )}
                  </div>
                  <div className={styles.totalVal}>{scenario.jobRecord.totalAmount}</div>
                </div>
              </div>
            )}

            {/* Real-time Material Costs & Gross Margin Tracker */}
            {scenario.jobRecord.costsSummary && (
              <div className={styles.costsSection}>
                <div className={styles.sectionHeading}>
                  Job Material Expenses & Margin
                </div>
                <div className={styles.lineItemsList}>
                  {scenario.jobRecord.costsSummary.items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`${styles.lineItemRow} ${
                        item.isNew ? styles.newItemGlow : ''
                      }`}
                    >
                      <span className={styles.itemLabel}>
                        {item.isNew && <span className={styles.newTag}>+ NEW OCR</span>}
                        {item.label}
                      </span>
                      <span className={styles.itemAmount}>{item.amount}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.marginCard}>
                  <div className={styles.marginHeader}>
                    <span>Real-Time Gross Margin</span>
                    <span className={styles.marginValue}>
                      {scenario.jobRecord.costsSummary.marginPercent}%
                    </span>
                  </div>
                  <div className={styles.marginTrack}>
                    <div
                      className={styles.marginFill}
                      style={{
                        width: `${scenario.jobRecord.costsSummary.marginPercent}%`,
                      }}
                    />
                  </div>
                  <div className={styles.marginSub}>
                    <span>Rev: {scenario.jobRecord.costsSummary.totalRevenue}</span>
                    <span>Costs: {scenario.jobRecord.costsSummary.totalCosts}</span>
                    <span className={styles.profitHighlight}>
                      Profit: {scenario.jobRecord.costsSummary.grossProfit}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Voice Memo Activity Feed */}
            {scenario.jobRecord.voiceFeed && (
              <div className={styles.voiceFeedSection}>
                <div className={styles.sectionHeading}>
                  Job Activity Feed (Audit Log)
                </div>
                <div className={styles.feedCard}>
                  <div className={styles.feedHead}>
                    <span className={styles.audioBadge}>
                      🎙️ {scenario.jobRecord.voiceFeed.duration}
                    </span>
                    <span className={styles.feedTime}>
                      {scenario.jobRecord.voiceFeed.timestamp}
                    </span>
                  </div>
                  <p className={styles.feedTranscript}>
                    {scenario.jobRecord.voiceFeed.transcript}
                  </p>
                </div>
              </div>
            )}

            {/* Tasks / Punch List */}
            {scenario.jobRecord.tasks && (
              <div className={styles.tasksSection}>
                <div className={styles.sectionHeading}>
                  Punch List & Tasks (Interactive)
                </div>
                <ul className={styles.tasksList}>
                  {scenario.jobRecord.tasks.map((task, idx) => {
                    const isDone = Boolean(completedTasks[idx] ?? task.done);
                    return (
                      <li
                        key={idx}
                        className={`${styles.taskItem} ${
                          isDone ? styles.taskItemDone : ''
                        }`}
                        onClick={() => toggleTaskComplete(idx)}
                      >
                        <span
                          className={`${styles.checkboxMock} ${
                            isDone ? styles.checkboxMockDone : ''
                          }`}
                        >
                          {isDone ? '✓' : ''}
                        </span>
                        <span className={styles.taskText}>{task.text}</span>
                        {isDone && <span className={styles.taskDoneTag}>Done</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Lead Details */}
            {scenario.jobRecord.leadDetails && (
              <div className={styles.leadSection}>
                <div className={styles.sectionHeading}>Extracted Lead Metadata</div>
                <div className={styles.leadGrid}>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Phone</span>
                    <span className={styles.leadFactVal}>
                      {scenario.jobRecord.leadDetails.phone}
                    </span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Service</span>
                    <span className={styles.leadFactVal}>
                      {scenario.jobRecord.leadDetails.service}
                    </span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Requested Time</span>
                    <span className={styles.leadFactVal}>
                      {scenario.jobRecord.leadDetails.requestedDate}
                    </span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Priority Triage</span>
                    <span className={styles.leadFactValHot}>
                      {scenario.jobRecord.leadDetails.score}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Safety Notice */}
            {scenario.jobRecord.safetyNotice && (
              <div className={styles.safetyNoticeBox}>
                <span className={styles.safetyIcon}>🛡️</span>
                <span className={styles.safetyText}>
                  {scenario.jobRecord.safetyNotice}
                </span>
              </div>
            )}

            {/* Action Bar */}
            <div className={styles.recordFooter}>
              <span className={styles.footerNote}>
                ⚡ Instant sync to Invoices, Client Portal & Crew
              </span>
              <Link href={APP_SIGNUP_URL} className={styles.recordActionBtn}>
                Try on your phone →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
