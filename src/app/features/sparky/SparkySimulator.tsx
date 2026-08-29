'use client';

import React, { useState } from 'react';
import styles from './sparky.module.css';

type Scenario = {
  id: string;
  tabLabel: string;
  contextLabel: string;
  userPrompt: string;
  sparkyThought: string;
  sparkyResponse: string;
  cardTitle: string;
  cardBadge: string;
  items?: { name: string; cost: string }[];
  totalLabel?: string;
  totalCost?: string;
  tasks?: { id: string; title: string; defaultDone: boolean }[];
  invoices?: { client: string; amount: string; daysOverdue: number; jobRef: string }[];
  clientDetails?: { name: string; phone: string; address: string; gateCode: string; pastJobs: string[] };
  photos?: { name: string; size: string; tag: string }[];
  reminder?: { text: string; time: string };
  primaryActionLabel: string;
};

const SCENARIOS: Scenario[] = [
  {
    id: 'walkup_estimate',
    tabLabel: '🚶 Walk-Up Estimate Brain Dump',
    contextLabel: 'Context: Estimate Walkthrough · On-Site Voice Intake',
    userPrompt: "🎙️ [Walking the job site]: \"Hey Sparky, starting an estimate for Miller at 84 Pine St. He wants a 12x16 paver patio, 4 inches of crushed gravel base, polymeric sand, plus ask if he wants low-voltage pathway lighting for $450. Labor is 2 days with 2 guys.\"",
    sparkyThought: "Listening to on-site brain dump -> Calculating materials (192 sq ft pavers, 3 tons gravel base, sand) -> Calculating labor (32 man-hours @ $65/hr) -> Structuring $450 lighting upsell...",
    sparkyResponse: "I sorted it all out for you! Created Quote #1049 for Miller at 84 Pine St. Itemized by Paver & Base Materials ($1,380), Masonry Labor ($2,080), and an optional $450 Low-Voltage Pathway Lighting Add-on. Total base quote: $3,460.00.",
    cardTitle: "Quote #1049 · Miller (84 Pine St)",
    cardBadge: "Send-Ready Quote",
    items: [
      { name: "12x16 Pavers + 3 Tons Crushed Gravel Base & Polymeric Sand", cost: "$1,380.00" },
      { name: "Site Prep, Excavation & Certified Masonry Labor (32 hrs)", cost: "$2,080.00" },
      { name: "✦ Optional Add-on: Low-Voltage LED Pathway Lighting (6 fixtures)", cost: "$450.00" },
    ],
    totalLabel: "Total Estimate (Base + Add-on)",
    totalCost: "$3,910.00",
    primaryActionLabel: "Review & Send to Miller via SMS",
  },
  {
    id: 'text_photos',
    tabLabel: '📸 Text Photos & Remind Me',
    contextLabel: 'Context: Inbound Text-to-Job from Truck',
    userPrompt: "📱 [Sent 2 Photos + Voice Memo]: \"At 142 Elm St, subfloor rot extends 6 feet past the tub. Remind me to quote 2 sheets of 3/4 plywood tomorrow at 7:30 AM.\"",
    sparkyThought: "Inbound MMS received -> Match address '142 Elm St' to Job #1039 -> Attaching 2 photos to job file -> Scheduling dashboard alert for tomorrow 7:30 AM...",
    sparkyResponse: "Sorted! I attached the 2 subfloor photos directly to Job #1039 (142 Elm St), logged the damage notes, and scheduled an alert for tomorrow at 7:30 AM to draft the plywood quote.",
    cardTitle: "Job #1039 · 2 Photos & Reminder Logged",
    cardBadge: "Auto-Sorted & Scheduled",
    photos: [
      { name: "subfloor-rot-bathroom.jpg", size: "1.8 MB", tag: "Bathroom Subfloor" },
      { name: "tub-framing-damage.jpg", size: "2.1 MB", tag: "Framing Inspection" },
    ],
    reminder: {
      text: "Draft change order quote: 2 sheets 3/4 T&G plywood + fasteners for 142 Elm St",
      time: "Tomorrow at 7:30 AM (Push + Dashboard Alert)",
    },
    primaryActionLabel: "View Job Photos & Scheduled Reminder",
  },
  {
    id: 'quote',
    tabLabel: '📝 Draft a Quote',
    contextLabel: 'Context: New Quote Intent',
    userPrompt: "Draft a $2,400 composite deck board replacement for Sarah Jenkins with a $450 solar post-cap lighting add-on.",
    sparkyThought: "Executing create_quote_or_job() -> Calculating line items, tax, and add-on structure...",
    sparkyResponse: "Done! I drafted Quote #1048 for Sarah Jenkins. It includes the base $2,400 deck repair plus an optional $450 solar post-cap lighting upsell.",
    cardTitle: "Quote #1048 · Sarah Jenkins",
    cardBadge: "Draft Ready",
    items: [
      { name: "Trex Composite Decking Boards (16ft)", cost: "$1,150.00" },
      { name: "Framing Fasteners & Hidden Clips", cost: "$250.00" },
      { name: "Tear-off & Certified Carpentry Labor (8 hrs)", cost: "$1,000.00" },
      { name: "✦ Optional Add-on: Solar Post-Cap LED Lighting (6 units)", cost: "$450.00" },
    ],
    totalLabel: "Total Quoted (Base + Add-on)",
    totalCost: "$2,850.00",
    primaryActionLabel: "Review & Send via SMS",
  },
  {
    id: 'active_job',
    tabLabel: '🔄 Update Active Job',
    contextLabel: 'Context: Job #1042 (Apex Roofing)',
    userPrompt: "Reschedule this active job to Friday at 9:00 AM and add an estimated 3 hours for chimney flashing prep.",
    sparkyThought: "Executing modify_active_job(id: 'job-1042', scheduledFor: '2026-09-04', scheduledTime: '09:00', estimatedHours: 8.5)...",
    sparkyResponse: "Updated Job #1042! The calendar slot has moved to Friday, Sep 4 at 9:00 AM, and total estimated duration is adjusted to 8.5 hours. Your crew calendar is updated.",
    cardTitle: "Job #1042 · Roof Replacement & Flashing",
    cardBadge: "Rescheduled · Fri 9:00 AM",
    items: [
      { name: "Client", cost: "Robert Sterling · (313) 555-0182" },
      { name: "Address", cost: "742 Evergreen Terrace, Royal Oak, MI" },
      { name: "New Time Slot", cost: "Friday, Sep 4 · 9:00 AM – 5:30 PM (8.5 hrs)" },
      { name: "Crew Assigned", cost: "Mike & Dave (Truck #2)" },
    ],
    primaryActionLabel: "Notify Customer via Text",
  },
  {
    id: 'tasks',
    tabLabel: '✅ Add Punch List Tasks',
    contextLabel: 'Context: Job #1039 (Master Bath Tile)',
    userPrompt: "Add checklist tasks: Pick up Schluter waterproofing membrane from depot and test drain slope.",
    sparkyThought: "Executing add_job_task(jobId: 'job-1039', tasks: ['Pick up Schluter membrane...', 'Test drain slope'])...",
    sparkyResponse: "Added 2 tasks to Job #1039’s punch list. Your crew can check these off directly from their mobile field link.",
    cardTitle: "Job #1039 Punch List",
    cardBadge: "2 New Tasks Added",
    tasks: [
      { id: 't1', title: "Demo existing tile and haul away debris", defaultDone: true },
      { id: 't2', title: "Pick up Schluter waterproofing membrane from depot", defaultDone: false },
      { id: 't3', title: "Test drain slope & water tightness before mortar", defaultDone: false },
    ],
    primaryActionLabel: "View Full Job Checklist",
  },
  {
    id: 'cash_flow',
    tabLabel: '💰 Check Unpaid Invoices',
    contextLabel: 'Context: Dashboard · Cash Flow & Revenue',
    userPrompt: "Who owes us overdue invoices right now?",
    sparkyThought: "Executing get_unpaid_invoices_and_payments() -> Scanning outstanding ledger balances...",
    sparkyResponse: "You have 2 overdue invoices totaling $3,450.00. Both clients received the initial invoice by SMS and have active cards on file.",
    cardTitle: "Unpaid Invoice Ledger",
    cardBadge: "$3,450.00 Total Overdue",
    invoices: [
      { client: "David Miller", amount: "$2,200.00", daysOverdue: 8, jobRef: "Job #1031 (Main Sewer Line)" },
      { client: "Oakwood Dental", amount: "$1,250.00", daysOverdue: 4, jobRef: "Job #1035 (HVAC Air Handler)" },
    ],
    primaryActionLabel: "Send 1-Tap SMS Payment Reminders",
  },
  {
    id: 'clients',
    tabLabel: '🔍 Look Up Client History',
    contextLabel: 'Context: Clients Directory',
    userPrompt: "What’s Marcus Vance’s phone number, gate code, and past job history?",
    sparkyThought: "Executing search_clients(query: 'Marcus Vance') -> Retrieving profile & job records...",
    sparkyResponse: "Here’s Marcus Vance’s profile! He’s a repeat customer with 2 completed jobs ($5,050 total lifetime value).",
    cardTitle: "Client Profile · Marcus Vance",
    cardBadge: "VIP Repeat Client",
    clientDetails: {
      name: "Marcus Vance",
      phone: "(248) 555-0144",
      address: "1842 Orchard Ridge Rd, Birmingham, MI",
      gateCode: "#4921 (Keypad on left pillar)",
      pastJobs: ["Job #1012: Cedar Privacy Fence ($4,200 · Paid)", "Job #1024: Gate Latch Reinforcement ($850 · Paid)"],
    },
    primaryActionLabel: "Start New Quote for Marcus",
  },
];

