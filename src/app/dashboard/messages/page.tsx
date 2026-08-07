import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { fullDate } from '@/lib/recurring-display';
import { conversationPreview, groupByDay, groupRuns, initialsFor, messageContext } from '@/lib/message-context';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import { buildContactNameMap, getConversationMessages, listConversations, markThreadRead } from '@/lib/messages';
import { listMessageTemplates } from '@/lib/message-templates';
import { sendReplyAction, createTemplateAction, deleteTemplateAction, startConversationAction, addPhoneAsClientAction } from './actions';
import QuickReplies from './QuickReplies';
import ComposeMessage from './ComposeMessage';
import AddAsCustomer from './AddAsCustomer';
import ScrollToLatest from './ScrollToLatest';
import SaveButton from '@/components/save-button';

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'reply', label: 'Needs reply' },
] as const;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { thread?: string; q?: string; filter?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const allConversations = await listConversations(supabase, accountId);

  // Filtering happens before the active thread is chosen, so opening the page
  // on "Unread" lands you in an unread thread rather than on an empty pane.
  const query = (searchParams.q ?? '').trim().toLowerCase();
  const filter = FILTERS.some((option) => option.key === searchParams.filter) ? searchParams.filter : 'all';
  const conversations = allConversations.filter((conversation) => {
    if (filter === 'unread' && conversation.unread === 0) return false;
    // "Needs reply" is a thread whose LAST message came from them. Anything
    // else is a conversation you have already had the last word in.
    if (filter === 'reply' && conversation.lastDirection !== 'inbound') return false;
    if (!query) return true;
    const name = (conversation.name ?? '').toLowerCase();
    return name.includes(query) || conversation.phone.includes(query) || (conversation.lastBody ?? '').toLowerCase().includes(query);
  });

  const activePhone = searchParams.thread
    ? normalizeUsPhone(searchParams.thread) ?? searchParams.thread
    : conversations[0]?.phone ?? null;
  // On a phone the two panes cannot sit side by side, so the page shows one at
  // a time: the list until you pick a thread, the thread after. That needs to
  // know whether a thread was CHOSEN or merely defaulted to — without the
  // distinction, landing on /dashboard/messages would drop a phone straight
  // into the newest conversation with no way back to the list.
  const threadChosen = Boolean(searchParams.thread);

  const [messages, nameMap] = await Promise.all([
    activePhone ? getConversationMessages(supabase, accountId, activePhone) : Promise.resolve([]),
    buildContactNameMap(supabase, accountId),
  ]);
  const activeName = activePhone ? nameMap.get(activePhone) ?? null : null;
  const templates = await listMessageTemplates(supabase, accountId);
  // Who they are and what this is about — the three tabs you used to have to
  // open to answer a text.
  const context = await messageContext(supabase, accountId, activePhone);
  const days = groupByDay(messages);

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
    <main className="wide-shell workspace-shell inbox-slate">
      {/* One header row rather than a hero band. An inbox is a working surface —
          the tall marketing hero pushed the first conversation below the fold on
          a laptop, which is the one thing this page exists to show. */}
      <header className="inbox-header">
        <div className="inbox-header-copy">
          <h1 className="workspace-title">Text inbox</h1>
          <p className="workspace-lead">Every customer text and your replies, threaded in one place.</p>
        </div>
        <div className="inbox-header-tools">
          {/* A GET form so search and filter live in the URL: a thread stays
              linkable, and the back button behaves. */}
          <form className="inbox-search" method="get">
            <svg className="inbox-search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
            <input type="search" name="q" defaultValue={searchParams.q ?? ''} placeholder="Search conversations…" aria-label="Search conversations" />
            {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
          </form>
          <div className="inbox-filters" role="group" aria-label="Filter conversations">
            {FILTERS.map((option) => {
              const params = new URLSearchParams();
              if (option.key !== 'all') params.set('filter', option.key);
              if (searchParams.q) params.set('q', searchParams.q);
              const href = params.toString() ? `/dashboard/messages?${params}` : '/dashboard/messages';
              return (
                <Link
                  key={option.key}
                  href={href}
                  className={`inbox-filter${filter === option.key ? ' is-active' : ''}`}
                  aria-current={filter === option.key ? 'true' : undefined}
                >
                  {option.label}
                  {option.key === 'unread' && totalUnread > 0 ? <span className="inbox-filter-count">{totalUnread}</span> : null}
                </Link>
              );
            })}
          </div>
          <ComposeMessage contacts={contacts} action={startConversationAction} />
        </div>
      </header>

      {conversations.length === 0 ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No conversations yet. When a customer texts you, their message shows up here — or start
            one yourself with the button above.
          </p>
        </section>
      ) : (
        <section className={`inbox-layout${threadChosen ? ' show-thread' : ' show-list'}`}>
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
                  // Picking a conversation is a navigation, and the router's
                  // default is to scroll a new page to the top — so the inbox
                  // jumped away from the list you just clicked. Nothing above
                  // the fold changed; only the pane beside it did.
                  scroll={false}
                >
                  <div className="inbox-thread-top">
                    <strong>{conversation.name ?? formatPhoneDashes(conversation.phone)}</strong>
                    <span className="inbox-thread-time">{formatTime(conversation.lastAt)}</span>
                  </div>
                  <p className="inbox-thread-preview">
                    {conversation.lastDirection === 'outbound' ? 'You: ' : ''}
                    {/* A photo-only text has no body, and previewing it as blank
                        reads as a bug rather than as a picture. */}
                    {conversationPreview(conversation.lastBody) ||
                      (conversation.lastHasMedia ? 'Sent a photo' : '')}
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
                <div className="inbox-thread-head">
                  <div className="inbox-thread-who">
                    {/* Only reachable on a phone, where it is the way back to
                        the list. On a laptop both panes are already on screen
                        and a Back link there would go nowhere useful. */}
                    <Link href="/dashboard/messages" className="inbox-back" scroll={false}>
                      <span aria-hidden="true">←</span> All conversations
                    </Link>
                    <h2>{activeName ?? formatPhoneDashes(activePhone)}</h2>
                    {/* The number is only a subtitle when the heading is a NAME.
                        Unnamed, the heading already IS the number and repeating
                        it reads as a rendering fault. */}
                    {activeName || context.job ? (
                      <p className="job-meta">
                        {activeName ? formatPhoneDashes(activePhone) : null}
                        {activeName && context.job ? ' · ' : null}
                        {context.job ? context.job.title : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="inbox-thread-actions">
                    {context.client ? (
                      <Link className="btn secondary" href={`/dashboard/clients/${context.client.id}`}>View customer</Link>
                    ) : null}
                    {context.job ? (
                      <Link className="btn secondary" href={`/dashboard/jobs/${context.job.id}`}>View job</Link>
                    ) : null}
                    <a className="btn secondary" href={`tel:${activePhone}`}>Call</a>
                  </div>
                </div>

                <div className="inbox-messages">
                  {messages.length === 0 ? (
                    <p className="empty-state">No messages in this thread yet.</p>
                  ) : (
                    days.map((day) => (
                      <div className="inbox-day" key={day.key}>
                        {/* A thread with no day breaks reads as one long argument
                            about nothing. */}
                        <p className="inbox-day-divider"><span>{day.label}</span></p>
                        {/* Runs, not messages. Six replies sent in the same minute
                            are one turn in the conversation — stamping each of
                            them with a time and a "Sent" made a thread read as a
                            receipt printout. The time is said once, at the end of
                            the run, and only the last bubble gets a tail. */}
                        {groupRuns(day.items).map((run) => {
                          const last = run.items[run.items.length - 1];
                          return (
                            <div className={`inbox-run inbox-run-${run.direction}`} key={run.items[0].id}>
                              {/* No avatar beside an incoming run. The bubbles
                                  carry the side on their own — blue right, black
                                  left — so the disc was a second answer to a
                                  question already answered, and the width it
                                  cost is width the message wanted. */}
                              <div className="inbox-run-stack">
                                {run.items.map((message, index) => (
                                  <div
                                    key={message.id}
                                    className={`inbox-bubble inbox-bubble-${message.direction}${index === run.items.length - 1 ? ' is-last' : ''}`}
                                  >
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
                                  </div>
                                ))}
                                <span className="inbox-run-time">
                                  {formatTime(last.created_at)}
                                  {run.direction === 'outbound' ? <> · Sent</> : null}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                  <ScrollToLatest threadKey={activePhone ?? ''} />
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

          {/* Who they are and what this is about. Nullable all the way down: a
              text can arrive from a number nobody in the book owns, and saying
              so beats an empty shell that reads as a stuck loading state. */}
          <aside className="panel workspace-section-card inbox-context">
            {context.client ? (
              <>
                <div className="inbox-ctx-block">
                  <p className="eyebrow">Customer</p>
                  <span className="inbox-ctx-avatar" aria-hidden="true">{initialsFor(context.client.name)}</span>
                  <strong className="inbox-ctx-name">{context.client.name}</strong>
                  <a className="inbox-ctx-phone" href={`tel:${context.client.phone ?? activePhone}`}>
                    {formatPhoneDashes(context.client.phone ?? activePhone ?? '')}
                  </a>
                  {context.client.email ? <span className="inbox-ctx-line">{context.client.email}</span> : null}
                  <Link className="btn secondary" href={`/dashboard/clients/${context.client.id}`}>View full profile</Link>
                </div>

                {context.job ? (
                  <div className="inbox-ctx-block">
                    <p className="eyebrow">Job details</p>
                    <div className="inbox-ctx-jobhead">
                      <strong>{context.job.title}</strong>
                      <span className={`inbox-ctx-status is-${context.job.status}`}>
                        {context.job.status === 'complete' ? 'Complete' : context.job.status === 'new_lead' ? 'New lead' : 'Scheduled'}
                      </span>
                    </div>
                    {context.job.scheduledFor ? (
                      <span className="inbox-ctx-line">
                        {fullDate(context.job.scheduledFor)}
                        {context.job.scheduledTime ? ` · ${context.job.scheduledTime.slice(0, 5)}` : ''}
                      </span>
                    ) : null}
                    {context.job.address ? <span className="inbox-ctx-line">{context.job.address}</span> : null}
                    {context.job.quotedAmount > 0 ? (
                      <span className="inbox-ctx-line">
                        <em>Estimated value</em> {formatMoney(context.job.quotedAmount)}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {context.invoice ? (
                  <div className="inbox-ctx-block">
                    <p className="eyebrow">Last invoice</p>
                    <Link className="inbox-ctx-invoice" href={`/dashboard/jobs/${context.invoice.jobId}`}>
                      <strong>{context.invoice.ref}</strong>
                      <span className={`inbox-ctx-status is-${context.invoice.status}`}>{context.invoice.status}</span>
                    </Link>
                    <span className="inbox-ctx-line">{formatMoney(context.invoice.total)}</span>
                  </div>
                ) : null}

                {context.client.notes ? (
                  <div className="inbox-ctx-block">
                    <p className="eyebrow">Notes</p>
                    <p className="inbox-ctx-notes">{context.client.notes}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="inbox-ctx-block">
                <p className="eyebrow">Customer</p>
                <span className="inbox-ctx-avatar is-unknown" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <circle cx="12" cy="8.6" r="3.6" />
                    <path d="M5.4 19.4a6.6 6.6 0 0 1 13.2 0" />
                  </svg>
                </span>
                {activePhone ? <strong className="inbox-ctx-name">{formatPhoneDashes(activePhone)}</strong> : null}
                <p className="ins-empty-note">
                  This number isn&rsquo;t in your customer book yet, so there&rsquo;s no job or history to show
                  beside it. Adding them as a client links it up.
                </p>
                {/* The sentence above has told people to do this for months with
                    nothing to press. */}
                {activePhone ? (
                  <AddAsCustomer phone={activePhone} action={addPhoneAsClientAction.bind(null, activePhone)} />
                ) : null}
              </div>
            )}
          </aside>
        </section>
      )}

      <section className="panel workspace-section-card">
        {/* Open in Slate: the mockup puts the saved replies on the page rather
            than behind a disclosure, and a canned reply you have to go looking
            for is one you retype instead. Still a <details> so the summary is
            still the way to put it away.
            Only when there ARE some — opening it on an empty account hands
            somebody a foot of blank panel and an add form they didn't ask for. */}
        <details className="workspace-details" open={templates.length > 0}>
          <summary className="workspace-details-summary">
            <span className="btn secondary">Saved replies{templates.length > 0 ? ` · ${templates.length}` : ''}</span>
            <span className="workspace-details-copy">Reuse common responses with one tap.</span>
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
