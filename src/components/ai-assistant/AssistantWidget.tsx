'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAssistant } from './AssistantProvider';
import type { AssistantMessage, AssistantMessageImage } from '@/lib/ai-assistant/types';
import SparkyAvatar from '@/components/mascot/SparkyAvatar';
import CompanionPickerModal from './CompanionPickerModal';
import styles from './assistant.module.css';

interface ContextInfo {
  type: 'job' | 'client' | 'cash_flow' | 'schedule' | 'general';
  id?: string;
  label: string;
  prompts: string[];
}

export default function AssistantWidget() {
  const {
    isOpen,
    closeAssistant,
    toggleAssistant,
    initialPrompt,
    clearInitialPrompt,
    companionId,
    companionTrade,
    companion,
    openCompanionPicker,
  } = useAssistant();
  const pathname = usePathname() || '';

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
      content: companion.introMessage,
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<AssistantMessageImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Update initial welcome message if companion changes and chat is untouched
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [
          {
            id: 'welcome',
            role: 'assistant',
            content: companion.introMessage,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      return prev;
    });
  }, [companion]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [isOpen, messages, scrollToBottom]);

  // Handle outside messages or prompts passed via openAssistant(prompt)
  const handleSendMessage = useCallback(
    async (textToSend?: string, imageToAttach?: AssistantMessageImage | null) => {
      const promptText = (textToSend !== undefined ? textToSend : input).trim();
      const imgPayload = imageToAttach !== undefined ? imageToAttach : attachedImage;

      if (!promptText && !imgPayload) return;

      const userMessageId = `user-${Date.now()}`;
      const userMsg: AssistantMessage = {
        id: userMessageId,
        role: 'user',
        content: promptText,
        imageUrl: imgPayload?.previewUrl || imgPayload?.data,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setAttachedImage(null);
      setIsLoading(true);

      try {
        const response = await fetch('/api/ai-assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            context: {
              pathname,
              screenContext: activeContext,
            },
            image: imgPayload
              ? {
                  data: imgPayload.data,
                  mimeType: imgPayload.mimeType,
                }
              : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data = await response.json();
        const assistantMsg: AssistantMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply || "I couldn't process that command right now. Could you try rephrasing?",
          actionCards: data.actionCards,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error('Assistant error:', err);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `I'm having a little trouble connecting right now. You can still use the regular dashboard tools while I get back on line!`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, attachedImage, messages, pathname, activeContext]
  );

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
        content: companion.introMessage,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({
        data: reader.result as string,
        mimeType: file.type,
        previewUrl: URL.createObjectURL(file),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            setAttachedImage({
              data: reader.result as string,
              mimeType: file.type,
              previewUrl: URL.createObjectURL(file),
            });
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    }
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
            aria-label={`Open ${companion.name} Copilot`}
          >
            <div className={styles.triggerAvatarWrap}>
              <SparkyAvatar
                companionId={companionId}
                trade={companionTrade}
                size={34}
                expression="avatar"
                status="online"
                bordered={false}
                alt={companion.name}
              />
            </div>
            <div className={styles.triggerInfo}>
              <span className={styles.triggerName}>Copilot</span>
              <span className={styles.triggerBadge}>{companion.name}</span>
            </div>
          </button>
        </div>
      ) : null}

      {/* Companion Avatar Picker Modal */}
      <CompanionPickerModal />

      {/* Assistant Modal / Drawer */}
      {isOpen ? (
        <>
          <div className={styles.overlay} onClick={closeAssistant} aria-hidden="true" />
          <div className={styles.panel} role="dialog" aria-label={`${companion.name} Copilot`}>
            {/* Top Accent Rim */}
            <div className={styles.topAccentRim} />

            {/* Header (Polished & Brand-Aligned) */}
            <div className={styles.header}>
              <div className={styles.headerTitle}>
                <div
                  className={styles.headerAvatarWrap}
                  onClick={openCompanionPicker}
                  title="Click to switch companion avatar"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openCompanionPicker();
                    }
                  }}
                >
                  <SparkyAvatar
                    companionId={companionId}
                    trade={companionTrade}
                    size={36}
                    expression={isLoading ? 'thinking' : 'avatar'}
                    status={isLoading ? 'thinking' : 'online'}
                    alt={companion.name}
                  />
                  <span className={styles.headerAvatarBadge} title="Change Companion">✦</span>
                </div>
                <div className={styles.headerMeta}>
                  <div className={styles.titleRow}>
                    <span className={styles.titleText}>{companion.name}</span>
                    <span className={styles.copilotBadge}>{companion.badgeLabel}</span>
                  </div>
                  <div className={styles.statusRow}>
                    <span className={styles.statusDotLive} />
                    <span className={styles.statusLabel}>
                      {isLoading ? 'Crunching numbers...' : 'Ready on site & office'}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.headerControls}>
                <button
                  type="button"
                  className={styles.switchCompanionBtn}
                  onClick={openCompanionPicker}
                  title="Switch your AI Copilot companion avatar"
                >
                  <span>✦</span>
                  <span>Avatar</span>
                </button>

                {showClearConfirm ? (
                  <div className={styles.clearConfirmGroup}>
                    <span className={styles.clearConfirmText}>Reset chat?</span>
                    <button
                      type="button"
                      className={styles.clearConfirmYesBtn}
                      onClick={() => {
                        handleClearHistory();
                        setShowClearConfirm(false);
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className={styles.clearConfirmNoBtn}
                      onClick={() => setShowClearConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.clearTextBtn}
                    onClick={() => setShowClearConfirm(true)}
                    title="Clear chat history"
                    aria-label="Clear chat"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => {
                    setShowClearConfirm(false);
                    closeAssistant();
                  }}
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
                <span className={styles.contextNotice}>Context-aware assistance</span>
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
                      <SparkyAvatar
                        companionId={companionId}
                        trade={companionTrade}
                        size={28}
                        expression="avatar"
                        bordered={false}
                        alt={companion.name}
                      />
                    </div>
                  )}

                  <div className={styles.messageContentCol}>
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

                    {/* Render Starter Suggestions on Welcome Message */}
                    {msg.id === 'welcome' && messages.length === 1 && (
                      <div className={styles.starterSection}>
                        <div className={styles.starterLabel}>
                          <span className={styles.starterIcon}>⚡</span> Quick Starters
                        </div>
                        <div className={styles.starterGrid}>
                          {activeContext.prompts.map((promptText, pIdx) => (
                            <button
                              key={`prompt-${pIdx}`}
                              type="button"
                              className={styles.starterChip}
                              onClick={() => handleSendMessage(promptText)}
                              disabled={isLoading}
                            >
                              <span className={styles.starterChipIcon}>
                                {pIdx === 0 ? '📝' : pIdx === 1 ? '📋' : pIdx === 2 ? '📅' : '⚡'}
                              </span>
                              <span className={styles.starterChipText}>{promptText}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Render Action Cards */}
                    {msg.actionCards && msg.actionCards.length > 0 ? (
                      <div className={styles.cardList}>
                        {msg.actionCards.map((card, idx) => (
                          <div key={`${msg.id}-card-${idx}`} className={styles.actionCard}>
                            <div className={styles.cardHeader}>
                              <div className={styles.cardTitleWrap}>
                                <span className={styles.cardIcon}>⚡</span>
                                <span className={styles.cardTitle}>{card.title}</span>
                              </div>
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
                </div>
              ))}

              {isLoading ? (
                <div className={styles.assistantMessageRow}>
                  <div className={styles.avatarGutter}>
                    <SparkyAvatar
                      companionId={companionId}
                      trade={companionTrade}
                      size={28}
                      expression="thinking"
                      status="thinking"
                      bordered={false}
                      alt={`${companion.name} thinking`}
                    />
                  </div>
                  <div className={styles.toolRunning}>
                    <div className={styles.typingDots}>
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className={styles.toolRunningText}>{companion.name} is calculating...</span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer Omni-Input Capsule Area */}
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
                    <span className={styles.attachedHint}>{companion.name} can read receipts, plates &amp; damage</span>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className={styles.inputCapsule}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.attachBtn}
                  title="Attach job photo or supply receipt"
                  aria-label="Upload image"
                  disabled={isLoading}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="4" ry="4" />
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
                  placeholder={attachedImage ? 'Add a note or instruction...' : `Ask anything or tell ${companion.name} what to add to a job...`}
                  className={styles.inputField}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  className={`${styles.sendButton} ${input.trim() || attachedImage ? styles.sendButtonActive : ''}`}
                  disabled={(!input.trim() && !attachedImage) || isLoading}
                  aria-label={`Send message to ${companion.name}`}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
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
