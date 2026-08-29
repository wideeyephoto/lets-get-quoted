'use client';

import { useState } from 'react';
import Link from 'next/link';
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
    matchedJobRef: 'J-104 (Miller)',
    extractedItems: [
      {
        id: 'item-1-1',
        pillar: 'jobs',
        title: 'Add Quote Change Order (+$450.00)',
        detail: 'Extra 3/4" PEX lines and rough-in fittings to Miller J-104',
        targetTable: 'quote_line_items',
        mutation: 'Quote Total: $3,250 → $3,700',
        enabled: true,
      },
      {
        id: 'item-1-2',
        pillar: 'jobs',
        title: 'Update Milestone: Rough Inspection Passed',
        detail: 'Logged timestamped inspection clearance to activity feed',
        targetTable: 'job_activity_feed',
        mutation: 'Status: In Progress → Rough Passed',
        enabled: true,
      },
      {
        id: 'item-1-3',
        pillar: 'schedule',
        title: 'Reserve Schedule Slot: Thursday 8:00 AM',
        detail: 'Drywall & insulation crew arrival window (East cluster)',
        targetTable: 'schedule_occurrences',
        mutation: 'Slot: Thu 8:00 AM - 12:00 PM',
        enabled: true,
      },
      {
        id: 'item-1-4',
        pillar: 'crew',
        title: 'Assign Crew: Mike T. (Van #2)',
        detail: 'Drywall hanging & rough patching assignment with push alert',
        targetTable: 'crew_assignments',
        mutation: 'Assigned: Mike T. (Lead Tech)',
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
        title: 'Create Staged Lead: Dave Miller',
        detail: 'Phone: (248) 555-0812 · Service: Oak Limb Removal',
        targetTable: 'leads',
        mutation: 'New Lead Created · Urgency: High',
        enabled: true,
      },
      {
        id: 'item-2-2',
        pillar: 'leads',
        title: 'Tag Hazard Severity: Emergency Priority',
        detail: 'Tree branch touching electrical service line',
        targetTable: 'lead_tags',
        mutation: 'Tag: Urgent / Safety Hazard',
        enabled: true,
      },
      {
        id: 'item-2-3',
        pillar: 'schedule',
        title: 'Block 30-min Estimate Window: Tuesday 9:30 AM',
        detail: 'Route clustered with Royal Oak morning route',
        targetTable: 'calendar_slots',
        mutation: 'Route Density: 94% Match',
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
    matchedJobRef: 'J-92 (Johnson)',
    extractedItems: [
      {
        id: 'item-3-1',
        pillar: 'crew',
        title: 'Mark Task Completed: Caulk Exterior Siding Trim',
        detail: 'Signed off by Carlos M. on site',
        targetTable: 'crew_tasks',
        mutation: 'Status: Completed',
        enabled: true,
      },
      {
        id: 'item-3-2',
        pillar: 'crew',
        title: 'Mark Task Completed: Paint Hallway Baseboards',
        detail: 'Signed off by Carlos M. on site',
        targetTable: 'crew_tasks',
        mutation: 'Status: Completed',
        enabled: true,
      },
      {
        id: 'item-3-3',
        pillar: 'jobs',
        title: 'Append Walkthrough Note to Activity Feed',
        detail: 'Ready for client final sign-off & invoice release',
        targetTable: 'job_activity_feed',
        mutation: 'Audit Note: 2 Punch Items Logged',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-4',
    sender: 'Crew Phone (Carlos M.)',
    type: 'receipt',
    time: 'Aug 26 · 11:30 AM',
    rawText:
      'Receipt photo attached: Home Depot #2704 ($184.20) for Romex wire and breaker boxes allocated to J-104 Miller.',
    confidence: 99.1,
    matchedJobRef: 'J-104 (Miller)',
    extractedItems: [
      {
        id: 'item-4-1',
        pillar: 'jobs',
        title: 'Log Material Expense: Home Depot #2704 ($184.20)',
        detail: 'OCR itemized 250ft 12/2 Romex + 2x 20A Square D Breakers',
        targetTable: 'costs',
        mutation: 'Job Costs: $820 → $1,004.20',
        enabled: true,
      },
      {
        id: 'item-4-2',
        pillar: 'jobs',
        title: 'Update Live Job Profit Margin',
        detail: 'Real-time gross margin recalculation on J-104',
        targetTable: 'jobs',
        mutation: 'Margin: 74.8% → 72.9%',
        enabled: true,
      },
    ],
  },
];

interface TextToJobWorkspaceProps {
  account: {
    business_name: string | null;
    company_name: string | null;
    alert_phone: string | null;
    phone: string | null;
    trade: string | null;
    call_tracking_number: string | null;
  } | null;
  crewMembers?: CrewRow[];
  activeJobCount: number;
  leadCount: number;
  crewCount: number;
}

export default function TextToJobWorkspace({
  account,
  crewMembers = [],
  activeJobCount,
  leadCount,
  crewCount,
}: TextToJobWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'senders' | 'photos' | 'simulator' | 'rules' | 'siri'>('feed');
  const [feedFilter, setFeedFilter] = useState<'all' | 'voice' | 'sms' | 'leads' | 'crew'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messages, setMessages] = useState<InboundMessage[]>(SAMPLE_INBOUND_MESSAGES);
  const [selectedMsgId, setSelectedMsgId] = useState<string>(SAMPLE_INBOUND_MESSAGES[0].id);
  const [notification, setNotification] = useState<string | null>(null);
  const [tosAcknowledged, setTosAcknowledged] = useState<boolean>(true);
  const [copiedNumber, setCopiedNumber] = useState<boolean>(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  // Simulator State
  const [simText, setSimText] = useState(
    'Replace 45/5 capacitor on Carrier AC for Smith. Added 2 lbs R-410A refrigerant. Quote $285 total invoice ready.'
  );

  const filteredMessages = messages.filter((m) => {
    // Category filter
    if (feedFilter === 'voice' && m.type !== 'voice') return false;
    if (feedFilter === 'sms' && m.type !== 'sms' && m.type !== 'receipt') return false;
    if (feedFilter === 'leads' && !m.extractedItems.some((i) => i.pillar === 'leads')) return false;
    if (feedFilter === 'crew' && !m.extractedItems.some((i) => i.pillar === 'crew')) return false;

    // Search query
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

  const fieldPhoneNumber =
    account?.call_tracking_number || account?.phone || '(248) 555-0199';
  const alertPhone = account?.alert_phone || '(248) 555-0123';
  const businessTitle = account?.business_name || account?.company_name || 'Your Company';

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
      `✓ Successfully applied ${enabledCount} checked items across the 4 pillars to ${selectedMessage.matchedJobRef || 'records'}.`
    );
    setTimeout(() => setNotification(null), 4000);
  }

  function handleCopyNumber() {
    navigator.clipboard.writeText(fieldPhoneNumber.replace(/[^\d+]/g, ''));
    setCopiedNumber(true);
    setNotification(`📋 Copied field hotline number (${fieldPhoneNumber}) to clipboard!`);
    setTimeout(() => {
      setCopiedNumber(false);
      setNotification(null);
    }, 3500);
  }

  function toggleAudio() {
    setIsPlayingAudio((prev) => !prev);
    if (!isPlayingAudio) {
      setNotification('▶ Playing audio transcript with noise-suppressed diesel filter...');
      setTimeout(() => {
        setIsPlayingAudio(false);
        setNotification(null);
      }, 5000);
    }
  }

  function handlePreset(preset: string) {
    setSimText(preset);
    setActiveTab('simulator');
    setNotification('⚡ Preset loaded into Simulator sandbox. Click "Run Simulator" to test!');
    setTimeout(() => setNotification(null), 3500);
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
          title: 'Create Staged Lead: Sarah Jenkins',
          detail: 'Phone: (248) 555-0991 · Service: Main Drain Backup',
          targetTable: 'leads',
          mutation: 'New Lead Created · Emergency Urgency',
          enabled: true,
        },
        {
          id: `sim-lead-2`,
          pillar: 'schedule',
          title: 'Emergency Priority Dispatch Slot',
          detail: 'Auto-clustered within 4.2 miles of Van #1',
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
          title: 'Add Change Order: 4 Sheets Plywood Rot Repair (+$550.00)',
          detail: 'CDX 1/2" exterior subdecking replacement and fasteners',
          targetTable: 'quote_line_items',
          mutation: 'Total: $8,400 → $8,950',
          enabled: true,
        },
        {
          id: `sim-roof-2`,
          pillar: 'jobs',
          title: 'Append Photo Proof to Job Activity Feed',
          detail: 'Timestamped sub-fascia water damage evidence filed',
          targetTable: 'job_activity_feed',
          mutation: 'Audit Trail: 1 Photo Attached',
          enabled: true,
        },
      ];
    } else if (isPunch) {
      matchedRef = 'Job J-94 (Smith Remodel)';
      newExtractedItems = [
        {
          id: `sim-punch-1`,
          pillar: 'crew',
          title: 'Mark Task Completed: Touch Up Kitchen Paint',
          detail: 'Carlos M. sign-off',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed',
          enabled: true,
        },
        {
          id: `sim-punch-2`,
          pillar: 'crew',
          title: 'Mark Task Completed: Fix Loose Door Latch',
          detail: 'Carlos M. sign-off',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed',
          enabled: true,
        },
        {
          id: `sim-punch-3`,
          pillar: 'jobs',
          title: 'Update Milestone: Final Walkthrough Ready',
          detail: 'Customer notification draft ready for release',
          targetTable: 'jobs',
          mutation: 'Stage: Walkthrough Ready',
          enabled: true,
        },
      ];
    } else {
      newExtractedItems = [
        {
          id: `sim-hvac-1`,
          pillar: 'jobs',
          title: 'Add HVAC Line Items ($285.00 Total)',
          detail: '45/5 Dual Capacitor + 2 lbs R-410A Refrigerant itemization',
          targetTable: 'quote_line_items',
          mutation: 'Draft Invoice Ready: $285.00',
          enabled: true,
        },
        {
          id: `sim-hvac-2`,
          pillar: 'jobs',
          title: 'Update Equipment Maintenance History',
          detail: 'Carrier Outdoor Unit Serial #CR-4409 logged',
          targetTable: 'job_activity_feed',
          mutation: 'Equipment Record Updated',
          enabled: true,
        },
        {
          id: `sim-hvac-3`,
          pillar: 'crew',
          title: 'Mark Work Completed & Sign Off',
          detail: 'Technician service ticket finalized',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed on Site',
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
    setActiveTab('feed');
    setNotification(`⚡ Simulated field command parsed into ${newExtractedItems.length} toggleable items!`);
    setTimeout(() => setNotification(null), 4000);
  }

  // Combined authorized senders list
  const defaultCrew: CrewRow[] = [
    {
      id: 'crew-1',
      name: 'Carlos Mendoza',
      phone: '(248) 555-0177',
      role_label: 'Lead Electrician',
      active: true,
    },
    {
      id: 'crew-2',
      name: 'Mike Trombley',
      phone: '(248) 555-0188',
      role_label: 'Drywall & Framing Tech',
      active: true,
    },
  ];

  const activeCrewList = crewMembers.length > 0 ? crewMembers : defaultCrew;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.badge}>✦ Sparky · Field Ingest &amp; Intelligence Engine</span>
          <h1 className={styles.title}>Text-to-Job Dashboard</h1>
          <p className={styles.subtitle}>
            Review SMS &amp; voice memos from the road, see how Sparky extracted entities across the
            4 pillars, and manage authorized phone numbers and accuracy terms.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={handleCopyNumber} className={styles.copyBtn}>
            {copiedNumber ? '✓ Copied Number' : `📋 Copy ${fieldPhoneNumber}`}
          </button>
          <a
            href={`data:text/vcard;charset=utf-8,${encodeURIComponent(
              `BEGIN:VCARD\nVERSION:3.0\nFN:${businessTitle} Field Hotline\nTEL;TYPE=CELL:${fieldPhoneNumber}\nNOTE:Text-to-Job Field Ingest Hotline\nEND:VCARD`
            )}`}
            download="field-hotline.vcf"
            className={styles.vcardBtn}
          >
            📱 Save Field Hotline (.vcf)
          </a>
        </div>
      </div>

      {/* AI Terms of Service & Accuracy Acknowledgment Banner */}
      <div className={styles.tosBanner}>
        <div className={styles.tosLeft}>
          <span className={styles.tosIcon}>⚖️</span>
          <div>
            <h4 className={styles.tosTitle}>AI Field Intake Terms of Service &amp; Accuracy Policy</h4>
            <p className={styles.tosText}>
              Text-to-Job uses Gemini Multimodal AI to transcribe audio and parse change orders with
              calibrated high confidence (&gt;99%). Because AI models may occasionally misinterpret audio
              or trade jargon, <strong>the contractor is responsible for verifying extracted quotes, change orders, and line items prior to client delivery and billing</strong>.
              All operations include a <strong>15-minute SMS rollback window (Reply UNDO)</strong> and zero destructive guesses.
            </p>
          </div>
        </div>
        <div className={styles.tosBtnGroup}>
          {tosAcknowledged ? (
            <span className={styles.tosBadgeApproved}>
              ✓ TOS &amp; Accuracy Policy Acknowledged
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTosAcknowledged(true);
                setNotification('✓ AI Field Intake Terms of Service acknowledged and saved.');
                setTimeout(() => setNotification(null), 3500);
              }}
              className={styles.tosAckBtn}
            >
              Acknowledge &amp; Enable
            </button>
          )}
        </div>
      </div>

      {/* Hotline & Telephony Guard Strip */}
      <div className={styles.hotlineStrip}>
        <div className={styles.hotlineCol}>
          <span className={styles.hotlineLabel}>Dedicated Platform Texting Number</span>
          <div className={styles.hotlineValue}>
            <span className={styles.hotlinePhoneHighlight}>{fieldPhoneNumber}</span>
            <span className={styles.liveDot} title="Online &amp; Ingress Active" />
          </div>
          <small className={styles.hotlineSub}>
            Text or call this number from any verified phone. Save as <em>&ldquo;{businessTitle} Sparky&rdquo;</em>.
          </small>
        </div>

        <div className={styles.hotlineCol}>
          <span className={styles.hotlineLabel}>Master Account Whitelist</span>
          <div className={styles.hotlineValue}>
            <span>{alertPhone}</span>
            <span className={styles.verifiedShield}>🛡️ Verified Owner</span>
          </div>
          <small className={styles.hotlineSub}>
            Primary phone number authenticated for quote modifications, approvals, and mutations.
          </small>
        </div>

        <div className={styles.hotlineCol}>
          <span className={styles.hotlineLabel}>Sparky AI Ingress Telephony</span>
          <div className={styles.hotlineValue}>
            <span className={styles.latencyBadge}>~1.4s Gemini Multimodal</span>
          </div>
          <small className={styles.hotlineSub}>
            10DLC carrier-verified transactional SMS &amp; MMS multimodal audio ingress.
          </small>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && <div className={styles.notificationToast}>{notification}</div>}

      {/* 4 Pillars Summary Grid */}
      <div className={styles.pillarsGrid}>
        <Link href="/dashboard/jobs" className={`${styles.pillarCard} ${styles.pillarJobs}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>📁</span>
            <span className={styles.pillarCount}>{activeJobCount} Active</span>
          </div>
          <h3 className={styles.pillarTitle}>
            1. Jobs &amp; Quotes <span>&rarr;</span>
          </h3>
          <p className={styles.pillarDesc}>
            Change orders, line items, deposits, and timeline milestones.
          </p>
          <div className={styles.pillarTarget}>
            <span>Mutates:</span> <code>jobs</code>, <code>quote_line_items</code>
          </div>
        </Link>

        <Link href="/dashboard/leads" className={`${styles.pillarCard} ${styles.pillarLeads}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>👤</span>
            <span className={styles.pillarCount}>{leadCount} Leads</span>
          </div>
          <h3 className={styles.pillarTitle}>
            2. Leads &amp; CRM <span>&rarr;</span>
          </h3>
          <p className={styles.pillarDesc}>
            Customer intake, urgency scoring, phone tags, and address lookup.
          </p>
          <div className={styles.pillarTarget}>
            <span>Mutates:</span> <code>leads</code>, <code>contacts</code>, <code>lead_tags</code>
          </div>
        </Link>

        <Link href="/dashboard/schedule" className={`${styles.pillarCard} ${styles.pillarSchedule}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>📅</span>
            <span className={styles.pillarCount}>Real-Time</span>
          </div>
          <h3 className={styles.pillarTitle}>
            3. Schedule &amp; Route <span>&rarr;</span>
          </h3>
          <p className={styles.pillarDesc}>
            Arrival windows, duration blocks, route density, and calendar slots.
          </p>
          <div className={styles.pillarTarget}>
            <span>Mutates:</span> <code>schedule_occurrences</code>, <code>calendar</code>
          </div>
        </Link>

        <Link href="/dashboard/crew" className={`${styles.pillarCard} ${styles.pillarCrew}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>👷</span>
            <span className={styles.pillarCount}>{crewCount} Techs</span>
          </div>
          <h3 className={styles.pillarTitle}>
            4. Crew &amp; Tasks <span>&rarr;</span>
          </h3>
          <p className={styles.pillarDesc}>
            Punch lists, field checklists, assignments, and photo proof.
          </p>
          <div className={styles.pillarTarget}>
            <span>Mutates:</span> <code>crew_assignments</code>, <code>crew_tasks</code>
          </div>
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.tabNav}>
        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          className={`${styles.tabBtn} ${activeTab === 'feed' ? styles.tabActive : ''}`}
        >
          <span>📥 Inbound Field Stream</span>
          <span className={styles.tabBadge}>{messages.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('senders')}
          className={`${styles.tabBtn} ${activeTab === 'senders' ? styles.tabActive : ''}`}
        >
          <span>👥 Authorized Phones ({1 + activeCrewList.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('photos')}
          className={`${styles.tabBtn} ${activeTab === 'photos' ? styles.tabActive : ''}`}
        >
          <span>📸 Photo &amp; OCR Guide</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          className={`${styles.tabBtn} ${activeTab === 'simulator' ? styles.tabActive : ''}`}
        >
          <span>⚡ Live Field Simulator</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`${styles.tabBtn} ${activeTab === 'rules' ? styles.tabActive : ''}`}
        >
          <span>🛡️ Safety &amp; Rollback Rules</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('siri')}
          className={`${styles.tabBtn} ${activeTab === 'siri' ? styles.tabActive : ''}`}
        >
          <span>🎙️ Siri &amp; Hands-Free Setup</span>
        </button>
      </div>

      {/* TAB 1: Inbound Message Feed & Itemized 4-Pillar Inspector */}
      {activeTab === 'feed' && (
        <div className={styles.workspaceGrid}>
          {/* Left Column: Inbound Messages Feed */}
          <div className={styles.feedCard}>
            <div className={styles.feedCardHeader}>
              <h3 className={styles.feedCardTitle}>Recent Field Messages</h3>
              <span className={styles.feedCount}>{filteredMessages.length} Shown</span>
            </div>

            {/* Quick Category Filters & Search */}
            <div className={styles.feedFilters}>
              <button
                type="button"
                onClick={() => setFeedFilter('all')}
                className={`${styles.filterBtn} ${feedFilter === 'all' ? styles.filterBtnActive : ''}`}
              >
                All Messages
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('voice')}
                className={`${styles.filterBtn} ${feedFilter === 'voice' ? styles.filterBtnActive : ''}`}
              >
                🎙️ Voice MMS
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
                          {msg.confidence}% Match
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Itemized 4-Pillar Extraction Inspector */}
          {selectedMessage && (
            <div className={styles.inspectorCard}>
              <div className={styles.inspectorHeader}>
                <div className={styles.inspectorTitleGroup}>
                  <span className={styles.inspectorEyebrow}>4-Pillar Extraction Checklist</span>
                  <h3 className={styles.inspectorTitle}>
                    {selectedMessage.matchedJobRef
                      ? `Extracted Data for ${selectedMessage.matchedJobRef}`
                      : 'Extracted Entities'}
                  </h3>
                </div>
                <span className={styles.inspectorConfidence}>
                  ✓ {selectedMessage.confidence}% AI Confidence
                </span>
              </div>

              {/* Inbound Audio Player / Snippet Box */}
              <div className={styles.inboundPreviewBox}>
                <div className={styles.inboundPreviewHead}>
                  <span className={styles.inboundPreviewSender}>
                    Inbound from: <strong>{selectedMessage.sender}</strong>
                  </span>
                  <span className={styles.inboundPreviewTime}>{selectedMessage.time}</span>
                </div>
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
                    <span className={styles.audioFilteredTag}>🔇 Diesel Noise Filtered</span>
                  </div>
                )}
              </div>

              {/* Itemized 4-Pillar Checkbox Checklist */}
              <div className={styles.checklistSection}>
                <div className={styles.checklistHead}>
                  <span className={styles.checklistTitle}>
                    Itemized Entities (Uncheck to Exclude from Database)
                  </span>
                  <span className={styles.checklistCounter}>
                    {selectedMessage.extractedItems.filter((i) => i.enabled).length} of{' '}
                    {selectedMessage.extractedItems.length} Checked
                  </span>
                </div>

                <div className={styles.checklistItems}>
                  {selectedMessage.extractedItems.map((item) => {
                    const pillarBadgeClass =
                      item.pillar === 'jobs'
                        ? styles.itemPillarJobs
                        : item.pillar === 'leads'
                        ? styles.itemPillarLeads
                        : item.pillar === 'schedule'
                        ? styles.itemPillarSchedule
                        : styles.itemPillarCrew;

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(selectedMessage.id, item.id)}
                        className={`${styles.checklistItemRow} ${
                          !item.enabled ? styles.checklistItemDisabled : ''
                        }`}
                      >
                        <div
                          className={`${styles.customCheckbox} ${
                            item.enabled ? styles.customCheckboxChecked : ''
                          }`}
                        >
                          {item.enabled ? '✓' : ''}
                        </div>
                        <div className={styles.itemMeta}>
                          <div className={styles.itemTitleRow}>
                            <span className={`${styles.itemPillarBadge} ${pillarBadgeClass}`}>
                              {item.pillar.toUpperCase()}
                            </span>
                            <span className={styles.itemTitle}>{item.title}</span>
                            <span className={styles.itemMutationPill}>{item.mutation}</span>
                          </div>
                          <p className={styles.itemDetail}>{item.detail}</p>
                          <span className={styles.itemTargetTable}>
                            Target Table: <code>{item.targetTable}</code>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className={styles.inspectorFooter}>
                <button type="button" onClick={handleApply} className={styles.applyBtn}>
                  ✓ Apply Checked Items to {selectedMessage.matchedJobRef || 'Records'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.id === selectedMessage.id
                          ? {
                              ...msg,
                              extractedItems: msg.extractedItems.map((i) => ({ ...i, enabled: true })),
                            }
                          : msg
                      )
                    )
                  }
                  className={styles.resetBtn}
                >
                  Reset All Checks
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Authorized Phone Numbers Whitelist Matrix */}
      {activeTab === 'senders' && (
        <div className={styles.sendersContainer}>
          <div className={styles.sendersCard}>
            <div className={styles.sendersHeader}>
              <div className={styles.sendersTitleGroup}>
                <h3 className={styles.sendersTitle}>Authorized Phone Numbers Whitelist</h3>
                <p className={styles.sendersSubtitle}>
                  Only verified phone numbers listed below can text <strong>{fieldPhoneNumber}</strong> to execute job changes. Unrecognized numbers receive safe default responses.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Link href="/dashboard/crew?tab=people&add=1" className={styles.vcardBtn}>
                  + Add Crew Member
                </Link>
                <Link href="/dashboard/settings" className={styles.resetBtn}>
                  Manage Alert Phone
                </Link>
              </div>
            </div>

            <div className={styles.sendersTableWrap}>
              <table className={styles.sendersTable}>
                <thead>
                  <tr>
                    <th>Authorized Person / Role</th>
                    <th>Cell Phone Number</th>
                    <th>System Role</th>
                    <th>Permitted 4-Pillars</th>
                    <th>Ingest Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 1. Account Owner / Alert Phone */}
                  <tr>
                    <td>
                      <div className={styles.senderNameCell}>
                        <div className={styles.senderAvatar}>👑</div>
                        <div>
                          <strong>{businessTitle} (Owner)</strong>
                          <div style={{ fontSize: '11px', color: '#8fa6b5' }}>Primary Alert Phone</div>
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
                        All 4 Pillars (Quotes, Leads, Schedule, Crew)
                      </span>
                    </td>
                    <td>
                      <span className={styles.senderStatusActive}>
                        <span className={styles.liveDot} /> Whitelisted &amp; Active
                      </span>
                    </td>
                  </tr>

                  {/* 2. Crew Members */}
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
                          {crew.phone || '(No phone on file)'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.senderRoleBadge}>
                          {crew.role_label || 'Field Tech'}
                        </span>
                      </td>
                      <td>
                        <span className={styles.senderPillarsTag} style={{ color: '#50e3bd' }}>
                          Progress Memos, Punch Lists, Receipts
                        </span>
                      </td>
                      <td>
                        <span className={styles.senderStatusActive}>
                          <span className={styles.liveDot} /> Enabled ({crew.active ? 'Active' : 'Inactive'})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Security Notice Box */}
            <div className={styles.senderSecurityNotice}>
              <span style={{ fontSize: '22px' }}>🛡️</span>
              <div>
                <strong style={{ color: '#f5f0e7' }}>Zero Destructive Guesses &amp; Ingress Guard:</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  If a homeowner, subcontractor, or stranger texts <strong>{fieldPhoneNumber}</strong>, the system never executes changes to active quotes or schedule. Instead, it treats unrecognized inbound messages as customer inquiries and places them in your Lead Inbox for manual review.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Photo & Voice Intelligence Guide */}
      {activeTab === 'photos' && (
        <div className={styles.guideGrid}>
          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>🧾</span>
              <h4 className={styles.guideCardTitle}>1. Supply Receipts &amp; Expense OCR</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Snap a picture of a receipt at Home Depot, Lowes, or supply house.
            </p>
            <div className={styles.guideChecklist}>
              ✓ OCR itemizes part numbers, quantities, &amp; tax.<br />
              ✓ Auto-splits items between multiple active jobs.<br />
              ✓ Updates live Job Gross Profit Margin in real-time.
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('Receipt Home Depot $184.20 for Romex and breakers on Miller J-104')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>

          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>🔍</span>
              <h4 className={styles.guideCardTitle}>2. Site Damage &amp; Change Orders</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Text a photo of subfloor rot or charred wiring: <em>“Found this on Johnson”</em>.
            </p>
            <div className={styles.guideChecklist}>
              ✓ Gemini Vision detects defect boundaries &amp; area.<br />
              ✓ Drafts itemized Change Order with material takeoff.<br />
              ✓ Stages 1-tap client approval link with photo attached.
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('Add $550 change order for 4 sheets plywood rot repair on Johnson roof')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>

          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>📸</span>
              <h4 className={styles.guideCardTitle}>3. Inspection Tags &amp; Green Cards</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Snap the building inspector’s signed green permit tag on framing or meter.
            </p>
            <div className={styles.guideChecklist}>
              ✓ Reads inspector signature, date, &amp; pass status.<br />
              ✓ Advances milestone stage (e.g. Rough Passed).<br />
              ✓ Auto-alerts the next trade crew on the schedule.
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('Rough plumbing passed inspection at 124 Main. Schedule drywall Thursday 8am')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>

          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>🏷️</span>
              <h4 className={styles.guideCardTitle}>4. Equipment Serial &amp; Nameplates</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Text a picture of a customer&apos;s rusted water heater or AC data plate.
            </p>
            <div className={styles.guideChecklist}>
              ✓ Extracts exact model, serial #, tonnage, &amp; BTUs.<br />
              ✓ Matches replacement units against your Price Book.<br />
              ✓ Pre-fills equipment replacement estimate draft.
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('Replace Carrier AC 45/5 capacitor and 2 lbs R-410A refrigerant for Smith $285')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>

          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>🌟</span>
              <h4 className={styles.guideCardTitle}>5. Client Progress &amp; Warranty Proof</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Text finished tile, roof, or paint photos with the job name.
            </p>
            <div className={styles.guideChecklist}>
              ✓ Immediately syncs to customer’s private portal.<br />
              ✓ Creates timestamped proof for change orders.<br />
              ✓ Permanently stored for warranty dispute defense.
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('Johnson punch list done: 1) caulked siding 2) painted hallway baseboards')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>

          <div className={styles.guideCard}>
            <div className={styles.guideCardHead}>
              <span style={{ fontSize: '20px' }}>🎙️</span>
              <h4 className={styles.guideCardTitle}>6. Hands-Free Driving Audio Memos</h4>
            </div>
            <p className={styles.guideCardDesc}>
              Send a 15-second voice memo via Apple iMessage or Android Messages.
            </p>
            <div className={styles.guideChecklist}>
              ✓ Suppresses diesel truck, engine, &amp; tool noise.<br />
              ✓ Extracts change orders, line items, &amp; dates.<br />
              ✓ 15-minute rollback window (Reply UNDO).
            </div>
            <div className={styles.guideActionRow}>
              <button
                type="button"
                onClick={() =>
                  handlePreset('New lead: Sarah Jenkins 248-555-0991 emergency main drain backup ASAP')
                }
                className={styles.guideTestBtn}
              >
                ⚡ Test in Sandbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Live Field Simulator Sandbox */}
      {activeTab === 'simulator' && (
        <div className={styles.simulatorBox}>
          <div className={styles.simHeader}>
            <h3 className={styles.simTitle}>
              Test Any Field Command in the Sparky Sandbox
            </h3>
            <p className={styles.simSubtitle}>
              Type or dictate any trade scenario to test how Sparky&apos;s 4-pillar neural engine extracts entities.
            </p>
          </div>

          <div className={styles.simInputRow}>
            <input
              type="text"
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
              placeholder="e.g. Add $450 to Miller job for extra romex, schedule inspection Thursday 9am"
              className={styles.simInput}
            />
            <button type="button" onClick={handleSimulate} className={styles.simSendBtn}>
              ⚡ Run Simulator
            </button>
          </div>

          <div className={styles.presetsRow}>
            <span className={styles.presetLabel}>Trade Presets:</span>
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
      )}

      {/* TAB 5: Safety Invariants & Rollback Rules */}
      {activeTab === 'rules' && (
        <div className={styles.safetyGrid}>
          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHead}>
              <span className={styles.safetyIcon}>🔄</span>
              <h4 className={styles.safetyCardTitle}>1. 15-Minute SMS Undo Rollback</h4>
            </div>
            <p className={styles.safetyCardText}>
              Every SMS confirmation receipt includes a 15-minute rollback window. Simply reply <span className={styles.safetyHighlight}>UNDO</span> from your phone to immediately revert any change order, task, or status update made in error.
            </p>
          </div>

          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHead}>
              <span className={styles.safetyIcon}>🎯</span>
              <h4 className={styles.safetyCardTitle}>2. Zero Destructive Guesses Invariant</h4>
            </div>
            <p className={styles.safetyCardText}>
              If you have two active jobs with the same name (e.g. &ldquo;Smith - 84 Pine&rdquo; vs &ldquo;Smith - 19 Oak&rdquo;), Sparky never assumes. He texts back numbered options and pauses until you reply with 1 or 2.
            </p>
          </div>

          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHead}>
              <span className={styles.safetyIcon}>🔒</span>
              <h4 className={styles.safetyCardTitle}>3. Immutable Audit Trail Feed</h4>
            </div>
            <p className={styles.safetyCardText}>
              Every voice recording audio file, raw SMS text, and OCR receipt is permanently attached to the job activity feed with exact timestamps for client dispute protection.
            </p>
          </div>

          <div className={styles.safetyCard}>
            <div className={styles.safetyCardHead}>
              <span className={styles.safetyIcon}>📶</span>
              <h4 className={styles.safetyCardTitle}>4. 10DLC Carrier Transactional Delivery</h4>
            </div>
            <p className={styles.safetyCardText}>
              All outbound confirmations are routed through registered A2P 10DLC carrier trust conduits, ensuring zero carrier spam filtering and &lt;1.5 second delivery latency.
            </p>
          </div>
        </div>
      )}

      {/* TAB 6: Siri & Hands-Free Setup */}
      {activeTab === 'siri' && (
        <div className={styles.siriGuideGrid}>
          <div className={styles.siriStepCard}>
            <span className={styles.siriStepNum}>Step 1</span>
            <h4 className={styles.siriStepTitle}>Save Contact as &ldquo;Sparky&rdquo;</h4>
            <p className={styles.siriStepText}>
              Download the .vcf contact card above or create a new contact in your phone named <strong>Sparky</strong> with phone number <strong>{fieldPhoneNumber}</strong>.
            </p>
          </div>

          <div className={styles.siriStepCard}>
            <span className={styles.siriStepNum}>Step 2</span>
            <h4 className={styles.siriStepTitle}>Apple Siri Voice Command</h4>
            <p className={styles.siriStepText}>
              While driving, hold your steering wheel voice button or say &ldquo;Hey Siri&rdquo;:
            </p>
            <div className={styles.siriCommandSnippet}>
              &ldquo;Hey Siri, text Sparky: Added $350 extra drywall to Miller job.&rdquo;
            </div>
          </div>

          <div className={styles.siriStepCard}>
            <span className={styles.siriStepNum}>Step 3</span>
            <h4 className={styles.siriStepTitle}>Android Assistant Setup</h4>
            <p className={styles.siriStepText}>
              On Google Assistant or Android Auto, dictate directly:
            </p>
            <div className={styles.siriCommandSnippet}>
              &ldquo;Hey Google, send a text to Sparky: Miller rough plumbing passed.&rdquo;
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
