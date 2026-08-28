'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAssistant } from './AssistantProvider';
import type { ActionCard, AssistantMessage } from '@/lib/ai-assistant/types';
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
        label: 'Active Job Page',
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
        label: 'Active Client Profile',
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
      label: 'Contractor Workspace',
      prompts: [
        'Draft a $1,500 quote for deck repair',
        'Who owes unpaid invoices?',
        'What jobs are scheduled this week?',
        'Search clients',
        'Business performance summary',
        'Go to Stripe payout settings',
      ],
    };
  }, [pathname]);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your contractor AI Assistant. I have live awareness of your active workspace and screen. What would you like to do?",
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
              content: json.error || 'Sorry, I encountered an issue processing that request.',
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
            content: 'Network error communicating with the assistant. Please try again.',
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
        content: "History cleared. How can I help you with this screen or workspace?",
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        type="button"
        className={styles.floatingTrigger}
        onClick={toggleAssistant}
        aria-label="Open Help Assistant"
      >
        <span className={styles.triggerIcon}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
          </svg>
        </span>
        <span>Help</span>
      </button>

      {/* Assistant Modal / Drawer */}
      {isOpen ? (
        <>
          <div className={styles.overlay} onClick={closeAssistant} aria-hidden="true" />
          <div className={styles.panel} role="dialog" aria-label="AI Contractor Assistant">
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerTitle}>
                <div className={styles.headerIcon}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                  </svg>
                </div>
                <div>
                  <div className={styles.titleText}>Contractor AI Assistant</div>
                  <div className={styles.headerSubtitle}>Powered by Gemini 3.7 Flash</div>
                </div>
              </div>
              <div className={styles.headerControls}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={handleClearHistory}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={closeAssistant}
                  title="Close"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Active Context Banner */}
            <div className={styles.contextBar}>
              <span className={styles.contextPill}>
                <span className={styles.contextDot} />
                <span>{activeContext.label}</span>
              </span>
              <span style={{ color: '#94a3b8', fontSize: '10px' }}>In-context aware</span>
            </div>

            {/* Quick Suggestion Chips */}
            <div className={styles.chipsContainer}>
              {activeContext.prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Messages Feed */}
            <div className={styles.messageFeed}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'user' ? styles.userMessage : styles.assistantMessage}
                >
                  <div className={msg.role === 'user' ? undefined : styles.assistantBubble}>
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
                <div className={styles.assistantMessage}>
                  <div className={styles.toolRunning}>
                    <div className={styles.spinner} />
                    <span>Processing request & executing live workspace tools...</span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <input
                ref={inputRef}
                type="text"
                className={styles.inputField}
                placeholder={
                  activeContext.type === 'job'
                    ? "Command for this job (e.g. 'Add $300 add-on for tile', 'Reschedule')..."
                    : "Ask or command (e.g. 'Draft $1,200 quote for Sarah')..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                className={styles.sendButton}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
