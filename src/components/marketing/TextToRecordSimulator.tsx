'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './text-to-record-simulator.module.css';

export type ExtractedEntity = {
  id: string;
  wordIndices: number[]; // index range of words in the sentence
  label: string;
  category: string;
  color: 'cyan' | 'amber' | 'orange' | 'purple' | 'emerald';
  icon: string;
  targetRecord: string;
  filedField: string;
  filedValue: string;
  actionTaken: string;
  badge: string;
};

export type VoiceExtractionScenario = {
  id: string;
  tabLabel: string;
  icon: string;
  badge: string;
  title: string;
  speakerRole: string;
  audioDuration: string;
  words: string[];
  entities: ExtractedEntity[];
  summaryOutcome: {
    title: string;
    description: string;
    actionTag: string;
    ctaButton?: {
      label: string;
      successLabel: string;
    };
  };
};

const EXTRACTION_SCENARIOS: VoiceExtractionScenario[] = [
  {
    id: 'change-order',
    tabLabel: 'On-Site Change Order',
    icon: '💰',
    badge: 'Real-Time Quote Mutation',
    title: 'Contractor Adding $450 Change Order on Jobsite',
    speakerRole: 'Lead Contractor (Truck Bluetooth / Voice Memo)',
    audioDuration: '0:07',
    words: [
      'Hey',
      'Copilot,',
      'add',
      '$450',
      'to',
      'the',
      'Miller',
      'job',
      'at',
      '124',
      'Main',
      'for',
      'extra',
      '12/2',
      'Romex',
      'and',
      'a',
      'pantry',
      'GFCI',
      'outlet',
      'because',
      'the',
      'inspector',
      'requested',
      'it,',
      'and',
      'text',
      'Dave',
      'Miller',
      'the',
      'approval',
      'link.',
    ],
    entities: [
      {
        id: 'job-match',
        wordIndices: [6, 7, 9, 10], // Miller, job, 124, Main
        label: 'Miller · 124 Main',
        category: 'Job File Match',
        color: 'cyan',
        icon: '🎯',
        targetRecord: 'Job #J-104 · Miller Residence',
        filedField: 'Active Project Record',
        filedValue: '124 Main St, Royal Oak, MI',
        actionTaken: 'Zero destructive guesses. Matched active project record in 0.4s.',
        badge: 'Job File Locked',
      },
      {
        id: 'quote-math',
        wordIndices: [3], // $450
        label: '+$450.00',
        category: 'Quote & Balance Math',
        color: 'amber',
        icon: '💰',
        targetRecord: 'Quote & Invoice Ledger',
        filedField: 'Total Quote Adjusted',
        filedValue: 'Was $2,800.00 ➔ Now $3,250.00',
        actionTaken: 'Atomic transaction recalculated quote balance & invoice draft automatically.',
        badge: '+$450 Added',
      },
      {
        id: 'scope-material',
        wordIndices: [12, 13, 14, 17, 18, 19], // extra, 12/2, Romex, pantry, GFCI, outlet
        label: '12/2 Romex & GFCI',
        category: 'Itemized Scope Breakdown',
        color: 'orange',
        icon: '⚡',
        targetRecord: 'Line Item Inventory',
        filedField: 'Item #2: Electrical Line Item',
        filedValue: 'Pantry Dedicated Circuit & Outlet ($180 mat / $270 labor)',
        actionTaken: 'Itemized into materials and labor without typing line items at night.',
        badge: 'Scope Itemized',
      },
      {
        id: 'audit-reason',
        wordIndices: [22, 23], // inspector, requested
        label: 'Inspector Request',
        category: 'Audit Reason Log',
        color: 'purple',
        icon: '📋',
        targetRecord: 'Job Milestone History',
        filedField: 'Change Order Justification',
        filedValue: 'Building Code Compliance Sign-Off',
        actionTaken: 'Preserved permanent timestamped reason in customer portal activity feed.',
        badge: 'Reason Logged',
      },
      {
        id: 'client-sms',
        wordIndices: [27, 28, 30, 31], // Dave, Miller, approval, link
        label: 'Dave Miller · SMS Auth',
        category: '1-Tap Client Approval',
        color: 'emerald',
        icon: '📱',
        targetRecord: 'Client SMS Gateway',
        filedField: '10DLC Verified SMS Dispatch',
        filedValue: 'Link sent to Dave Miller (248-555-0182)',
        actionTaken: 'Drafted 1-tap customer authorization link. Customer can approve via Apple Pay.',
        badge: 'SMS Dispatched',
      },
    ],
    summaryOutcome: {
      title: 'Quote Total: $3,250.00 (+$450 Added)',
      description:
        'Contractor spoke for 7 seconds. Zero apps opened, zero manual data entry. Quote math, line items, job notes, and customer SMS approval were updated simultaneously in 1.4 seconds.',
      actionTag: '⚡ Atomic Transaction Confirmed',
      ctaButton: {
        label: 'Pay 1-Tap Authorize ($450.00)',
        successLabel: '✓ Customer Authorized ($450.00 Received)',
      },
    },
  },
  {
    id: 'lead-capture',
    tabLabel: 'Walk-Up Lead Brain Dump',
    icon: '⚡',
    badge: 'Instant Lead Intake',
    title: 'Capturing a New Customer Lead While Loading the Truck',
    speakerRole: 'Contractor Dictating at Supply House (Bluetooth)',
    audioDuration: '0:06',
    words: [
      'New',
      'lead',
      'from',
      'the',
      'supply',
      'house:',
      'Sarah',
      'Jenkins',
      'at',
      '512-555-0194',
      'needs',
      'a',
      'tankless',
      'water',
      'heater',
      'replacement',
      'for',
      'urgent',
      'install',
      'this',
      'Friday',
      'morning.',
    ],
    entities: [
      {
        id: 'lead-contact',
        wordIndices: [6, 7, 9], // Sarah, Jenkins, 512-555-0194
        label: 'Sarah Jenkins · 512-555-0194',
        category: 'Client & Phone Profile',
        color: 'cyan',
        icon: '👤',
        targetRecord: 'Customer Directory',
        filedField: 'New Client File',
        filedValue: 'Sarah Jenkins · 512-555-0194 (Verified)',
        actionTaken: 'Created account contact, assigned trade tag, and formatted phone for SMS.',
        badge: 'Contact Saved',
      },
      {
        id: 'lead-scope',
        wordIndices: [12, 13, 14, 15], // tankless, water, heater, replacement
        label: 'Tankless Water Heater',
        category: 'Trade Scope & Specs',
        color: 'orange',
        icon: '🔥',
        targetRecord: 'Quote Proposal Staging',
        filedField: 'Equipment Specification',
        filedValue: 'Navien NPE-240A2 Gas Tankless Unit',
        actionTaken: 'Staged estimate template with standard gas line sizing and venting kit.',
        badge: 'Equipment Staged',
      },
      {
        id: 'lead-urgency',
        wordIndices: [17, 18], // urgent, install
        label: 'Urgent Install',
        category: 'Priority Triage Score',
        color: 'amber',
        icon: '🚨',
        targetRecord: 'Lead Triage Queue',
        filedField: 'Pipeline Priority Level',
        filedValue: 'Priority 1 · Emergency Equipment Replacement',
        actionTaken: 'Scored high urgency; placed at top of daily callback queue.',
        badge: 'Priority 1 Alert',
      },
      {
        id: 'lead-schedule',
        wordIndices: [19, 20, 21], // this, Friday, morning
        label: 'Friday Morning Window',
        category: 'Dispatch Calendar Block',
        color: 'emerald',
        icon: '📅',
        targetRecord: 'Dispatch & Crew Calendar',
        filedField: 'Hold Estimate Slot',
        filedValue: 'Friday 8:00 AM – 10:00 AM (Lead Plumber)',
        actionTaken: 'Tentatively held arrival window on schedule without booking collisions.',
        badge: 'Window Held',
      },
    ],
    summaryOutcome: {
      title: 'Lead Staged: Sarah Jenkins (Urgent Tankless Quote)',
      description:
        'New customer profile created, equipment specs staged, emergency urgency scored, and Friday estimate window reserved—all from a single 6-second sentence while carrying pipe.',
      actionTag: '✓ Lead Staged in Pipeline',
      ctaButton: {
        label: 'Send 1-Tap Quote Proposal to Sarah',
        successLabel: '✓ Quote Delivered to Sarah (512-555-0194)',
      },
    },
  },
  {
    id: 'punch-list',
    tabLabel: 'Gate Code & Crew Dispatch',
    icon: '📋',
    badge: 'Automated Crew Delegation',
    title: 'Logging Site Access Code & Assigning Field Crew',
    speakerRole: 'Job Superintendent Leaving Jobsite (Siri)',
    audioDuration: '0:08',
    words: [
      'Copilot,',
      'file',
      'gate',
      'code',
      '#4491',
      'for',
      'the',
      'Wilson',
      'project',
      'on',
      'Elm',
      'St,',
      'and',
      'assign',
      'Jake',
      'to',
      'finish',
      'drywall',
      'patching',
      'and',
      'touch',
      'up',
      'trim',
      'tomorrow',
      'at',
      '8',
      'AM.',
    ],
    entities: [
      {
        id: 'access-code',
        wordIndices: [2, 3, 4], // gate, code, #4491
        label: 'Gate Code #4491',
        category: 'Site Access Credentials',
        color: 'amber',
        icon: '🔑',
        targetRecord: 'Job Header & Field Guide',
        filedField: 'Permanent Site Credentials',
        filedValue: 'Front Security Gate PIN: #4491',
        actionTaken: 'Pinned gate code to job card; automatically shared with dispatched crew.',
        badge: 'Credentials Pinned',
      },
      {
        id: 'project-wilson',
        wordIndices: [7, 8, 10, 11], // Wilson, project, Elm, St
        label: 'Wilson · Elm St',
        category: 'Job File Resolution',
        color: 'cyan',
        icon: '📍',
        targetRecord: 'Job #J-108 · Wilson Remodel',
        filedField: 'Active Site Location',
        filedValue: '428 Elm St, Birmingham, MI',
        actionTaken: 'Mapped speech to active remodel file with zero ambiguity.',
        badge: 'Job Verified',
      },
      {
        id: 'punch-tasks',
        wordIndices: [17, 18, 20, 21, 22], // drywall, patching, touch, up, trim
        label: 'Drywall Patch & Trim',
        category: 'Punch List Extraction',
        color: 'orange',
        icon: '📋',
        targetRecord: 'Field Task Checklist',
        filedField: '2 Actionable Tasks Created',
        filedValue: '1) Finish drywall patch · 2) Baseboard trim touch-up',
        actionTaken: 'Parsed sentence into two distinct actionable checklist items.',
        badge: '2 Tasks Created',
      },
      {
        id: 'crew-assign',
        wordIndices: [13, 14, 23, 24, 25, 26], // assign, Jake, tomorrow, at, 8, AM
        label: 'Assign Jake · Tomorrow 8 AM',
        category: 'Crew SMS Dispatch',
        color: 'emerald',
        icon: '👷',
        targetRecord: 'Crew Dispatch Hub',
        filedField: 'Worker Task Push Notification',
        filedValue: 'Jake Miller (Field Crew) · Thu 8:00 AM',
        actionTaken: 'Dispatched task assignment with site address and gate code to crew mobile.',
        badge: 'Crew Notified',
      },
    ],
    summaryOutcome: {
      title: 'Tasks Assigned: Jake Dispatched for Tomorrow 8:00 AM',
      description:
        'Gate code pinned to job header, punch list split into discrete task items, and worker dispatched via automated SMS without opening an app or typing on a screen.',
      actionTag: '✓ Crew Dispatched Automatically',
      ctaButton: {
        label: 'View Jake’s Mobile Task Receipt',
        successLabel: '✓ Task Verified on Jake’s Mobile Feed',
      },
    },
  },
];

