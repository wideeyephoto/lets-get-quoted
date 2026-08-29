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
        title: 'Score Triage Priority & Tag Hazard',
        detail: 'Overhanging branches near primary roofline',
        targetTable: 'lead_tags',
        mutation: 'Tags: [Urgent Hazard, Tree Trimming]',
        enabled: true,
      },
      {
        id: 'item-2-3',
        pillar: 'schedule',
        title: 'Stage 30-min Estimate Window',
        detail: 'Tuesday 9:00 AM – 9:30 AM on Royal Oak East Route',
        targetTable: 'calendar_slots',
        mutation: 'Estimate Blocked: Tue 9:00 AM',
        enabled: true,
      },
    ],
  },
  {
    id: 'msg-3',
    sender: 'Alert Phone (You)',
    type: 'sms',
    time: '2 days ago',
    rawText:
      'Punch list for Johnson siding: 1) Caulk exterior trim 2) Paint hallway baseboards 3) Haul debris dumpster Thursday.',
    confidence: 99.1,
    matchedJobRef: 'J-98 (Johnson)',
    extractedItems: [
      {
        id: 'item-3-1',
        pillar: 'crew',
        title: 'Task 1: Caulk Exterior Trim',
        detail: 'Assigned to field app checklist with sign-off requirement',
        targetTable: 'crew_tasks',
        mutation: 'New Crew Task on Field App',
        enabled: true,
      },
      {
        id: 'item-3-2',
        pillar: 'crew',
        title: 'Task 2: Paint Hallway Baseboards',
        detail: 'Assigned to crew checklist with finish verification',
        targetTable: 'crew_tasks',
        mutation: 'New Crew Task on Field App',
        enabled: true,
      },
      {
        id: 'item-3-3',
        pillar: 'schedule',
        title: 'Schedule Debris Dumpster Pickup',
        detail: 'Thursday afternoon logistics window',
        targetTable: 'schedule_occurrences',
        mutation: 'Logistics Task: Thu 2:00 PM',
        enabled: true,
      },
      {
        id: 'item-3-4',
        pillar: 'jobs',
        title: 'Append Punch List to Job Feed',
        detail: 'Johnson siding final walkthrough notes',
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
  activeJobCount: number;
  leadCount: number;
  crewCount: number;
}

export default function TextToJobWorkspace({
  account,
  activeJobCount,
  leadCount,
  crewCount,
}: TextToJobWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'simulator' | 'rules'>('feed');
  const [messages, setMessages] = useState<InboundMessage[]>(SAMPLE_INBOUND_MESSAGES);
  const [selectedMsgId, setSelectedMsgId] = useState<string>(SAMPLE_INBOUND_MESSAGES[0].id);
  const [notification, setNotification] = useState<string | null>(null);

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

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.badge}>✦ Field Ingest &amp; Extraction Engine</span>
          <h1 className={styles.title}>Text-to-Job Dashboard</h1>
          <p className={styles.subtitle}>
            Review SMS &amp; voice memos from the truck, see exactly what data was extracted across the
            4 pillars, and toggle what gets applied.
          </p>
        </div>
        <div className={styles.headerActions}>
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

      {/* Hotline & Guard Status Strip */}
      <div className={styles.hotlineStrip}>
        <div className={styles.hotlineItem}>
          <span className={styles.hotlineLabel}>Dedicated Field Number</span>
          <span className={`${styles.hotlineVal} ${styles.hotlineHighlight}`}>
            {fieldPhoneNumber}
          </span>
        </div>
        <div className={styles.hotlineItem}>
          <span className={styles.hotlineLabel}>Authenticated Alert Phone</span>
          <span className={styles.hotlineVal}>
            {alertPhone} <span className={styles.statusPill}>✓ Whitelisted</span>
          </span>
        </div>
        <div className={styles.hotlineItem}>
          <span className={styles.hotlineLabel}>AI Engine</span>
          <span className={styles.hotlineVal}>Gemini 2.5 Multimodal · 1.4s Latency</span>
        </div>
        <div className={styles.hotlineItem}>
          <span className={styles.hotlineLabel}>Safety Invariant</span>
          <span className={styles.hotlineVal}>Zero Destructive Guesses</span>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#50e3bd',
            padding: '12px 18px',
            borderRadius: '10px',
            fontWeight: 750,
            fontSize: '13px',
          }}
        >
          {notification}
        </div>
      )}

      {/* 4-Pillar Live Storage Matrix */}
      <section className={styles.matrixSection}>
        <div className={styles.matrixSectionHeader}>
          <h2 className={styles.sectionHeading}>
            <span>📊 4-Pillar Live Storage Matrix</span>
          </h2>
          <span style={{ fontSize: '12px', color: '#7da0b3' }}>
            Where extracted information lands in your database
          </span>
        </div>

        <div className={styles.matrixGrid}>
          {/* Pillar 1: Jobs */}
          <div className={`${styles.pillarCard} ${styles.pillarCardJobs}`}>
            <div className={styles.pillarHead}>
              <span className={styles.pillarIcon}>📁</span>
              <span className={styles.pillarCountBadge}>{activeJobCount} Active Jobs</span>
            </div>
            <h3 className={styles.pillarTitle}>1. Jobs &amp; Quotes</h3>
            <p className={styles.pillarStat}>$4,850 Added</p>
            <p className={styles.pillarDesc}>
              Line items, change orders, labor hours, and voice transcripts attached to job files.
            </p>
            <div className={styles.storageTargetBox}>
              <span className={styles.storageTargetLabel}>Stored in database:</span>
              <span className={styles.storageTargetTables}>jobs · quote_line_items · feed</span>
            </div>
            <Link href="/dashboard/jobs" className={styles.pillarLink}>
              View Jobs &rarr;
            </Link>
          </div>

          {/* Pillar 2: Leads */}
          <div className={`${styles.pillarCard} ${styles.pillarCardLeads}`}>
            <div className={styles.pillarHead}>
              <span className={styles.pillarIcon}>👤</span>
              <span className={styles.pillarCountBadge}>{leadCount} Leads</span>
            </div>
            <h3 className={styles.pillarTitle}>2. Leads &amp; CRM</h3>
            <p className={styles.pillarStat}>12 Leads Ingested</p>
            <p className={styles.pillarDesc}>
              Homeowner names, phone numbers, urgency ratings, and service categories staged.
            </p>
            <div className={styles.storageTargetBox}>
              <span className={styles.storageTargetLabel}>Stored in database:</span>
              <span className={styles.storageTargetTables}>leads · contacts · lead_tags</span>
            </div>
            <Link href="/dashboard/leads" className={styles.pillarLink}>
              View Leads &rarr;
            </Link>
          </div>

          {/* Pillar 3: Schedule */}
          <div className={`${styles.pillarCard} ${styles.pillarCardSchedule}`}>
            <div className={styles.pillarHead}>
              <span className={styles.pillarIcon}>📅</span>
              <span className={styles.pillarCountBadge}>8 Arrival Windows</span>
            </div>
            <h3 className={styles.pillarTitle}>3. Schedule</h3>
            <p className={styles.pillarStat}>100% On Time</p>
            <p className={styles.pillarDesc}>
              Estimate dates, arrival windows, duration blocks, and route density clustering.
            </p>
            <div className={styles.storageTargetBox}>
              <span className={styles.storageTargetLabel}>Stored in database:</span>
              <span className={styles.storageTargetTables}>schedule_occurrences · calendar</span>
            </div>
            <Link href="/dashboard/schedule" className={styles.pillarLink}>
              View Schedule &rarr;
            </Link>
          </div>

          {/* Pillar 4: Crew */}
          <div className={`${styles.pillarCard} ${styles.pillarCardCrew}`}>
            <div className={styles.pillarHead}>
              <span className={styles.pillarIcon}>👷</span>
              <span className={styles.pillarCountBadge}>{crewCount} Techs</span>
            </div>
            <h3 className={styles.pillarTitle}>4. Crew &amp; Tasks</h3>
            <p className={styles.pillarStat}>19 Tasks Assigned</p>
            <p className={styles.pillarDesc}>
              Punch list items, field app checklists, crew notifications, and gate codes.
            </p>
            <div className={styles.storageTargetBox}>
              <span className={styles.storageTargetLabel}>Stored in database:</span>
              <span className={styles.storageTargetTables}>crew_assignments · crew_tasks</span>
            </div>
            <Link href="/dashboard/crew" className={styles.pillarLink}>
              View Crew &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className={styles.tabNav}>
        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          className={`${styles.tabBtn} ${activeTab === 'feed' ? styles.tabBtnActive : ''}`}
        >
          📥 Inbound Messages &amp; Extraction Inspector ({messages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('simulator')}
          className={`${styles.tabBtn} ${activeTab === 'simulator' ? styles.tabBtnActive : ''}`}
        >
          ⚡ Live Field Simulator Sandbox
        </button>
      </div>

      {/* Tab 1: Live Feed & Itemized 4-Pillar Drawer */}
      {activeTab === 'feed' && (
        <div className={styles.workspaceLayout}>
          {/* Feed List */}
          <div className={styles.feedCol}>
            <div className={styles.feedList}>
              {messages.map((msg) => {
                const isSelected = msg.id === selectedMsgId;
                return (
                  <div
                    key={msg.id}
                    onClick={() => setSelectedMsgId(msg.id)}
                    className={`${styles.feedCard} ${isSelected ? styles.feedCardActive : ''}`}
                  >
                    <div className={styles.feedHead}>
                      <span
                        className={`${styles.feedTypePill} ${
                          msg.type === 'voice' ? styles.feedTypeVoice : styles.feedTypeText
                        }`}
                      >
                        {msg.type === 'voice' ? '🎙️ Voice Memo' : '💬 SMS Text'}
                        {msg.audioDuration ? ` · ${msg.audioDuration}` : ''}
                      </span>
                      <span className={styles.feedTime}>{msg.time}</span>
                    </div>

                    <p className={styles.feedRawMsg}>{msg.rawText}</p>

                    <div className={styles.feedPillRow}>
                      {msg.matchedJobRef && (
                        <span className={styles.miniPill} style={{ color: '#50e3bd' }}>
                          🎯 {msg.matchedJobRef}
                        </span>
                      )}
                      <span className={styles.miniPill}>
                        ✓ {msg.extractedItems.filter((i) => i.enabled).length} Entities Extracted
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4-Pillar Extraction Inspector & Checkbox Drawer */}
          <div className={styles.inspectorCol}>
            <div className={styles.inspectorHead}>
              <div className={styles.inspectorTitleBox}>
                <h3 className={styles.inspectorTitle}>
                  Itemized 4-Pillar Extraction Checklist
                </h3>
                <p className={styles.inspectorSubtitle}>
                  Uncheck any item below to exclude it from being written to your database.
                </p>
              </div>

              {selectedMessage.type === 'voice' && (
                <button
                  type="button"
                  className={styles.audioPlayBtn}
                  onClick={() => {
                    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(selectedMessage.rawText);
                      utterance.rate = 1.05;
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                >
                  ▶ Listen (Audio Ingest)
                </button>
              )}
            </div>

            {/* Checklist Groups categorized by the 4 Pillars */}
            {(['jobs', 'leads', 'schedule', 'crew'] as const).map((pillarKey) => {
              const itemsInPillar = selectedMessage.extractedItems.filter(
                (item) => item.pillar === pillarKey
              );
              if (itemsInPillar.length === 0) return null;

              const titles = {
                jobs: '📁 1. Jobs & Quotes Actions',
                leads: '👤 2. Leads & Contacts Actions',
                schedule: '📅 3. Schedule & Dispatch Actions',
                crew: '👷 4. Crew & Tasks Actions',
              };

              const groupClasses = {
                jobs: styles.checklistGroupJobs,
                leads: styles.checklistGroupLeads,
                schedule: styles.checklistGroupSchedule,
                crew: styles.checklistGroupCrew,
              };

              return (
                <div key={pillarKey} className={styles.checklistGroup}>
                  <div className={`${styles.checklistGroupHeader} ${groupClasses[pillarKey]}`}>
                    <span>{titles[pillarKey]}</span>
                    <span className={styles.targetTableTag}>
                      Target: {itemsInPillar[0].targetTable}
                    </span>
                  </div>

                  <div className={styles.checkItemsList}>
                    {itemsInPillar.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(selectedMessage.id, item.id)}
                        className={`${styles.checkItemRow} ${
                          !item.enabled ? styles.checkItemDisabled : ''
                        }`}
                      >
                        <div
                          className={`${styles.customCheckbox} ${
                            !item.enabled ? styles.customCheckboxUnchecked : ''
                          }`}
                        >
                          {item.enabled ? '✓' : ''}
                        </div>

                        <div className={styles.checkItemContent}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span className={styles.checkItemTitle}>{item.title}</span>
                            <span className={styles.mutationBadge}>
                              {item.enabled ? item.mutation : 'Skipped'}
                            </span>
                          </div>
                          <span className={styles.checkItemDetail}>{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Bottom Actions */}
            <div className={styles.inspectorFooter}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={handleApply} className={styles.applyBtn}>
                  ✓ Apply{' '}
                  {selectedMessage.extractedItems.filter((i) => i.enabled).length} Checked Items
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessages((prev) =>
                      prev.map((msg) => {
                        if (msg.id !== selectedMessage.id) return msg;
                        return {
                          ...msg,
                          extractedItems: msg.extractedItems.map((i) => ({ ...i, enabled: true })),
                        };
                      })
                    );
                  }}
                  className={styles.resetBtn}
                >
                  Select All
                </button>
              </div>

              <span style={{ fontSize: '11px', color: '#7da0b3' }}>
                Carrier Ingress verified · Audit log immutable
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Simulator Sandbox */}
      {activeTab === 'simulator' && (
        <div className={styles.simulatorBox}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 850 }}>
              Live Field Message Tester
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#a7bcc8' }}>
              Type any field update, quote change order, punch list, or lead note. See how Gemini
              parses it into the 4 pillars in real time.
            </p>
          </div>

          <div className={styles.simInputRow}>
            <input
              type="text"
              value={simText}
              onChange={(e) => setSimText(e.target.value)}
              placeholder="e.g. Add $350 extra Romex to Miller job, assign Mike Thursday 9am..."
              className={styles.simInput}
            />
            <button type="button" onClick={handleSimulate} className={styles.simSendBtn}>
              ⚡ Parse &amp; Extract
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#7da0b3' }}>Quick presets:</span>
            {[
              'Add $400 for 4 sheets plywood rot repair on Johnson roof.',
              'Lead Dave Miller 248-555-0812 oak limb removal Tuesday 9am.',
              'Rough electrical passed at 84 Pine. Drywall crew Friday 8am.',
              'Punch list for crew: 1) Caulk exterior siding 2) Paint baseboards.',
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSimText(preset)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(174, 199, 211, 0.15)',
                  borderRadius: '6px',
                  color: '#d1e2eb',
                  fontSize: '11px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                {preset.slice(0, 36)}...
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
