'use client';

import { useState, useEffect } from 'react';
import styles from './text-to-record-simulator.module.css';

export type HeroScenario = {
  id: string;
  tabLabel: string;
  icon: string;
  contractorInputType: 'text' | 'voice' | 'receipt';
  contractorSender: string;
  contractorText?: string;
  receiptDetails?: {
    vendor: string;
    date: string;
    items: { name: string; price: string }[];
    total: string;
  };
  voiceAudioDuration?: string;
  voiceTranscript?: string;
  aiResponse: string;
  jobNumber: string;
  clientName: string;
  address: string;
  dominantMetrics: {
    label: string;
    value: string;
    subtext?: string;
    type?: 'success' | 'highlight' | 'default';
  }[];
  lineItems?: { label: string; amount: string; isNew?: boolean }[];
  previousTotal?: string;
  updatedTotal?: string;
  costsSummary?: {
    totalRevenue: string;
    totalCosts: string;
    grossProfit: string;
    marginPercent: number;
    receiptItem: string;
    receiptAmount: string;
  };
  voiceFeed?: {
    duration: string;
    transcript: string;
    timestamp: string;
  };
  customerOutcome: {
    title: string;
    status: string;
    messageText: string;
    actionLabel?: string;
    approvedLabel?: string;
    hasInteractivePay?: boolean;
  };
};

const HERO_SCENARIOS: HeroScenario[] = [
  {
    id: 'change-order',
    tabLabel: 'Change order',
    icon: '💰',
    contractorInputType: 'text',
    contractorSender: 'You (Alert Phone)',
    contractorText: 'Add $450 to Miller job for extra 12/2 Romex line and GFCI outlet in pantry',
    aiResponse:
      '✅ Added $450.00 Electrical Line Item to Job J-104 (Miller). Total quote updated from $2,800 to $3,250.\nCustomer approval link prepared for Dave Miller.',
    jobNumber: 'J-104',
    clientName: 'Miller Residence',
    address: '124 Main St, Royal Oak, MI',
    dominantMetrics: [
      {
        label: 'Revenue Added',
        value: '+$450 captured',
        subtext: 'Extra Romex & GFCI',
        type: 'success',
      },
      {
        label: 'Quote Math',
        value: '$3,250',
        subtext: 'Was $2,800.00',
        type: 'highlight',
      },
      {
        label: 'Client Link',
        value: 'Approval ready',
        subtext: 'Dave Miller (SMS)',
        type: 'default',
      },
    ],
    lineItems: [
      { label: 'Kitchen Subpanel & Circuit Setup', amount: '$2,800.00' },
      { label: 'Extra 12/2 Romex & Pantry GFCI (via text)', amount: '$450.00', isNew: true },
    ],
    previousTotal: '$2,800.00',
    updatedTotal: '$3,250.00',
    customerOutcome: {
      title: 'Customer 1-Tap Authorization',
      status: 'SMS Link Ready',
      messageText:
        '“Hi Dave, Apex Electric added Change Order #1 ($450.00 for pantry 12/2 Romex line & GFCI outlet). Tap below to authorize with 1 tap.”',
      actionLabel: 'Pay 1-Tap Authorize ($450.00)',
      approvedLabel: '✓ Authorized & Paid via Apple Pay',
      hasInteractivePay: true,
    },
  },
  {
    id: 'voice-memo',
    tabLabel: 'Voice note',
    icon: '🎙️',
    contractorInputType: 'voice',
    contractorSender: 'You (Voice Memo MMS)',
    voiceAudioDuration: '0:09',
    voiceTranscript:
      '“Rough-in plumbing inspected and passed on Elm St. Waiting on drywall crew Thursday 8 AM.”',
    aiResponse:
      '🎙️ Logged Voice Memo to Job J-108 (Wilson - 428 Elm).\nMilestone: Rough Inspection Passed.\nDrywall crew queued for Thursday 8:00 AM arrival.',
    jobNumber: 'J-108',
    clientName: 'Wilson Remodel',
    address: '428 Elm St, Birmingham, MI',
    dominantMetrics: [
      {
        label: 'Inspection Milestone',
        value: 'Rough passed',
        subtext: 'Voice note verified',
        type: 'success',
      },
      {
        label: 'Next Scheduled Window',
        value: 'Thu 8:00 AM',
        subtext: 'Drywall crew arrival',
        type: 'highlight',
      },
      {
        label: 'Ledger Audit',
        value: 'Audio filed',
        subtext: '0:09 proof attached',
        type: 'default',
      },
    ],
    voiceFeed: {
      duration: '0:09 MMS Audio',
      transcript:
        '“Rough-in plumbing inspected and passed on Elm St. Waiting on drywall crew Thursday 8 AM.”',
      timestamp: 'Today at 3:14 PM · Alert Phone',
    },
    customerOutcome: {
      title: 'Automated Job & Crew Sync',
      status: 'Schedule Blocked',
      messageText:
        'Milestone recorded on Wilson job feed. Drywall crew notified for Thursday 8:00 AM on-site arrival without making a single phone call.',
    },
  },
  {
    id: 'receipt-ocr',
    tabLabel: 'Receipt',
    icon: '🧾',
    contractorInputType: 'receipt',
    contractorSender: 'You (Receipt Photo MMS)',
    contractorText: 'Home Depot receipt for Miller - 124 Main',
    receiptDetails: {
      vendor: 'THE HOME DEPOT #2741',
      date: 'Today · 2:45 PM',
      items: [
        { name: '3/4" x 100ft Blue PEX-A Tubing', price: '$84.90' },
        { name: 'SharkBite 3/4" Brass Tee (x4)', price: '$43.60' },
        { name: 'Pipe Clamps & Fasteners', price: '$20.00' },
      ],
      total: '$148.50',
    },
    aiResponse:
      '🧾 Logged $148.50 Home Depot receipt to Job J-104 (Miller).\nJob Material Costs: $620.00 | Total Quote: $3,250.00\nGross Profit: $2,630.00 (80.9% Margin).',
    jobNumber: 'J-104',
    clientName: 'Miller Residence',
    address: '124 Main St, Royal Oak, MI',
    dominantMetrics: [
      {
        label: 'Receipt OCR',
        value: '+$148.50 logged',
        subtext: 'Home Depot #2741',
        type: 'success',
      },
      {
        label: 'Gross Profit Margin',
        value: '80.9% margin',
        subtext: '$2,630.00 profit',
        type: 'highlight',
      },
      {
        label: 'Job Allocation',
        value: 'Miller (J-104)',
        subtext: 'Proof photo saved',
        type: 'default',
      },
    ],
    costsSummary: {
      totalRevenue: '$3,250.00',
      totalCosts: '$620.00',
      grossProfit: '$2,630.00',
      marginPercent: 80.9,
      receiptItem: 'Home Depot: 3/4" PEX & SharkBite Fittings',
      receiptAmount: '$148.50',
    },
    customerOutcome: {
      title: 'Real-Time Margin Protection',
      status: 'Cost Tracked',
      messageText:
        'Material cost itemized and deducted from job gross margin in real-time. Zero receipt slips lost in truck floorboards at tax time.',
    },
  },
];