export default function TextToRecordSimulator() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('change-order');
  const [currentWordCount, setCurrentWordCount] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [isVoiceAudioPlaying, setIsVoiceAudioPlaying] = useState<boolean>(false);
  const [isActionCompleted, setIsActionCompleted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1x or 1.5x

  const scenario =
    EXTRACTION_SCENARIOS.find((s) => s.id === activeScenarioId) || EXTRACTION_SCENARIOS[0];

  const totalWords = scenario.words.length;
  const isComplete = currentWordCount >= totalWords;

  // Stream words in word by word
  useEffect(() => {
    setCurrentWordCount(0);
    setSelectedEntityId(null);
    setIsActionCompleted(false);
    setIsPlaying(true);
  }, [activeScenarioId]);

  useEffect(() => {
    if (!isPlaying || currentWordCount >= totalWords) return;

    const intervalMs = playbackSpeed === 1.5 ? 90 : 130;
    const timer = setTimeout(() => {
      setCurrentWordCount((prev) => prev + 1);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [isPlaying, currentWordCount, totalWords, playbackSpeed]);

  // Find which entity a word index belongs to (if any)
  function getEntityForWord(wordIndex: number): ExtractedEntity | undefined {
    return scenario.entities.find((e) => e.wordIndices.includes(wordIndex));
  }

  // Check if an entity is currently fully or partially revealed
  function isEntityActive(entity: ExtractedEntity): boolean {
    if (!isComplete) {
      // Is at least the last index of the entity revealed?
      const maxIndex = Math.max(...entity.wordIndices);
      return currentWordCount > maxIndex;
    }
    return true;
  }

  // Toggle voice speech simulation with Web Speech API
  function toggleVoiceSynthesis() {
    if (typeof window === 'undefined') return;

    if (isVoiceAudioPlaying) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsVoiceAudioPlaying(false);
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const sentenceText = scenario.words.join(' ');
      const utterance = new SpeechSynthesisUtterance(sentenceText);
      utterance.rate = playbackSpeed === 1.5 ? 1.2 : 1.0;
      utterance.pitch = 0.95;

      utterance.onstart = () => {
        setIsVoiceAudioPlaying(true);
        setCurrentWordCount(0);
        setIsPlaying(true);
      };

      utterance.onend = () => {
        setIsVoiceAudioPlaying(false);
      };

      utterance.onerror = () => {
        setIsVoiceAudioPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // Fallback if synthesis not supported
      replayStream();
    }
  }

  function replayStream() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsVoiceAudioPlaying(false);
    setCurrentWordCount(0);
    setIsPlaying(true);
    setSelectedEntityId(null);
  }

  return (
    <div className={styles.simulatorWrapper}>
      {/* Top Banner: Real-Time Acoustic & Extraction Pulse */}
      <div className={styles.topConduitBar}>
        <div className={styles.streamStatusGroup}>
          <div className={styles.micPulseOrb}>
            <span className={styles.micIcon}>🎙️</span>
            <span className={styles.pulseRing}></span>
          </div>
          <div className={styles.streamInfo}>
            <div className={styles.streamHeading}>
              <span className={styles.liveIndicator}>● LIVE CONVERSATION</span>
              <strong>{scenario.title}</strong>
            </div>
            <div className={styles.streamSub}>
              <span>{scenario.speakerRole}</span>
              <span className={styles.subDot}>•</span>
              <span>{scenario.audioDuration} Voice Memo</span>
            </div>
          </div>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className={styles.waveformContainer}>
          <div className={`${styles.equalizerBars} ${isPlaying && !isComplete ? styles.eqActive : ''}`}>
            <span style={{ height: '35%' }}></span>
            <span style={{ height: '70%' }}></span>
            <span style={{ height: '100%' }}></span>
            <span style={{ height: '55%' }}></span>
            <span style={{ height: '85%' }}></span>
            <span style={{ height: '40%' }}></span>
            <span style={{ height: '95%' }}></span>
            <span style={{ height: '60%' }}></span>
            <span style={{ height: '80%' }}></span>
            <span style={{ height: '45%' }}></span>
          </div>
          <span className={styles.codecTag}>AI Entity Parser Active</span>
        </div>
      </div>

      {/* 3 Interactive Scenario Picker Tabs */}
      <div className={styles.scenarioTabsBar}>
        <div className={styles.tabLabelGroup}>
          <span className={styles.tabHeadingTag}>Field Trade Scenarios:</span>
        </div>
        <div className={styles.tabButtonsRow}>
          {EXTRACTION_SCENARIOS.map((sc) => {
            const isActive = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                className={`${styles.scenarioTabBtn} ${isActive ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveScenarioId(sc.id)}
              >
                <span className={styles.tabIcon}>{sc.icon}</span>
                <span className={styles.tabTitleText}>{sc.tabLabel}</span>
                {isActive && <span className={styles.activeGlowPill}></span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dual-Column Interactive Stage */}
      <div className={styles.extractionStageGrid}>
        {/* Left Column: Word-by-Word Voice Sentence Stream & Entity Target Box */}
        <div className={styles.speechColumn}>
          <div className={styles.sentenceCard}>
            {/* Sentence Header */}
            <div className={styles.sentenceHeader}>
              <div className={styles.speakerPill}>
                <span className={styles.speakerDot}></span>
                <span>Contractor Speech Stream (Word by Word)</span>
              </div>
              <div className={styles.playbackControls}>
                <button
                  type="button"
                  onClick={toggleVoiceSynthesis}
                  className={`${styles.audioPlayBtn} ${isVoiceAudioPlaying ? styles.audioPlaying : ''}`}
                  title="Play browser voice audio"
                >
                  {isVoiceAudioPlaying ? '🔊 Pause Voice' : '🔈 Listen to Voice'}
                </button>
                <button
                  type="button"
                  onClick={replayStream}
                  className={styles.replayBtn}
                  title="Replay word-by-word extraction"
                >
                  ⏮ Replay
                </button>
                <button
                  type="button"
                  onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : 1))}
                  className={styles.speedBtn}
                  title="Toggle playback speed"
                >
                  {playbackSpeed}x
                </button>
              </div>
            </div>

            {/* Word-by-Word Interactive Display Area */}
            <div className={styles.wordsDisplayBox}>
              <div className={styles.wordsStreamFlow}>
                {scenario.words.map((word, idx) => {
                  const isVisible = idx < currentWordCount;
                  const isLatest = idx === currentWordCount - 1 && !isComplete;
                  const entity = getEntityForWord(idx);
                  const isExtracted = entity && isEntityActive(entity);
                  const isSelected = selectedEntityId === entity?.id;

                  if (!isVisible) {
                    return null;
                  }

                  return (
                    <span
                      key={idx}
                      className={`${styles.streamWord} ${isLatest ? styles.wordLatest : ''} ${
                        isExtracted ? styles[`wordEntity_${entity.color}`] : ''
                      } ${isSelected ? styles.wordSelected : ''}`}
                      onClick={() => entity && setSelectedEntityId(entity.id)}
                      title={entity ? `AI Target: ${entity.category} ➔ ${entity.targetRecord}` : undefined}
                    >
                      {word}
                    </span>
                  );
                })}

                {/* Animated Cursor */}
                {!isComplete && <span className={styles.streamingCursor}></span>}
              </div>

              {/* Real-time Extraction Status Bar */}
              <div className={styles.extractionProgressFoot}>
                <div className={styles.progressText}>
                  {isComplete ? (
                    <span className={styles.completeStatus}>
                      ✓ All <strong>{scenario.entities.length} entities</strong> successfully parsed &amp; filed to database
                    </span>
                  ) : (
                    <span>
                      Transcribing word <strong>{currentWordCount}</strong> of <strong>{totalWords}</strong>...
                    </span>
                  )}
                </div>
                <div className={styles.progressBarTrack}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${(currentWordCount / totalWords) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Extracted Tokens Quick Legend & Visual Beams Header */}
            <div className={styles.entityLegendBox}>
              <div className={styles.legendHead}>
                <span className={styles.legendTitle}>⚡ AI Extracted Tokens (Click token to trace filing destination):</span>
              </div>
              <div className={styles.entityChipsList}>
                {scenario.entities.map((entity) => {
                  const isActive = isEntityActive(entity);
                  const isSelected = selectedEntityId === entity.id;

                  return (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => setSelectedEntityId(isSelected ? null : entity.id)}
                      className={`${styles.entityChip} ${styles[`chip_${entity.color}`]} ${
                        isActive ? styles.chipActive : styles.chipPending
                      } ${isSelected ? styles.chipSelected : ''}`}
                    >
                      <span className={styles.chipIcon}>{entity.icon}</span>
                      <span className={styles.chipLabel}>{entity.label}</span>
                      <span className={styles.chipArrow}>➔ {entity.category}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Visual of Where Details are Filed Away in the Database */}
        <div className={styles.filingColumn}>
          <div className={styles.filingContainer}>
            <div className={styles.filingHeader}>
              <div className={styles.filingTitleGroup}>
                <span className={styles.dbIcon}>🗄️</span>
                <div>
                  <h4 className={styles.filingTitle}>Where Details Are Filed Away</h4>
                  <span className={styles.filingSubtitle}>Live database mutation records &amp; field routing</span>
                </div>
              </div>
              <span className={styles.liveSyncBadge}>● Real-Time Sync</span>
            </div>

            {/* Destination Filing Cards Grid */}
            <div className={styles.filingCardsGrid}>
              {scenario.entities.map((entity, index) => {
                const isActive = isEntityActive(entity);
                const isSelected = selectedEntityId === entity.id;

                return (
                  <div
                    key={entity.id}
                    className={`${styles.filingCard} ${styles[`filingCard_${entity.color}`]} ${
                      isActive ? styles.cardActive : styles.cardPending
                    } ${isSelected ? styles.cardSelected : ''}`}
                    onClick={() => setSelectedEntityId(isSelected ? null : entity.id)}
                  >
                    <div className={styles.cardTopRow}>
                      <div className={styles.cardTargetTag}>
                        <span className={styles.cardIcon}>{entity.icon}</span>
                        <strong className={styles.cardRecordName}>{entity.targetRecord}</strong>
                      </div>
                      <span className={styles.cardBadge}>
                        {isActive ? `✓ ${entity.badge}` : '⏳ Scanning...'}
                      </span>
                    </div>

                    <div className={styles.cardFieldRow}>
                      <span className={styles.cardFieldLabel}>{entity.filedField}:</span>
                      <strong className={styles.cardFieldValue}>{entity.filedValue}</strong>
                    </div>

                    <p className={styles.cardActionDescription}>{entity.actionTaken}</p>

                    {/* Beam Animation Connection Indicator */}
                    {isSelected && (
                      <div className={styles.activeBeamIndicator}>
                        <span>✨ Linked to spoken words in sentence</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary Outcome & 1-Tap Execution Box */}
            <div className={styles.outcomeSummaryCard}>
              <div className={styles.outcomeTopBanner}>
                <span className={styles.outcomeTag}>{scenario.summaryOutcome.actionTag}</span>
                <strong className={styles.outcomeTitleText}>{scenario.summaryOutcome.title}</strong>
              </div>
              <p className={styles.outcomeDescriptionText}>{scenario.summaryOutcome.description}</p>

              {scenario.summaryOutcome.ctaButton && (
                <button
                  type="button"
                  onClick={() => setIsActionCompleted((prev) => !prev)}
                  className={`${styles.interactiveOutcomeBtn} ${
                    isActionCompleted ? styles.outcomeBtnCompleted : ''
                  }`}
                >
                  {isActionCompleted
                    ? scenario.summaryOutcome.ctaButton.successLabel
                    : scenario.summaryOutcome.ctaButton.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
