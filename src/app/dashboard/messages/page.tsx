import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import { buildContactNameMap, getConversationMessages, listConversations, markThreadRead } from '@/lib/messages';
import { listMessageTemplates } from '@/lib/message-templates';
import { sendReplyAction, createTemplateAction, deleteTemplateAction, startConversationAction } from './actions';
import QuickReplies from './QuickReplies';
import ComposeMessage from './ComposeMessage';
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
  const templates = await listMessageTemplates(supabase, accountId);

  // Opening a thread IS reading it. Done after the messages are loaded so the
  // ones being marked are the ones on screen, and after `conversations` so the
  // list still shows the badge that was there when they clicked it.
  if (activePhone) await markThreadRead(supabase, accountId, activePhone);

  // Everyone this account has a number for, for the compose picker. Reuses the
  // same name map the threads use, so a customer is called the same thing in
  // both places.
  const contacts = [...nameMap.entries()]
    .map(([phone, name]) => ({ phone, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unread, 0);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Messages{totalUnread > 0 ? ` · ${totalUnread} unread` : ''}</p>
          <h1 className="workspace-title">Text inbox</h1>
          <p className="workspace-lead">Every customer text and your replies, threaded in one place.</p>
        </div>
        <ComposeMessage contacts={contacts} action={startConversationAction} />
      </section>

      {conversations.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No conversations yet. When a customer texts you, their message shows up here — or start
            one yourself with the button above.
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
                    {/* A photo-only text has no body, and previewing it as blank
                        reads as a bug rather than as a picture. */}
                    {conversation.lastBody || (conversation.lastHasMedia ? 'Sent a photo' : '')}
                  </p>
                  {conversation.unread > 0 ? (
                    <span className="inbox-unread" aria-label={`${conversation.unread} unread`}>{conversation.unread}</span>
                  ) : null}
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
                        {message.body ? <p>{message.body}</p> : null}
                        {(message.media_urls ?? []).length > 0 ? (
                          <div className="inbox-bubble-media">
                            {(message.media_urls ?? []).map((url) => (
                              // Opens full size in a new tab; the thumbnail stays
                              // small so a thread of photos still scans as a
                              // conversation rather than a gallery.
                              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Photo from the customer" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                        <span className="inbox-bubble-time">{formatTime(message.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="inbox-reply-area">
                  <QuickReplies templates={templates} targetId="reply-body" />
                  <form action={sendReplyAction.bind(null, activePhone)} className="inbox-reply">
                    <textarea id="reply-body" name="body" rows={2} placeholder="Type a reply…" required aria-label="Reply message" />
                    <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Send</SaveButton>
                  </form>
                </div>
              </>
            ) : (
              <p className="empty-state">Pick a conversation to read and reply.</p>
            )}
          </div>
        </section>
      )}

      <section className="panel workspace-section-card">
        <details className="workspace-details">
          <summary className="workspace-details-summary">
            <span className="btn secondary">Saved replies{templates.length > 0 ? ` · ${templates.length}` : ''}</span>
            <span className="workspace-details-copy">Canned replies you can drop into a text in one tap.</span>
          </summary>
          <div className="template-manager">
            {templates.length > 0 ? (
              <div className="template-list">
                {templates.map((template) => (
                  <div className="template-row" key={template.id}>
                    <div className="template-row-main">
                      <strong>{template.title}</strong>
                      <span>{template.body}</span>
                    </div>
                    <form action={deleteTemplateAction.bind(null, template.id)}>
                      <button type="submit" className="linklike danger">Delete</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No saved replies yet. Add one below — like &ldquo;On my way&rdquo; or &ldquo;Running about 20 min late.&rdquo;</p>
            )}
            <form action={createTemplateAction} className="template-add-form">
              <input name="title" placeholder="Label (e.g. On my way)" required maxLength={40} aria-label="Reply label" />
              <textarea name="body" rows={2} placeholder="Full reply text…" required aria-label="Reply text" />
              <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">Add saved reply</SaveButton>
            </form>
          </div>
        </details>
      </section>
    </main>
  );
}
