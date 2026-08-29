'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAssistant } from './AssistantProvider';
import type { ActionCard, AssistantMessage } from '@/lib/ai-assistant/types';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';
import styles from './assistant.module.css';

interface ContextInfo {
  type: 'job' | 'client' | 'cash_flow' | 'schedule' | 'general';
  id?: string;
  label: string;
  prompts: string[];
}

export default function AssistantWidget() {
  const { isOpen, closeAssistant, toggleAssistant, initialPrompt, clearInitialPrompt } = useAssistant();
  const pathname = usePathname() || '';
  const router = useRouter();

  // Detect active screen context from current pathname
  const activeContext: ContextInfo = useMemo(() => {
    const jobMatch = /\/dashboard\/jobs\/([0-9a-fA-F-]{36})/.exec(pathname);
    if (jobMatch) {
      return {
        type: 'job',
        id: jobMatch[1],
        label: 'Active Job File',
        prompts: [
          'Add a $250 add-on line item for gutter guards',
          'Add checklist task: Pick up materials from depot',
          'Reschedule this job to tomorrow at 9 AM',
          'Mark this job complete',
          'Summarize this quote and items',
        ],
      };
    }

    const clientMatch = /\/dashboard\/clients\/([0-9a-fA-F-]{36})/.exec(pathname);
    if (clientMatch) {
      return {
        type: 'client',
        id: clientMatch[1],
        label: 'Client Profile',
        prompts: [
          'Draft a new $1,200 quote for this client',
          'Show this client’s past job history',
          'What is this client’s address and phone number?',
        ],
      };
    }

    if (pathname.includes('/cash-flow')) {
      return {
        type: 'cash_flow',
        label: 'Invoices & Cash Flow',
        prompts: [
          'Who owes unpaid invoices right now?',
          'What is my total outstanding revenue?',
          'Business performance summary',
        ],
      };
    }

    if (pathname.includes('/schedule')) {
      return {
        type: 'schedule',
        label: 'Calendar & Schedule',
        prompts: [
          'What jobs are scheduled this week?',
          'Do I have any open slots this Friday?',
          'Show upcoming job dates',
        ],
      };
    }

    return {
      type: 'general',
      label: 'Workspace',
      prompts: [
        'Draft a $1,500 quote for deck repair',
        'Who owes unpaid invoices?',
        'What jobs are scheduled this week?',
        'Search clients',
        'Business performance summary',
      ],
    };
  }, [pathname]);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "I’ve got the details. Tell me what happened and I’ll handle the paperwork.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen, scrollToBottom]);

  const handleSendMessage = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || isLoading) return;

      const userMsg: AssistantMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const payloadMessages = [...messages, userMsg].map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const res = await fetch('/api/dashboard/ai-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: payloadMessages,
            currentPath: pathname,
            activeRecord: activeContext.id
              ? {
                  type: activeContext.type,
                  id: activeContext.id,
                }
              : undefined,
          }),
        });

        const json = await res.json();

        if (json.ok && json.message) {
          setMessages((prev) => [...prev, json.message]);

          // If action updated current job, refresh page data seamlessly
          const hasMutatingAction = json.actionCards?.some((c: ActionCard) =>
            ['job_updated', 'quote_item_added', 'task_created'].includes(c.type),
          );
          if (hasMutatingAction) {
            router.refresh();
          }
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content: json.error || 'Sorry, I ran into a hiccup with that. Tell me again?',
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: 'Connection glitch while checking in. Tap to retry or message me again.',
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setTimeout(scrollToBottom, 50);
      }
    },
    [activeContext, isLoading, messages, pathname, router, scrollToBottom],
  );

  // If opened with an initial prompt from another page/component
  useEffect(() => {
    if (initialPrompt && isOpen) {
      handleSendMessage(initialPrompt);
      clearInitialPrompt();
    }
  }, [initialPrompt, isOpen, handleSendMessage, clearInitialPrompt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "I’ve got the details. Tell me what happened and I’ll handle the paperwork.",
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  // Option B top quick action buttons
  const handleQuickAction = (action: 'quote' | 'note' | 'unpaid') => {
    if (action === 'quote') {
      if (activeContext.type === 'client') {
        handleSendMessage('Draft a new quote for this client');
      } else {
        handleSendMessage('Draft a new quote (e.g. $1,200 for repair work)');
      }
    } else if (action === 'note') {
      handleSendMessage('Log a quick job note and update punch list');
    } else if (action === 'unpaid') {
      handleSendMessage('Check what invoices are unpaid right now');
    }
  };

  return (
    <>
      {/* Floating Trigger Capsule (Option B Style) */}
      {!isOpen ? (
        <div className={styles.triggerWrapper}>
          <div className={styles.ridingShotgunLabel} aria-hidden="true">
            <span>Riding shotgun</span>
            <svg viewBox="0 0 24 16" width="16" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2 C8 12, 16 12, 22 14 M18 10 L22 14 L18 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <button
            type="button"
            className={styles.floatingTrigger}
            onClick={toggleAssistant}
            aria-label="Open Sparky AI Assistant"
          >
            <div className={styles.triggerAvatar}>
              <SparkyAvatar size={34} expression="avatar" status="online" bordered={false} alt="Sparky mascot" />
            </div>
            <div className={styles.triggerName}>Sparky</div>
            <div className={styles.speechPill}>
              <span>Need anything?</span>
            </div>
          </button>
        </div>
      ) : null}

      {/* Assistant Modal / Drawer */}
      {isOpen ? (
        <>
          <div className={styles.overlay} onClick={closeAssistant} aria-hidden="true" />
          <div className={styles.panel} role="dialog" aria-label="Sparky - Your crew’s AI right hand">
            {/* Header (Option B: Riding shotgun) */}
            <div className={styles.header}>
              <div className={styles.headerTitle}>
                <SparkyAvatar
                  size={38}
                  expression={isLoading ? 'thinking' : 'avatar'}
                  status={isLoading ? 'thinking' : 'online'}
                  alt="Sparky"
                />
                <div>
                  <div className={styles.titleText}>Sparky</div>
                  <div className={styles.headerSubtitle}>Riding shotgun</div>
                </div>
              </div>
              <div className={styles.headerControls}>
                <button
                  type="button"
                  className={styles.lightningIconBtn}
                  onClick={handleClearHistory}
                  title="Clear conversation / Reset Sparky"
                  aria-label="Reset Sparky"
                >
                  <span className={styles.lightningGlyph}>⚡</span>
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={closeAssistant}
                  title="Close"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Option B Top Action Cards Bar */}
            <div className={styles.quickActionsBar} role="toolbar" aria-label="Sparky quick actions">
              <button
                type="button"
                className={styles.actionCardBtn}
                onClick={() => handleQuickAction('quote')}
                disabled={isLoading}
              >
                <span className={styles.actionIcon}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </span>
                <span>Draft a quote</span>
              </button>

              <button
                type="button"
                className={styles.actionCardBtn}
                onClick={() => handleQuickAction('note')}
                disabled={isLoading}
              >
                <span className={styles.actionIcon}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                </span>
                <span>Log a job note</span>
              </button>

              <button
                type="button"
                className={styles.actionCardBtn}
                onClick={() => handleQuickAction('unpaid')}
                disabled={isLoading}
              >
                <span className={styles.actionIcon}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0" />
                  </svg>
                </span>
                <span>Check what’s unpaid</span>
              </button>
            </div>

            {/* Active Context Banner */}
            {activeContext.type !== 'general' && (
              <div className={styles.contextBar}>
                <span className={styles.contextPill}>
                  <span className={styles.contextDot} />
                  <span>{activeContext.label}</span>
                </span>
                <span className={styles.contextNotice}>Live screen context linked</span>
              </div>
            )}

            {/* Messages Feed */}
            <div className={styles.messageFeed}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? styles.userMessageRow : styles.assistantMessageRow}
                >
                  {msg.role === 'assistant' && (
                    <div className={styles.avatarGutter}>
                      <SparkyAvatar size={30} expression="avatar" bordered={false} alt="Sparky" />
                    </div>
                  )}

                  <div className={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                    {msg.content}
                  </div>

                  {/* Render Action Cards */}
                  {msg.actionCards && msg.actionCards.length > 0 ? (
                    <div className={styles.cardList}>
                      {msg.actionCards.map((card, idx) => (
                        <div key={`${msg.id}-card-${idx}`} className={styles.actionCard}>
                          <div className={styles.cardHeader}>
                            <span className={styles.cardTitle}>{card.title}</span>
                            {card.badge ? <span className={styles.cardBadge}>{card.badge}</span> : null}
                          </div>
                          {card.description ? (
                            <div className={styles.cardDescription}>{card.description}</div>
                          ) : null}
                          {card.linkUrl ? (
                            <Link
                              href={card.linkUrl}
                              className={styles.cardLink}
                              onClick={closeAssistant}
                            >
                              <span>{card.linkLabel || 'View Details'}</span>
                              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              {isLoading ? (
                <div className={styles.assistantMessageRow}>
                  <div className={styles.avatarGutter}>
                    <SparkyAvatar size={30} expression="thinking" status="thinking" bordered={false} alt="Sparky thinking" />
                  </div>
                  <div className={styles.toolRunning}>
                    <div className={styles.spinner} />
                    <span>Sparky is on it... calculating & checking live records</span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer Input Area with Option B Styling */}
            <div className={styles.footerContainer}>
              <form onSubmit={handleSubmit} className={styles.inputForm}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.inputField}
                  placeholder="Message Sparky..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={!input.trim() || isLoading}
                  aria-label="Send message to Sparky"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </form>

              {/* Hanging Brass Dog Tag (Option B Signature) */}
              <div className={styles.brassTagAnchor} aria-hidden="true">
                <div className={styles.splitRing} />
                <div className={styles.brassMedallion} title="Sparky · Official Shop Dog Tag">
                  <span className={styles.brassLightning}>⚡</span>
                  <span className={styles.brassText}>SPARKY</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
