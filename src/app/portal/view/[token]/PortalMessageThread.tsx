'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { sendPortalMessageAction, markPortalMessagesReadAction, loadMorePortalMessagesAction } from './actions';
import MailIcon from '@/components/MailIcon';
import { PortalMessageForm } from './PortalMessageForm';
import type { PortalMessage } from '@/lib/client-portal';

type Props = {
  token: string;
  businessName: string;
  accountId: string;
  initialMessages: PortalMessage[];
  jobs?: Array<{ id: string; ref: string | null; scope: string | null }>;
};

function formatDay(value: string | null): string {
  if (!value) return '';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' });
}

export function PortalMessageThread({ token, businessName, accountId, initialMessages, jobs = [] }: Props) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialMessages.length >= 15);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark as read on mount and when messages change
  useEffect(() => {
    markPortalMessagesReadAction(token).catch(console.error);
  }, [token, messages.length]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('portal_messages_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sms_messages', filter: `account_id=eq.${accountId}` },
        (payload) => {
          const row = payload.new as any;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [{
              id: row.id,
              body: row.body,
              createdAt: row.created_at,
              direction: row.direction,
              sender: row.direction === 'inbound' ? 'You' : businessName,
              mediaUrls: row.media_urls || [], jobId: null, channel: row.channel ?? 'sms',
            } as PortalMessage, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_feed', filter: `account_id=eq.${accountId}` },
        (payload) => {
          const row = payload.new as any;
          if (row.visibility === 'public') {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [{
                id: row.id,
                body: row.body,
                createdAt: row.created_at,
                direction: 'outbound',
                sender: row.author || businessName,
                mediaUrls: [],
                jobId: row.job_id, channel: 'portal_note',
              } as PortalMessage, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, businessName]);

  const handleLoadOlder = async () => {
    if (isLoadingOlder || messages.length === 0) return;
    setIsLoadingOlder(true);
    try {
      const oldestDate = messages[messages.length - 1].createdAt;
      const olderMessages = await loadMorePortalMessagesAction(token, oldestDate);
      if (olderMessages.length < 15) {
        setHasMore(false);
      }
      setMessages((prev) => {
        const newMsgs = olderMessages.filter((om: PortalMessage) => !prev.some((pm) => pm.id === om.id));
        return [...prev, ...newMsgs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    } catch (err) {
      console.error('Failed to load older messages', err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleOptimisticAppend = (msg: string, jobId: string | null) => {
    setMessages((prev) => {
      return [{
        id: 'temp-' + Date.now(),
        body: msg,
        createdAt: new Date().toISOString(),
        direction: 'inbound',
        sender: 'You',
        mediaUrls: [],
        jobId: jobId, channel: 'portal_note',
      } as PortalMessage, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    // Scroll to bottom immediately
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  return (
    <>
      <div className="portal-message-thread" role="log" aria-live="polite" tabIndex={0} ref={scrollRef}>
        {hasMore && (
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <button 
              onClick={handleLoadOlder} 
              disabled={isLoadingOlder}
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              {isLoadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        
        {[...messages].reverse().map((msg) => (
          <div
            key={msg.id}
            className={`portal-message-bubble ${msg.direction === 'inbound' ? 'inbound' : 'outbound'}`}
          >
            <div className="portal-message-meta">
              <span>{msg.sender}</span>
              <span>{formatDay(msg.createdAt)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
            {msg.mediaUrls && msg.mediaUrls.length > 0 ? (
              <div className="portal-message-media">
                {msg.mediaUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="portal-message-media-link">
                    <span aria-hidden="true">📷</span> Attachment #{i + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {messages.length === 0 && (
          <p className="empty-state" style={{ margin: '0.5rem 0 1rem' }}>No message history yet. Write to {businessName} below anytime.</p>
        )}
      </div>

      <div className="portal-message-form-wrapper">
        <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
          Ask a question or request service
        </p>
        <PortalMessageForm
          token={token}
          businessName={businessName}
          jobs={jobs}
          onOptimisticSend={handleOptimisticAppend}
        />
      </div>
    </>
  );
}