function playSparkySound(type: 'click' | 'toggle' | 'switch', enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'toggle') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(780, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'switch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.06);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    }
  } catch {
    // Ignore audio autoplay restrictions
  }
}

export default function SparkySimulator() {
  const [selectedId, setSelectedId] = useState<string>('walkup_estimate');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [taskState, setTaskState] = useState<Record<string, boolean>>({
    t1: true,
    t2: false,
    t3: false,
  });
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);

  const activeScenario = SCENARIOS.find((s) => s.id === selectedId) || SCENARIOS[0];

  function handleSelectScenario(id: string) {
    setSelectedId(id);
    playSparkySound('switch', soundEnabled);
  }

  function handleToggleTask(taskId: string) {
    setTaskState((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
    playSparkySound('toggle', soundEnabled);
  }

  function handleCopyPrompt() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(activeScenario.userPrompt);
      setCopiedPrompt(true);
      playSparkySound('click', soundEnabled);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  }

  return (
    <div className={styles.sparkySimulator}>
      {/* Header */}
      <div className={styles.simHeader}>
        <div className={styles.botMeta}>
          <div className={styles.sparkyAvatar}>⚡</div>
          <div>
            <div className={styles.botTitle}>
              <span>Sparky</span>
              <span className={styles.botBadge}>AI Contractor Sidekick</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            style={{
              background: soundEnabled ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: soundEnabled ? '#c084fc' : '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            aria-label={soundEnabled ? 'Mute sound' : 'Enable sound'}
          >
            <span>{soundEnabled ? '🔊 Sound: ON' : '🔇 Sound: OFF'}</span>
          </button>

          <div className={styles.screenContextIndicator}>
            <span className={styles.contextPulseDot} />
            <span>{activeScenario.contextLabel}</span>
          </div>
        </div>
      </div>

      {/* Preset Tab Selectors */}
      <div className={styles.tabsContainer} role="tablist" aria-label="Sparky Test Commands">
        {SCENARIOS.map((scenario) => {
          const isActive = scenario.id === selectedId;
          return (
            <button
              key={scenario.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleSelectScenario(scenario.id)}
              className={`${styles.promptTab} ${isActive ? styles.promptTabActive : ''}`}
            >
              {scenario.tabLabel}
            </button>
          );
        })}
      </div>

      {/* Chat & Live Execution Stage */}
      <div className={styles.chatStage}>
        {/* User Prompt */}
        <div className={`${styles.messageRow} ${styles.userRow}`}>
          <div className={styles.userBubble}>
            <div>{activeScenario.userPrompt}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleCopyPrompt}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: 'none',
                  color: '#f8fafc',
                  fontSize: '10.5px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {copiedPrompt ? '✓ Copied!' : '📋 Copy Prompt'}
              </button>
            </div>
          </div>
        </div>

        {/* Sparky Bot Response */}
        <div className={`${styles.messageRow} ${styles.botRow}`}>
          <div className={styles.botBubble}>
            <div className={styles.executingBanner}>
              <span className={styles.spinner} />
              <span>{activeScenario.sparkyThought}</span>
            </div>
            <p style={{ marginTop: '10px', marginBottom: '4px' }}>{activeScenario.sparkyResponse}</p>

            {/* Render Contextual Action Card */}
            <div className={styles.actionCard}>
              <div className={styles.actionCardHeader}>
                <div className={styles.actionCardTitle}>
                  <span>⚡</span>
                  <span>{activeScenario.cardTitle}</span>
                </div>
                <span className={styles.cardBadgeSuccess}>{activeScenario.cardBadge}</span>
              </div>

              {/* Photos & Reminder Display */}
              {activeScenario.photos && (
                <div className={styles.cardBody}>
                  <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Auto-Attached Photos
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', margin: '4px 0' }}>
                    {activeScenario.photos.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>📷</span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{p.tag}</div>
                          <div style={{ color: '#94a3b8', fontSize: '10.5px' }}>{p.name} · {p.size}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeScenario.reminder && (
                    <div
                      style={{
                        marginTop: '6px',
                        padding: '10px 12px',
                        background: 'rgba(124, 58, 237, 0.15)',
                        border: '1px solid rgba(124, 58, 237, 0.3)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ color: '#c084fc', fontWeight: 700, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>⏰ Scheduled Reminder</span>
                      </div>
                      <div style={{ color: '#ffffff', fontSize: '12.5px', marginTop: '2px', fontWeight: 500 }}>
                        {activeScenario.reminder.text}
                      </div>
                      <div style={{ color: '#a855f7', fontSize: '11px', marginTop: '2px' }}>
                        {activeScenario.reminder.time}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items List */}
              {activeScenario.items && (
                <div className={styles.cardBody}>
                  {activeScenario.items.map((item, idx) => (
                    <div key={idx} className={styles.itemRow}>
                      <span>{item.name}</span>
                      <strong>{item.cost}</strong>
                    </div>
                  ))}
                  {activeScenario.totalLabel && (
                    <div className={styles.itemTotalRow}>
                      <span>{activeScenario.totalLabel}</span>
                      <span style={{ color: '#34d399', fontSize: '14px' }}>{activeScenario.totalCost}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Interactive Tasks List */}
              {activeScenario.tasks && (
                <div className={styles.cardBody}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Tap any task below to simulate real-time crew check-off:
                  </div>
                  {activeScenario.tasks.map((task) => {
                    const isDone = taskState[task.id] !== undefined ? taskState[task.id] : task.defaultDone;
                    return (
                      <div
                        key={task.id}
                        onClick={() => handleToggleTask(task.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          background: isDone ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '6px',
                          border: isDone ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(255, 255, 255, 0.06)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => handleToggleTask(task.id)}
                          style={{ accentColor: '#10b981', cursor: 'pointer' }}
                        />
                        <span
                          style={{
                            textDecoration: isDone ? 'line-through' : 'none',
                            color: isDone ? '#94a3b8' : '#f1f5f9',
                            fontWeight: isDone ? 400 : 500,
                          }}
                        >
                          {task.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Invoices List */}
              {activeScenario.invoices && (
                <div className={styles.cardBody}>
                  {activeScenario.invoices.map((inv, idx) => (
                    <div key={idx} className={styles.itemRow}>
                      <div>
                        <strong>{inv.client}</strong> &middot; <small>{inv.jobRef}</small>
                        <div style={{ color: '#f87171', fontSize: '11px' }}>{inv.daysOverdue} days past due</div>
                      </div>
                      <strong style={{ color: '#f87171' }}>{inv.amount}</strong>
                    </div>
                  ))}
                </div>
              )}

              {/* Client Profile Details */}
              {activeScenario.clientDetails && (
                <div className={styles.cardBody}>
                  <div className={styles.itemRow}>
                    <span>Phone:</span>
                    <strong>{activeScenario.clientDetails.phone}</strong>
                  </div>
                  <div className={styles.itemRow}>
                    <span>Address:</span>
                    <strong>{activeScenario.clientDetails.address}</strong>
                  </div>
                  <div className={styles.itemRow}>
                    <span>Gate Code:</span>
                    <strong style={{ color: '#38bdf8' }}>{activeScenario.clientDetails.gateCode}</strong>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#94a3b8' }}>
                    <b>Past Jobs:</b>
                    <ul style={{ paddingLeft: '16px', margin: '4px 0 0' }}>
                      {activeScenario.clientDetails.pastJobs.map((j, i) => (
                        <li key={i}>{j}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className={styles.actionBtnRow}>
                <button
                  type="button"
                  onClick={() => playSparkySound('click', soundEnabled)}
                  className={styles.cardBtnPrimary}
                >
                  <span>{activeScenario.primaryActionLabel}</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
                <button
                  type="button"
                  onClick={() => playSparkySound('click', soundEnabled)}
                  className={styles.cardBtnSecondary}
                >
                  Open Full Record
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className={styles.simBottomBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={styles.modelBadge}>✦ Gemini 3.7 Flash</span>
          <span>Zero-latency tool execution & database mutation</span>
        </div>
        <div>
          <span>Included on every Let’s Get Quoted workspace</span>
        </div>
      </div>
    </div>
  );
}
