import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import { buildContactNameMap, getConversationMessages, listConversations } from '@/lib/messages';
import { sendReplyAction } from './actions';
import SaveButton from '@/components/save-button';

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function MessagesPage({ searchParams }: { searchParams: { thread?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const conversations = await listConversations(supabase, accountId);
  const activePhone = searchParams.thread ? normalizeUsPhone(searchParams.thread) ?? searchParams.thread : conversations[0]?.phone ?? null;

  const [messages, nameMap] = await Promise.all([
    activePhone ? getConversationMessages(supabase, accountId, activePhone) : Promise.resolve([]),
    buildContactNameMap(supabase, accountId),
  ]);
  const activeName = activePhone ? nameMap.get(activePhone) ?? null : null;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Messages</p>
          <h1 className="workspace-title">Text inbox</h1>
          <p className="workspace-lead">Every customer text and your replies, threaded in one place.</p>
        </div>
      </section>

      {conversations.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No conversations yet. When a customer texts you back, their message shows up here and you
            can reply right from this page.
          </p>
        </section>
      ) : (
        <section className="inbox-layout">
          <aside className="panel workspace-section-card inbox-list">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Conversations</p>
            </div>
            <div className="inbox-thread-list">
              {conversations.map((conversation) => (
                <Link
                  key={conversation.phone}
                  href={`/dashboard/messages?thread=${encodeURIComponent(conversation.phone)}`}
                  className={`inbox-thread-item${conversation.phone === activePhone ? ' is-active' : ''}`}
                >
                  <div className="inbox-thread-top">
                    <strong>{conversation.name ?? formatPhoneDashes(conversation.phone)}</strong>
                    <span className="inbox-thread-time">{formatTime(conversation.lastAt)}</span>
                  </div>
                  <p className="inbox-thread-preview">
                    {conversation.lastDirection === 'outbound' ? 'You: ' : ''}
                    {conversation.lastBody}
                  </p>
                </Link>
              ))}
            </div>
          </aside>

          <div className="panel workspace-section-card inbox-thread">
            {activePhone ? (
              <>
                <div className="section-heading workspace-section-heading compact-heading inbox-thread-head">
                  <div>
                    <h2>{activeName ?? formatPhoneDashes(activePhone)}</h2>
                    {activeName ? <p className="job-meta">{formatPhoneDashes(activePhone)}</p> : null}
                  </div>
                </div>

                <div className="inbox-messages">
                  {messages.length === 0 ? (
                    <p className="empty-state">No messages in this thread yet.</p>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`inbox-bubble inbox-bubble-${message.direction}`}>
                        <p>{message.body}</p>
                        <span className="inbox-bubble-time">{formatTime(message.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>

                <form action={sendReplyAction.bind(null, activePhone)} className="inbox-reply">
                  <textarea name="body" rows={2} placeholder="Type a reply…" required aria-label="Reply message" />
                  <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Send</SaveButton>
                </form>
              </>
            ) : (
              <p className="empty-state">Pick a conversation to read and reply.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
