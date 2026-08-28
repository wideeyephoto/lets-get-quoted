'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from './text-to-record-simulator.module.css';

type Scenario = {
  id: string;
  tabLabel: string;
  icon: string;
  title: string;
  badge: string;
  badgeType: 'quote' | 'voice' | 'task' | 'safety' | 'lead';
  description: string;
  contractorSender: string;
  contractorInputType: 'text' | 'voice';
  contractorText?: string;
  voiceAudioDuration?: string;
  voiceTranscript?: string;
  aiResponse: string;
  followUpText?: string;
  aiFollowUpResponse?: string;
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
    tasks?: { text: string; done: boolean }[];
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
    tabLabel: 'Quote Change Order',
    icon: '💰',
    title: 'Add Quote Line Items & Recalculate Totals',
    badge: 'Change Order Auto-Calculated',
    badgeType: 'quote',
    description:
      'Spotted extra work on-site? Text your platform number with the price and description. Gemini updates the job estimate and calculates total pricing in seconds.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText: 'Add $450 to Miller job for extra 12/2 Romex line and GFCI outlet in pantry',
    aiResponse:
      '✅ Updated Job J-104 (Miller - 124 Main St): Added $450.00 Electrical Line Item. Total quote updated from $2,800 to $3,250. View: lgq.co/j/104',
    jobRecord: {
      jobNumber: 'J-104',
      clientName: 'Miller Residence',
      address: '124 Main St, Royal Oak, MI',
      status: 'Quote Updated',
      statusColor: '#10b981',
      badgeText: 'Updated via SMS 2s ago',
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
    tabLabel: 'Voice Memo MMS',
    icon: '🎙️',
    title: 'Log Audio Memos & Progress Notes',
    badge: 'MMS Multimodal Audio AI',
    badgeType: 'voice',
    description:
      'Send a quick 10-second voice memo while driving. Gemini transcribes the audio, extracts milestone updates, and attaches the recording to the job feed.',
    contractorSender: 'You (Voice Memo MMS)',
    contractorInputType: 'voice',
    voiceAudioDuration: '0:09',
    voiceTranscript:
      '“Rough-in plumbing inspected and passed on Elm St. Waiting on drywall crew Thursday 8 AM.”',
    aiResponse:
      '🎙️ Logged Voice Memo to Job J-108 (Wilson - 428 Elm). Milestone: Rough Inspection Passed. Next task queued: Drywall crew on-site Thursday 8:00 AM.',
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
    id: 'punch-list',
    tabLabel: 'Punch List & Tasks',
    icon: '📋',
    title: 'Dictate Crew Checklist Tasks',
    badge: 'Auto-Task Extraction',
    badgeType: 'task',
    description:
      'Walk the job site and text to-do items. Gemini breaks down multi-item punch lists into discrete tasks assigned directly to your field crew.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText:
      'Add punch list to Johnson: 1) Caulk exterior siding trim 2) Replace hallway GFCI plate 3) Touch up baseboard paint',
    aiResponse:
      '✅ Added 3 tasks to Job J-92 (Johnson - 88 Birch Ln): 1) Caulk exterior trim 2) Replace GFCI plate 3) Touch up paint. Pushed to crew feed.',
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
    tabLabel: 'Ambiguity Guard',
    icon: '🛡️',
    title: 'Zero Destructive Guesses Safety Invariant',
    badge: 'Disambiguation Safety',
    badgeType: 'safety',
    description:
      'If two active jobs share a name, Gemini never guesses. It texts back clarifying options so you never accidentally modify or close the wrong job.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText: 'Mark Smith job complete',
    aiResponse:
      '⚠️ You have 2 active Smith jobs:\n1) Smith - 84 Pine St ($1,200)\n2) Smith - 19 Oak Ave ($4,800)\nReply 1 or 2 to confirm completion.',
    followUpText: '1',
    aiFollowUpResponse:
      '✅ Marked Job J-84 (Smith - 84 Pine St) as COMPLETED. Final invoice draft ($1,200.00) ready for one-tap review.',
    jobRecord: {
      jobNumber: 'J-84',
      clientName: 'Smith Siding Repair',
      address: '84 Pine St, Ferndale, MI',
      status: 'Completed (Ready to Invoice)',
      statusColor: '#10b981',
      badgeText: 'Safe Disambiguation Verified',
      safetyNotice: 'Gemini resolved target job via prompt disambiguation before status mutation.',
      totalAmount: '$1,200.00',
    },
  },
  {
    id: 'quick-lead',
    tabLabel: 'Quick Lead on the Fly',
    icon: '🚀',
    title: 'Capture Leads While Driving',
    badge: 'Instant Lead Creation',
    badgeType: 'lead',
    description:
      'Got a quick referral or saw a neighbor while packing up? Text their name, number, and note. The system creates the lead and stages the estimate.',
    contractorSender: 'You (Alert Phone)',
    contractorInputType: 'text',
    contractorText:
      'New lead: Dave Miller, 248-555-0812, master bedroom roof leak around chimney, needs estimate Tuesday morning',
    aiResponse:
      '🚀 Created New Lead J-112: Dave Miller (248-555-0812). Chimney flashing / roof leak. Scheduled for Tuesday 9:30 AM estimate.',
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
  const scenario = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  return (
    <div className={styles.simulatorWrapper}>
      {/* Scenario Selector Tabs */}
      <div className={styles.tabBar} role="tablist" aria-label="Field Intake Scenarios">
        {SCENARIOS.map((s) => {
          const isActive = s.id === activeScenarioId;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabBtn} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActiveScenarioId(s.id)}
            >
              <span className={styles.tabIcon}>{s.icon}</span>
              <span className={styles.tabLabel}>{s.tabLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Scenario Description Header */}
      <div className={styles.scenarioHeader}>
        <div className={styles.scenarioMeta}>
          <span className={`${styles.badge} ${styles[`badge_${scenario.badgeType}`]}`}>
            {scenario.badge}
          </span>
          <h3 className={styles.scenarioTitle}>{scenario.title}</h3>
          <p className={styles.scenarioDesc}>{scenario.description}</p>
        </div>
      </div>

      {/* Dual Pane Layout: Phone SMS Left / Live Job Record Right */}
      <div className={styles.dualPane}>
        {/* Left Column: Phone Messages Interface */}
        <div className={styles.phoneColumn}>
          <div className={styles.phoneDevice}>
            {/* Phone Speaker & Dynamic Island */}
            <div className={styles.phoneTopBar}>
              <span className={styles.phoneTime}>9:41</span>
              <div className={styles.phoneIsland}></div>
              <div className={styles.phoneSignals}>
                <span>5G</span>
                <span>100%</span>
              </div>
            </div>

            {/* Messages Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatAvatar}>HQ</div>
              <div className={styles.chatInfo}>
                <span className={styles.chatTitle}>Let’s Get Quoted AI</span>
                <span className={styles.chatSub}>Dedicated Field Line · (888) 555-0140</span>
              </div>
            </div>

            {/* Chat Thread */}
            <div className={styles.chatBody}>
              <div className={styles.chatDate}>Today · Alert Phone Verified</div>

              {/* Contractor Message / Voice Memo */}
              {scenario.contractorInputType === 'text' ? (
                <div className={`${styles.bubble} ${styles.contractorBubble}`}>
                  <div className={styles.bubbleSender}>{scenario.contractorSender}</div>
                  <div className={styles.bubbleText}>{scenario.contractorText}</div>
                  <div className={styles.bubbleTime}>9:41 AM · Sent</div>
                </div>
              ) : (
                <div className={`${styles.bubble} ${styles.contractorVoiceBubble}`}>
                  <div className={styles.bubbleSender}>{scenario.contractorSender}</div>
                  <div className={styles.voicePlayer}>
                    <button type="button" className={styles.voicePlayBtn} aria-label="Play Voice Memo">
                      ▶
                    </button>
                    <div className={styles.waveformContainer}>
                      <div className={styles.waveformBars}>
                        <span style={{ height: '35%' }}></span>
                        <span style={{ height: '70%' }}></span>
                        <span style={{ height: '100%' }}></span>
                        <span style={{ height: '80%' }}></span>
                        <span style={{ height: '55%' }}></span>
                        <span style={{ height: '90%' }}></span>
                        <span style={{ height: '40%' }}></span>
                        <span style={{ height: '75%' }}></span>
                        <span style={{ height: '95%' }}></span>
                        <span style={{ height: '60%' }}></span>
                        <span style={{ height: '30%' }}></span>
                      </div>
                      <span className={styles.voiceDuration}>{scenario.voiceAudioDuration}</span>
                    </div>
                  </div>
                  <div className={styles.voiceTranscriptBox}>
                    <span className={styles.transcriptTag}>Audio MMS:</span>
                    <p className={styles.transcriptText}>{scenario.voiceTranscript}</p>
                  </div>
                  <div className={styles.bubbleTime}>9:41 AM · Sent</div>
                </div>
              )}

              {/* AI Confirmation Reply */}
              <div className={`${styles.bubble} ${styles.aiBubble}`}>
                <div className={styles.bubbleSender}>AI Intake Assistant</div>
                <div className={styles.bubbleText} style={{ whiteSpace: 'pre-line' }}>
                  {scenario.aiResponse}
                </div>
                <div className={styles.bubbleTime}>9:41 AM · Verified & Applied</div>
              </div>

              {/* Optional Multi-turn Ambiguity Follow-up */}
              {scenario.followUpText && (
                <>
                  <div className={`${styles.bubble} ${styles.contractorBubble}`}>
                    <div className={styles.bubbleSender}>{scenario.contractorSender}</div>
                    <div className={styles.bubbleText}>{scenario.followUpText}</div>
                    <div className={styles.bubbleTime}>9:42 AM · Sent</div>
                  </div>
                  <div className={`${styles.bubble} ${styles.aiBubble}`}>
                    <div className={styles.bubbleSender}>AI Intake Assistant</div>
                    <div className={styles.bubbleText}>{scenario.aiFollowUpResponse}</div>
                    <div className={styles.bubbleTime}>9:42 AM · Verified & Applied</div>
                  </div>
                </>
              )}
            </div>

            {/* Phone Input Bar */}
            <div className={styles.chatInputBar}>
              <span className={styles.attachBtn}>📷</span>
              <span className={styles.micBtn}>🎙️</span>
              <div className={styles.inputMock}>Text or voice memo...</div>
              <span className={styles.sendMock}>↑</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Job Record Card */}
        <div className={styles.recordColumn}>
          <div className={styles.recordCard}>
            <div className={styles.recordHeader}>
              <div className={styles.recordMain}>
                <span className={styles.jobIdTag}>{scenario.jobRecord.jobNumber}</span>
                <h4 className={styles.recordTitle}>{scenario.jobRecord.clientName}</h4>
                <span className={styles.recordAddress}>{scenario.jobRecord.address}</span>
              </div>
              <div className={styles.recordStatusBadge} style={{ color: scenario.jobRecord.statusColor }}>
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

            {/* Line Items & Total Math (for Quote changes) */}
            {scenario.jobRecord.lineItems && (
              <div className={styles.lineItemsSection}>
                <div className={styles.sectionHeading}>Itemized Scope & Math</div>
                <div className={styles.lineItemsList}>
                  {scenario.jobRecord.lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`${styles.lineItemRow} ${item.isNew ? styles.newItemGlow : ''}`}
                    >
                      <span className={styles.itemLabel}>
                        {item.isNew && <span className={styles.newTag}>+ NEW</span>}
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

            {/* Voice Memo Activity Feed */}
            {scenario.jobRecord.voiceFeed && (
              <div className={styles.voiceFeedSection}>
                <div className={styles.sectionHeading}>Job Activity Feed (Audit Log)</div>
                <div className={styles.feedCard}>
                  <div className={styles.feedHead}>
                    <span className={styles.audioBadge}>🎙️ {scenario.jobRecord.voiceFeed.duration}</span>
                    <span className={styles.feedTime}>{scenario.jobRecord.voiceFeed.timestamp}</span>
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
                <div className={styles.sectionHeading}>Punch List & Tasks</div>
                <ul className={styles.tasksList}>
                  {scenario.jobRecord.tasks.map((task, idx) => (
                    <li key={idx} className={styles.taskItem}>
                      <span className={styles.checkboxMock}>{task.done ? '✓' : ''}</span>
                      <span className={styles.taskText}>{task.text}</span>
                    </li>
                  ))}
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
                    <span className={styles.leadFactVal}>{scenario.jobRecord.leadDetails.phone}</span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Service</span>
                    <span className={styles.leadFactVal}>{scenario.jobRecord.leadDetails.service}</span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Requested Time</span>
                    <span className={styles.leadFactVal}>{scenario.jobRecord.leadDetails.requestedDate}</span>
                  </div>
                  <div className={styles.leadFact}>
                    <span className={styles.leadFactLabel}>Priority Triage</span>
                    <span className={styles.leadFactValHot}>{scenario.jobRecord.leadDetails.score}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Safety Notice */}
            {scenario.jobRecord.safetyNotice && (
              <div className={styles.safetyNoticeBox}>
                <span className={styles.safetyIcon}>🛡️</span>
                <span className={styles.safetyText}>{scenario.jobRecord.safetyNotice}</span>
              </div>
            )}

            {/* Action Bar */}
            <div className={styles.recordFooter}>
              <span className={styles.footerNote}>
                Syncs to Client Portal, Invoices & Crew in Real-Time
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
