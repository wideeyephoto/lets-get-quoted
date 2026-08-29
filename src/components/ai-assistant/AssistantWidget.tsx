'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAssistant } from './AssistantProvider';
import type { ActionCard, AssistantMessage, AssistantMessageImage } from '@/lib/ai-assistant/types';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';
import styles from './assistant.module.css';

interface ContextInfo {
  type: 'job' | 'client' | 'cash_flow' | 'schedule' | 'general';
  id?: string;
  label: string;
  prompts: string[];
}

const SPARKY_INTRO_MESSAGE =
  "Hey! I'm Sparky, your AI sidekick. I can draft quotes, add job change orders, check unpaid invoices, look up your schedule, or analyze supply receipts and site photos you attach here. What can I take off your plate?";

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
        label: 'Active Job Record',
        prompts: [
          'What is the current status of this job?',
          'Add a line item ($450 for drywall patch)',
          'Add a punch list task: Clean work area',
        ],
      };
    }

    const clientMatch = /\/dashboard\/clients\/([0-9a-fA-F-]{36})/.exec(pathname);
    if (clientMatch) {
      return {
        type: 'client',
        id: clientMatch[1],
        label: 'Active Client',
        prompts: [
          'What jobs has this client had with us?',
          'Draft a new quote for this client',
          'Look up client phone & address',
        ],
      };
    }

    if (pathname.startsWith('/dashboard/schedule')) {
      return {
        type: 'schedule',
        label: 'Schedule Board',
        prompts: [
          'What jobs are scheduled for today?',
          'Who is assigned to tomorrow’s route?',
          'Find the next open booking slot',
        ],
      };
    }

    if (pathname.startsWith('/dashboard/finance') || pathname.startsWith('/dashboard/cash-flow')) {
      return {
        type: 'cash_flow',
        label: 'Cash Flow & Money',
        prompts: [
          'Which invoices are currently unpaid?',
          'How much revenue was collected this month?',
          'Show me overdue customer balances',
        ],
      };
    }

    return {
      type: 'general',
      label: 'Contractor Dashboard',
      prompts: [
        'Draft a new quote ($1,200 for repair work)',
        'Check what invoices are unpaid',
        'Who is on the schedule today?',
        'Look up recent clients',
      ],
    };
  }, [pathname]);

  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: SPARKY_INTRO_MESSAGE,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<AssistantMessageImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setAttachedImage({
          data: dataUrl,
          mimeType: file.type || 'image/jpeg',
          previewUrl: dataUrl,
        });
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageFile(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen, scrollToBottom]);

  const handleSendMessage = useCallback(
    async (textToSend: string, imageToSend?: AssistantMessageImage | null) => {
      const trimmed = textToSend.trim();
      const img = imageToSend ?? attachedImage;
      if ((!trimmed && !img) || isLoading) return;

      const userMsg: AssistantMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed || (img ? 'Attached photo / receipt' : ''),
        image: img || undefined,
        imageUrl: img?.previewUrl,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setAttachedImage(null);
      setIsLoading(true);

      try {
        const payloadMessages = [...messages, userMsg].map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          image: m.image,
          imageUrl: m.imageUrl,
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
    [activeContext, attachedImage, isLoading, messages, pathname, router, scrollToBottom],
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
    handleSendMessage(input, attachedImage);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: SPARKY_INTRO_MESSAGE,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  return (
    <>
      {/* Compact Floating Trigger (Zero Clutter) */}
      {!isOpen ? (
        <div className={styles.triggerWrapper}>
          <button
            type="button"
            className={styles.floatingTrigger}
            onClick={toggleAssistant}
            aria-label="Open Sparky AI"
          >
            <SparkyAvatar size={38} expression="avatar" status="online" bordered={false} alt="Sparky" />
            <span className={styles.triggerName}>Sparky</span>
          </button>
        </div>
      ) : null}

      {/* Assistant Modal / Drawer */}
      {isOpen ? (
        <>
          <div className={styles.overlay} onClick={closeAssistant} aria-hidden="true" />
          <div className={styles.panel} role="dialog" aria-label="Sparky AI Assistant">
            {/* Header (Clean & Minimal) */}
            <div className={styles.header}>
              <div className={styles.headerTitle}>
                <SparkyAvatar
                  size={32}
                  expression={isLoading ? 'thinking' : 'avatar'}
                  status={isLoading ? 'thinking' : 'online'}
                  alt="Sparky"
                />
                <div className={styles.titleText}>Sparky</div>
              </div>
              <div className={styles.headerControls}>
                <button
                  type="button"
                  className={styles.lightningIconBtn}
                  onClick={handleClearHistory}
                  title="Clear chat"
                  aria-label="Clear chat"
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

            {/* Active Context Banner */}
            {activeContext.type !== 'general' && (
              <div className={styles.contextBar}>
                <span className={styles.contextPill}>
                  <span className={styles.contextDot} />
                  <span>{activeContext.label}</span>
                </span>
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
                      <SparkyAvatar size={28} expression="avatar" bordered={false} alt="Sparky" />
                    </div>
                  )}

                  {/* Render User Uploaded Photo */}
                  {(msg.imageUrl || msg.image?.previewUrl || msg.image?.data) ? (
                    <div className={styles.messageImageWrapper}>
                      <img
                        src={msg.imageUrl || msg.image?.previewUrl || msg.image?.data}
                        alt="Uploaded photo"
                        className={styles.messageImage}
                      />
                    </div>
                  ) : null}

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
                              <span>{card.linkLabel || 'View'}</span>
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
                    <SparkyAvatar size={28} expression="thinking" status="thinking" bordered={false} alt="Sparky thinking" />
                  </div>
                  <div className={styles.toolRunning}>
                    <div className={styles.spinner} />
                    <span>Sparky is on it...</span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer Input Area with Image Upload */}
            <div className={styles.footerContainer} onPaste={handlePaste}>
              {attachedImage ? (
                <div className={styles.attachedImageChip}>
                  <div className={styles.attachedThumbnailWrap}>
                    <img
                      src={attachedImage.previewUrl || attachedImage.data}
                      alt="Attached upload"
                      className={styles.attachedThumbnail}
                    />
                    <button
                      type="button"
                      onClick={() => setAttachedImage(null)}
                      className={styles.removeImageBtn}
                      title="Remove image"
                      aria-label="Remove image"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className={styles.attachedMeta}>
                    <span className={styles.attachedBadge}>📷 Image Attached</span>
                    <span className={styles.attachedHint}>Sparky can read receipts, plates &amp; damage</span>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className={styles.inputForm}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.attachBtn}
                  title="Upload receipt or job photo"
                  aria-label="Upload image"
                  disabled={isLoading}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={attachedImage ? 'Add a note (optional)...' : 'Ask Sparky or attach photo...'}
                  className={styles.inputField}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  className={styles.sendButton}
                  disabled={(!input.trim() && !attachedImage) || isLoading}
                  aria-label="Send message to Sparky"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
