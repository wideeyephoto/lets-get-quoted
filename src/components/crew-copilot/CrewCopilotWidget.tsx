'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './crew-copilot.module.css';
import { getCompanion, type CompanionId } from '@/lib/ai-assistant/companions';
import type { AssistantMessage, AssistantToolCall } from '@/lib/ai-assistant/types';

interface CrewCopilotWidgetProps {
  crewName: string;
  businessName: string;
  companionId?: CompanionId;
  activeJobId?: string;
  activeJobRef?: string;
}

export default function CrewCopilotWidget({
  crewName,
  businessName,
  companionId = 'sparky',
  activeJobId,
  activeJobRef,
}: CrewCopilotWidgetProps) {
  const companion = getCompanion(companionId);
  const firstName = crewName.trim().split(/\s+/)[0] || 'there';

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ name: string; data: string; mimeType: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Initialize companion welcome message if conversation is empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          content: `Hey ${firstName}! I'm ${companion.name}, your AI field copilot for ${businessName}. Need directions to your next stop, gate or lockbox codes, or want me to log a note or check your hours? Just tap below or ask me!`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [companion.name, firstName, businessName, messages.length]);

  // Listen for open events dispatched by CrewWelcomeBanner or other buttons
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string }>;
      setIsOpen(true);
      if (customEvent.detail?.prompt) {
        const prompt = customEvent.detail.prompt;
        void sendMessage(prompt);
      }
    };

    window.addEventListener('open-crew-copilot', handleOpenEvent);
    return () => {
      window.removeEventListener('open-crew-copilot', handleOpenEvent);
    };
  }, [messages, activeJobId, activeJobRef, companionId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Lock body scroll on mobile when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Setup Web Speech API for voice dictation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript;
          if (transcript) {
            setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      alert('Speech-to-text is not supported on this browser. You can type your request below.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = recognitionRef.current as any;
    if (isListening) {
      rec.stop();
      setIsListening(false);
    } else {
      try {
        rec.start();
        setIsListening(true);
      } catch (err) {
        console.error('Speech recognition error:', err);
        setIsListening(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedImage({
        name: file.name,
        data: result,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query && !attachedImage) return;

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query || (attachedImage ? `[Attached Photo: ${attachedImage.name}]` : ''),
      createdAt: new Date().toISOString(),
      ...(attachedImage
        ? {
            image: {
              data: attachedImage.data,
              mimeType: attachedImage.mimeType,
            },
          }
        : {}),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    const currentAttachment = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/field/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
            image: m.image,
          })),
          activeJobId,
          activeJobRef,
          companionId,
          image: currentAttachment,
        }),
      });

      const data = await response.json();
      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I ran into an error: ${data.error || 'Unable to connect to field copilot.'}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Field Copilot communication error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Network connection issue. Please check your signal and try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Copilot Button (Visible when sheet is closed) */}
      {!isOpen && (
        <button
          type="button"
          className={styles.floatingTrigger}
          onClick={() => setIsOpen(true)}
          aria-label={`Open ${companion.name} Field Copilot`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={companion.avatarSrc}
            alt={companion.name}
            className={styles.triggerAvatar}
            width={32}
            height={32}
          />
          <span className={styles.triggerText}>Ask {companion.name}</span>
        </button>
      )}

      {/* Bottom Sheet Drawer Modal */}
      {isOpen && (
        <div className={styles.sheetOverlay} onClick={() => setIsOpen(false)}>
          <div className={styles.sheetContent} onClick={(e) => e.stopPropagation()}>
            {/* Sheet Header */}
            <div className={styles.sheetHeader}>
              <div className={styles.sheetHeaderLeft}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={companion.avatarSrc}
                  alt={companion.name}
                  className={styles.sheetAvatar}
                  width={36}
                  height={36}
                />
                <div className={styles.sheetHeaderMeta}>
                  <div className={styles.sheetTitle}>
                    {companion.name}
                    <span className={styles.copilotBadge}>Field Copilot</span>
                  </div>
                  <span className={styles.sheetSubtitle}>
                    {businessName}
                    {activeJobRef ? ` · Job #${activeJobRef}` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setIsOpen(false)}
                aria-label="Close copilot"
              >
                ✕
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className={styles.messagesArea}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.assistantRow}`}
                >
                  {/* Tool execution badge if present */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div>
                      {msg.toolCalls.map((tc: AssistantToolCall) => (
                        <div key={tc.id} className={styles.toolExecutionChip}>
                          <span>⚡</span> {formatToolCallTitle(tc.name)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={msg.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                    {renderFormattedContent(msg.content)}
                  </div>
                  <span className={styles.timestamp}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}

              {isLoading && (
                <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                  <div className={styles.typingIndicator}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Input Drawer */}
            <div className={styles.drawerFooter}>
              {/* Quick shortcut chips */}
              <div className={styles.drawerQuickChips}>
                <button
                  type="button"
                  className={styles.quickChip}
                  onClick={() => sendMessage("What's my next job?")}
                  disabled={isLoading}
                >
                  📍 Next Job
                </button>
                <button
                  type="button"
                  className={styles.quickChip}
                  onClick={() => sendMessage("What are the gate or lockbox codes for my jobs?")}
                  disabled={isLoading}
                >
                  🔑 Gate Codes
                </button>
                <button
                  type="button"
                  className={styles.quickChip}
                  onClick={() => sendMessage("Check my timecard and hours for this period")}
                  disabled={isLoading}
                >
                  ⏱️ Clock Status
                </button>
                <button
                  type="button"
                  className={styles.quickChip}
                  onClick={() => sendMessage("Clock me into my next job")}
                  disabled={isLoading}
                >
                  🟢 Clock In
                </button>
                <button
                  type="button"
                  className={styles.quickChip}
                  onClick={() => sendMessage("Clock me out of my shift")}
                  disabled={isLoading}
                >
                  🔴 Clock Out
                </button>
              </div>

              {attachedImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#818cf8', padding: '0 4px' }}>
                  <span>📷 Attached: {attachedImage.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}

              {/* Omni Capsule Input */}
              <form
                className={styles.inputCapsule}
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                {/* Photo attachment button */}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach jobsite photo"
                  aria-label="Attach jobsite photo"
                >
                  📷
                </button>

                {/* Voice speech-to-text dictation button */}
                <button
                  type="button"
                  className={`${styles.iconActionBtn} ${isListening ? styles.isListening : ''}`}
                  onClick={toggleSpeechRecognition}
                  title={isListening ? 'Stop listening' : 'Speak your request'}
                  aria-label={isListening ? 'Stop listening' : 'Speak your request'}
                >
                  🎙️
                </button>

                {/* Text input */}
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder={`Ask ${companion.name} about your jobs...`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoading}
                />

                {/* Submit button */}
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={isLoading || (!input.trim() && !attachedImage)}
                  aria-label="Send"
                >
                  ➤
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatToolCallTitle(toolName: string): string {
  switch (toolName) {
    case 'get_my_route_and_schedule':
      return 'Checked Route & Schedule';
    case 'get_job_access_and_details':
      return 'Retrieved Site Access & Gate Codes';
    case 'get_timecard_and_hours':
      return 'Checked Hours & Timecard';
    case 'clock_in_or_out':
      return 'Updated Time Clock';
    case 'add_job_note_or_task':
      return 'Added Job Note / Task';
    default:
      return 'Executed Field Action';
  }
}

function renderFormattedContent(content: string) {
  // Simple markdown renderer for bold, lists, and linebreaks
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', gap: '6px', marginLeft: '6px', marginBottom: '4px' }}>
              <span>•</span>
              <span>{renderBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (!trimmed) {
          return <div key={idx} style={{ height: '6px' }} />;
        }
        return <p key={idx}>{renderBold(line)}</p>;
      })}
    </>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