export default function TextToRecordSimulator() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('change-order');
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(9);
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [customerApproved, setCustomerApproved] = useState(false);

  const scenario = HERO_SCENARIOS.find((s) => s.id === activeScenarioId) || HERO_SCENARIOS[0];

  // Stop speech playback on tab switch & reset approval
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingVoice(false);
    setVoiceSeconds(9);
    setCustomerApproved(false);
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
    setVoiceSeconds(9);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToSpeak =
        'Rough-in plumbing inspected and passed on Elm Street. Waiting on drywall crew Thursday 8 AM.';
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
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
      alert('Speech recognition is available in Chrome, Safari, and Edge.');
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

  return (
    <div className={styles.simulatorWrapper}>
      {/* Causal Sequence Story Banner */}
      <div className={styles.storyBanner}>
        <div className={styles.storySteps}>
          <div className={`${styles.storyStep} ${styles.storyStepActive}`}>
            <span className={styles.stepNum}>1</span>
            <span>Contractor texts change</span>
          </div>
          <span className={styles.stepArrow}>→</span>
          <div className={`${styles.storyStep} ${styles.storyStepActive}`}>
            <span className={styles.stepNum}>2</span>
            <span>
              {scenario.id === 'change-order'
                ? 'Quote increases by $450'
                : scenario.id === 'voice-memo'
                ? 'Milestone logged & scheduled'
                : 'Material margin captured'}
            </span>
          </div>
          <span className={styles.stepArrow}>→</span>
          <div className={`${styles.storyStep} ${styles.storyStepActive}`}>
            <span className={styles.stepNum}>3</span>
            <span>Customer approval is ready</span>
          </div>
        </div>
      </div>

      {/* 3 Scenario Tabs */}
      <div className={styles.tabBarContainer}>
        <div className={styles.tabBarLabelGroup}>
          <span className={styles.livePulseDot}></span>
          <span className={styles.tabBarLabel}>Select Field Scenario:</span>
        </div>
        <div className={styles.tabBar}>
          {HERO_SCENARIOS.map((sc) => {
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

      {/* Main Dual Column Workspace Frame */}
      <div className={styles.workspaceFrame}>
        {/* Left Column: Phone Device (Inbound Message) */}
        <div className={styles.phoneColumn}>
          <div className={styles.phoneDevice}>
            {/* Phone Top Notch */}
            <div className={styles.phoneTopBar}>
              <span className={styles.phoneTime}>9:41</span>
              <div className={styles.phoneIsland}>
                {isPlayingVoice && (
                  <span className={styles.islandEq}>
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                )}
              </div>
              <div className={styles.phoneSignals}>
                <span>5G</span>
                <span className={styles.signalIcon}>●●●●</span>
              </div>
            </div>

            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatAvatar}>⚡</div>
              <div className={styles.chatInfo}>
                <div className={styles.chatTitle}>AI Copilot · 24/7 Field Sidekick</div>
                <div className={styles.chatSub}>(248) 555-0199 · Active Line</div>
              </div>
              <div className={styles.headerIndicator}>
                <span className={styles.onlineDot}></span>
                <span className={styles.onlineText}>Online</span>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className={styles.chatBody}>
              <div className={styles.stepTag}>Step 1 · Contractor Message</div>

              {/* Scenario: Voice Note */}
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
                  <small className={styles.audioHint}>
                    {isPlayingVoice ? '🔊 Playing voice audio...' : 'Tap ▶ to hear voice note'}
                  </small>
                </div>
              )}

              {/* Scenario: Receipt OCR Photo */}
              {scenario.contractorInputType === 'receipt' && scenario.receiptDetails && (
                <div className={styles.contractorBubble}>
                  <div className={styles.senderTag}>{scenario.contractorSender}</div>
                  <div className={styles.receiptCard}>
                    <div className={styles.receiptBanner}>
                      <strong>{scenario.receiptDetails.vendor}</strong>
                      <span className={styles.receiptDate}>{scenario.receiptDetails.date}</span>
                    </div>
                    <div className={styles.receiptItemsList}>
                      {scenario.receiptDetails.items.map((item, idx) => (
                        <div key={idx} className={styles.receiptRow}>
                          <span>{item.name}</span>
                          <strong>{item.price}</strong>
                        </div>
                      ))}
                    </div>
                    <div className={styles.receiptTotalRow}>
                      <span>TOTAL</span>
                      <span>{scenario.receiptDetails.total}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Scenario: Standard Text */}
              {scenario.contractorInputType === 'text' && scenario.contractorText && (
                <div className={styles.contractorBubble}>
                  <div className={styles.senderTag}>{scenario.contractorSender}</div>
                  <p className={styles.bubbleText}>{scenario.contractorText}</p>
                </div>
              )}

              {/* AI Copilot Response */}
              <div className={styles.aiBubble}>
                <div className={styles.aiSenderTag}>
                  <span className={styles.aiGlowDot}></span>
                  AI Copilot Response
                </div>
                <p className={styles.aiResponseText}>{scenario.aiResponse}</p>
              </div>
            </div>

            {/* Input Bar */}
            <div className={styles.chatInputBar}>
              <button
                type="button"
                onClick={toggleLiveMic}
                className={`${styles.micBtn} ${isRecordingLive ? styles.micBtnActive : ''}`}
                title="Tap to speak live"
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

        {/* Right Column: Dominant Result & Outcome */}
        <div className={styles.recordColumn}>
          <div className={styles.recordCard}>
            {/* Record Header */}
            <div className={styles.recordHeader}>
              <div className={styles.recordMain}>
                <div className={styles.jobIdRow}>
                  <span className={styles.jobIdTag}>{scenario.jobNumber}</span>
                  <span className={styles.recordAddress}>{scenario.address}</span>
                </div>
                <h4 className={styles.recordTitle}>{scenario.clientName}</h4>
              </div>
            </div>

            {/* Dominant 3-Card Result Grid */}
            <div className={styles.dominantGrid}>
              {scenario.dominantMetrics.map((m, i) => (
                <div
                  key={i}
                  className={`${styles.dominantCard} ${
                    m.type === 'success'
                      ? styles.dominantCardSuccess
                      : m.type === 'highlight'
                      ? styles.dominantCardHighlight
                      : ''
                  }`}
                >
                  <span className={styles.dominantLabel}>{m.label}</span>
                  <strong className={styles.dominantValue}>{m.value}</strong>
                  {m.subtext && <span className={styles.dominantSubtext}>{m.subtext}</span>}
                </div>
              ))}
            </div>

            {/* Itemized Scope Math (Change Order Scenario) */}
            {scenario.lineItems && (
              <div className={styles.scopeSection}>
                <h5 className={styles.sectionHeading}>Itemized Scope & Math</h5>
                <div className={styles.lineItemsList}>
                  {scenario.lineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`${styles.lineItemRow} ${item.isNew ? styles.newItemGlow : ''}`}
                    >
                      <span className={styles.itemLabel}>
                        {item.isNew && <span className={styles.newTag}>+ NEW ITEM</span>}
                        {item.label}
                      </span>
                      <span className={styles.itemAmount}>{item.amount}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.totalRow}>
                  <div className={styles.totalLabel}>
                    <span>Updated Quote Total</span>
                    {scenario.previousTotal && (
                      <span className={styles.prevAmount}>Was {scenario.previousTotal}</span>
                    )}
                  </div>
                  <div className={styles.totalVal}>{scenario.updatedTotal}</div>
                </div>
              </div>
            )}

            {/* Voice Memo Activity Feed (Voice Note Scenario) */}
            {scenario.voiceFeed && (
              <div className={styles.voiceFeedCard}>
                <div className={styles.feedHead}>
                  <span className={styles.audioBadge}>🎙️ {scenario.voiceFeed.duration}</span>
                  <span className={styles.feedTime}>{scenario.voiceFeed.timestamp}</span>
                </div>
                <p className={styles.feedTranscript}>{scenario.voiceFeed.transcript}</p>
              </div>
            )}

            {/* Real-time Material Costs & Margin (Receipt Scenario) */}
            {scenario.costsSummary && (
              <div className={styles.marginCard}>
                <div className={styles.marginHeader}>
                  <span>Real-Time Gross Profit Margin</span>
                  <span className={styles.marginValue}>
                    {scenario.costsSummary.marginPercent}%
                  </span>
                </div>
                <div className={styles.marginTrack}>
                  <div
                    className={styles.marginFill}
                    style={{ width: `${scenario.costsSummary.marginPercent}%` }}
                  />
                </div>
                <div className={styles.marginSub}>
                  <span>Revenue: {scenario.costsSummary.totalRevenue}</span>
                  <span>Costs: {scenario.costsSummary.totalCosts}</span>
                  <span className={styles.profitHighlight}>
                    Profit: {scenario.costsSummary.grossProfit}
                  </span>
                </div>
              </div>
            )}

            {/* Step 3: Customer Outcome Card */}
            <div className={styles.outcomeCard}>
              <div className={styles.outcomeHead}>
                <span className={styles.outcomeStepTag}>Step 3 · {scenario.customerOutcome.title}</span>
                <span className={styles.outcomeStatusPill}>{scenario.customerOutcome.status}</span>
              </div>
              <p className={styles.outcomeMessageText}>{scenario.customerOutcome.messageText}</p>

              {scenario.customerOutcome.hasInteractivePay && (
                <>
                  <button
                    type="button"
                    onClick={() => setCustomerApproved((prev) => !prev)}
                    className={`${styles.customerAuthorizeBtn} ${
                      customerApproved ? styles.customerAuthorizeApproved : ''
                    }`}
                  >
                    {customerApproved
                      ? scenario.customerOutcome.approvedLabel
                      : scenario.customerOutcome.actionLabel}
                  </button>
                  {customerApproved && (
                    <div className={styles.approvalNotice}>
                      ⚡ Instant confirmation alert delivered to contractor steering wheel!
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
