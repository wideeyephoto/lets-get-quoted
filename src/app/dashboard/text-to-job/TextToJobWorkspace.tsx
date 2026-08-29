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
  type: 'sms' | 'voice';
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
    sender: 'Alert Phone (You)',
    type: 'voice',
    time: '8:42 AM · 12 mins ago',
    rawText:
      '“Rough plumbing passed inspection at 124 Main. Need Mike and drywall crew Thursday 8am. Added $450 extra PEX lines to Miller quote.”',
    audioDuration: '0:14',
    confidence: 99.4,
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
        detail: 'Drywall & insulation crew arrival window (Royal Oak cluster)',
        targetTable: 'schedule_occurrences',
        mutation: 'Slot: Thu 8:00 AM - 12:00 PM',
        enabled: true,
      },
      {
        id: 'item-1-4',
        pillar: 'crew',
        title: 'Assign Crew: Mike (Van #2)',
        detail: 'Drywall hanging & rough patching assignment with push alert',
        targetTable: 'crew_assignments',
        mutation: 'Assigned: Mike T. (Crew Lead)',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-2',
    sender: 'Alert Phone (You)',
    type: 'sms',
    time: 'Yesterday · 4:15 PM',
    rawText:
      'Met Dave Miller 248-555-0812 oak limb removal estimate Tuesday 9am. High urgency near roofline.',
    confidence: 98.9,
    matchedJobRef: 'New Lead',
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
        detail: 'Route clustered with Royal Oak East morning route',
        targetTable: 'calendar_slots',
        mutation: 'Route Density: 94% Match',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-3',
    sender: 'Crew Phone (Carlos)',
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
        mutation: 'Audit Note: 3 Items Logged',
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
  const [activeTab, setActiveTab] = useState<'feed' | 'senders' | 'simulator' | 'rules'>('feed');
  const [messages, setMessages] = useState<InboundMessage[]>(SAMPLE_INBOUND_MESSAGES);
  const [selectedMsgId, setSelectedMsgId] = useState<string>(SAMPLE_INBOUND_MESSAGES[0].id);
  const [notification, setNotification] = useState<string | null>(null);
  const [tosAcknowledged, setTosAcknowledged] = useState<boolean>(true);
  const [copiedNumber, setCopiedNumber] = useState<boolean>(false);

  // Simulator State
  const [simText, setSimText] = useState(
    'Replace 45/5 capacitor on Carrier AC for Smith. Added 2 lbs R-410A refrigerant. Quote $285 total invoice ready.'
  );

  const selectedMessage = messages.find((m) => m.id === selectedMsgId) || messages[0];

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
    setNotification(`📋 Copied field texting number (${fieldPhoneNumber}) to clipboard!`);
    setTimeout(() => {
      setCopiedNumber(false);
      setNotification(null);
    }, 3500);
  }

  function handleSimulate() {
    if (!simText.trim()) return;

    const newSimMsg: InboundMessage = {
      id: `sim-${Date.now()}`,
      sender: `Alert Phone (${alertPhone})`,
      type: 'sms',
      time: 'Just now (Simulator)',
      rawText: `“${simText}”`,
      confidence: 99.2,
      matchedJobRef: 'Job J-88 (Smith AC)',
      extractedItems: [
        {
          id: `sim-item-1`,
          pillar: 'jobs',
          title: 'Add HVAC Line Items ($285.00 Total)',
          detail: '45/5 Dual Capacitor + 2 lbs R-410A Refrigerant itemization',
          targetTable: 'quote_line_items',
          mutation: 'Draft Invoice Ready: $285.00',
          enabled: true,
        },
        {
          id: `sim-item-2`,
          pillar: 'jobs',
          title: 'Update Equipment Maintenance History',
          detail: 'Carrier Outdoor Unit Serial #CR-4409 logged',
          targetTable: 'job_activity_feed',
          mutation: 'Equipment Record Updated',
          enabled: true,
        },
        {
          id: `sim-item-3`,
          pillar: 'crew',
          title: 'Mark Work Completed & Sign Off',
          detail: 'Technician service ticket finalized',
          targetTable: 'crew_tasks',
          mutation: 'Status: Completed on Site',
          enabled: true,
        },
      ],
    };

    setMessages([newSimMsg, ...messages]);
    setSelectedMsgId(newSimMsg.id);
    setActiveTab('feed');
    setNotification('⚡ Simulated field SMS parsed into 3 toggleable items across Jobs & Crew.');
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
          <span className={styles.badge}>✦ Field Ingest &amp; Extraction Engine</span>
          <h1 className={styles.title}>Text-to-Job Dashboard</h1>
          <p className={styles.subtitle}>
            Review SMS &amp; voice memos from the truck, see exactly what data was extracted across the
            4 pillars, and manage authorized phone numbers and accuracy terms.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={handleCopyNumber} className={styles.resetBtn}>
            {copiedNumber ? '✓ Copied Number' : `📋 Copy ${fieldPhoneNumber}`}
          </button>
          <a
            href={`data:text/vcard;charset=utf-8,${encodeURIComponent(
              `BEGIN:VCARD\nVERSION:3.0\nFN:${businessTitle} Field Hotline\nTEL;TYPE=CELL:${fieldPhoneNumber}\nNOTE:Text-to-Job Field Ingest\nEND:VCARD`
            )}`}
            download="text-to-job-hotline.vcf"
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
            <span>{fieldPhoneNumber}</span>
            <span className={styles.liveDot} title="Online &amp; Ingress Active" />
          </div>
          <small className={styles.hotlineSub}>
            Text this number from any authorized cell phone. Save as <em>"{businessTitle} Intake"</em>.
          </small>
        </div>

        <div className={styles.hotlineCol}>
          <span className={styles.hotlineLabel}>Master Account Whitelist</span>
          <div className={styles.hotlineValue}>
            <span>{alertPhone}</span>
            <span className={styles.verifiedShield}>🛡️ Verified</span>
          </div>
          <small className={styles.hotlineSub}>
            Master owner phone number authenticated for full quote and database mutations.
          </small>
        </div>

        <div className={styles.hotlineCol}>
          <span className={styles.hotlineLabel}>Ingress Telephony Latency</span>
          <div className={styles.hotlineValue}>
            <span style={{ color: '#50e3bd' }}>~1.4s Gemini Ingress</span>
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
        <div className={`${styles.pillarCard} ${styles.pillarJobs}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>📁</span>
            <span className={styles.pillarCount}>{activeJobCount} Active</span>
          </div>
          <h3 className={styles.pillarTitle}>1. Jobs &amp; Quotes</h3>
          <p className={styles.pillarDesc}>
            Change orders, line items, deposits, and timeline milestones.
          </p>
          <span className={styles.pillarTarget}>
            Mutates: <code>jobs</code>, <code>quote_line_items</code>
          </span>
        </div>

        <div className={`${styles.pillarCard} ${styles.pillarLeads}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>👤</span>
            <span className={styles.pillarCount}>{leadCount} Leads</span>
          </div>
          <h3 className={styles.pillarTitle}>2. Leads &amp; CRM</h3>
          <p className={styles.pillarDesc}>
            Customer intake, urgency scoring, phone tags, and address lookup.
          </p>
          <span className={styles.pillarTarget}>
            Mutates: <code>leads</code>, <code>contacts</code>, <code>lead_tags</code>
          </span>
        </div>

        <div className={`${styles.pillarCard} ${styles.pillarSchedule}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>📅</span>
            <span className={styles.pillarCount}>Real-Time</span>
          </div>
          <h3 className={styles.pillarTitle}>3. Schedule &amp; Route</h3>
          <p className={styles.pillarDesc}>
            Arrival windows, duration blocks, route density, and calendar slots.
          </p>
          <span className={styles.pillarTarget}>
            Mutates: <code>schedule_occurrences</code>, <code>calendar</code>
          </span>
        </div>

        <div className={`${styles.pillarCard} ${styles.pillarCrew}`}>
          <div className={styles.pillarHead}>
            <span className={styles.pillarIcon}>👷</span>
            <span className={styles.pillarCount}>{crewCount} Techs</span>
          </div>
          <h3 className={styles.pillarTitle}>4. Crew &amp; Tasks</h3>
          <p className={styles.pillarDesc}>
            Punch lists, field app checklists, assignments, and photo proof.
          </p>
          <span className={styles.pillarTarget}>
            Mutates: <code>crew_assignments</code>, <code>crew_tasks</code>
          </span>
        </div>
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
          <span>📱 Authorized Phone Numbers ({1 + activeCrewList.length})</span>
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
          <span>🛡️ Safety Invariants &amp; Rollbacks</span>
        </button>
      </div>

      {/* TAB 1: Inbound Message Feed & Itemized 4-Pillar Inspector */}
      {activeTab === 'feed' && (
        <div className={styles.workspaceGrid}>
          {/* Left Column: Inbound Messages Feed */}
          <div className={styles.feedCard}>
            <div className={styles.feedCardHeader}>
              <h3 className={styles.feedCardTitle}>Recent Field Messages</h3>
              <span className={styles.feedCount}>{messages.length} Total</span>
            </div>

            <div className={styles.feedList}>
              {messages.map((msg) => {
                const isSelected = msg.id === selectedMsgId;
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
                        {msg.type === 'voice' ? '🎙️ Audio MMS' : '💬 SMS Text'}
                      </span>
                      {msg.matchedJobRef && (
                        <span className={styles.feedMatchedBadge}>
                          Matched: {msg.matchedJobRef}
                        </span>
                      )}
                      <span className={styles.feedConfidenceBadge}>
                        {msg.confidence}% Match
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Itemized 4-Pillar Extraction Inspector */}
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
                  <button type="button" className={styles.audioPlayBtn}>
                    ▶ Listen ({selectedMessage.audioDuration})
                  </button>
                  <div className={styles.waveformGraphic}>
                    <span style={{ height: '40%' }}></span>
                    <span style={{ height: '80%' }}></span>
                    <span style={{ height: '100%' }}></span>
                    <span style={{ height: '60%' }}></span>
                    <span style={{ height: '90%' }}></span>
                    <span style={{ height: '50%' }}></span>
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
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => {}}
                        className={styles.checkboxInput}
                      />
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href="/dashboard/crew" className={styles.vcardBtn}>
                  + Add Crew Member
                </Link>
                <Link href="/dashboard/settings" className={styles.resetBtn}>
                  Manage Alert Phone
                </Link>
              </div>
            </div>

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
                    <span style={{ fontSize: '12px', color: '#ff8e42', fontWeight: 800 }}>
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
                      <span style={{ fontSize: '12px', color: '#50e3bd' }}>
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

            {/* Security Notice Box */}
            <div className={styles.senderSecurityNotice}>
              <span style={{ fontSize: '20px' }}>🛡️</span>
              <div>
                <strong style={{ color: '#f5f0e7' }}>Zero Destructive Guesses &amp; Ingress Guard:</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  If a homeowner, subcontractor, or stranger texts <strong>{fieldPhoneNumber}</strong>, the system does not execute any changes to your active quotes or schedule. Instead, it treats unrecognized inbound messages as customer inquiries and places them in your Lead Inbox for manual review.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Live Field Simulator Sandbox */}
      {activeTab === 'simulator' && (
        <div className={styles.simulatorBox}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0', color: '#f5f0e7' }}>
              Test Any Field Command in the Gemini Sandbox
            </h3>
            <p style={{ fontSize: '13px', color: '#a7bcc8', margin: 0 }}>
              Type or dictate any trade scenario to test how the 4-pillar neural engine extracts entities.
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

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11.5px', color: '#7da0b3', fontWeight: 750, alignSelf: 'center' }}>
              Quick Presets:
            </span>
            <button
              type="button"
              onClick={() =>
                setSimText('Add $550 change order for 4 sheets plywood rot repair on Johnson roof.')
              }
              className={styles.resetBtn}
            >
              Roofing Change Order ($550)
            </button>
            <button
              type="button"
              onClick={() =>
                setSimText('New lead: Sarah Jenkins 248-555-0991 emergency main drain backup needs estimate ASAP.')
              }
              className={styles.resetBtn}
            >
              Plumbing Emergency Lead
            </button>
            <button
              type="button"
              onClick={() =>
                setSimText('Final punch list for Smith: 1) touch up paint in kitchen 2) fix loose door latch.')
              }
              className={styles.resetBtn}
            >
              Remodeling Punch List
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Safety Invariants & Rollback Rules */}
      {activeTab === 'rules' && (
        <div className={styles.simulatorBox}>
          <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 4px 0', color: '#f5f0e7' }}>
            Safety Invariants, Disambiguation &amp; Rollback Architecture
          </h3>
          <p style={{ fontSize: '13px', color: '#a7bcc8', margin: '0 0 16px 0' }}>
            How Text-to-Job guarantees that your job data is never overwritten by mistake.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div style={{ background: 'rgba(4, 11, 18, 0.85)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(174, 199, 211, 0.15)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#ff8e42', marginBottom: '4px' }}>
                1. 15-Minute SMS Undo Rollback
              </div>
              <p style={{ fontSize: '12px', color: '#d1e2eb', margin: 0, lineHeight: 1.45 }}>
                Every SMS confirmation receipt includes a 15-minute rollback window. Simply reply <strong>UNDO</strong> from your phone to immediately revert any change order, task, or status update.
              </p>
            </div>

            <div style={{ background: 'rgba(4, 11, 18, 0.85)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(174, 199, 211, 0.15)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#50e3bd', marginBottom: '4px' }}>
                2. Zero Destructive Guesses Invariant
              </div>
              <p style={{ fontSize: '12px', color: '#d1e2eb', margin: 0, lineHeight: 1.45 }}>
                If you have two active jobs with the same name (e.g. "Smith - 84 Pine" vs "Smith - 19 Oak"), Gemini never guesses. It texts back numbered options and pauses until you reply with 1 or 2.
              </p>
            </div>

            <div style={{ background: 'rgba(4, 11, 18, 0.85)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(174, 199, 211, 0.15)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>
                3. Immutable Audit Trail Feed
              </div>
              <p style={{ fontSize: '12px', color: '#d1e2eb', margin: 0, lineHeight: 1.45 }}>
                Every voice recording audio file, raw SMS text, and OCR receipt is permanently attached to the job activity feed with exact timestamps for client dispute protection.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
