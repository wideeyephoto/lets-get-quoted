import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { fullDate } from '@/lib/recurring-display';
import { conversationPreview, groupByDay, groupRuns, initialsFor, messageContext } from '@/lib/message-context';
import { conversationLinkLabel, inboxEmptyState, type InboxFilter } from '@/lib/inbox-view';
import { linkifyMessage } from '@/lib/message-linkify';
import { formatPhoneDashes, normalizeUsPhone } from '@/lib/phone';
import { buildContactNameMap, getConversationMessages, listConversations, markThreadRead } from '@/lib/messages';
import { listMessageTemplates } from '@/lib/message-templates';
import { starterRepliesFor } from '@/lib/starter-replies';
import { sendReplyAction, createTemplateAction, deleteTemplateAction, startConversationAction, addPhoneAsClientAction } from './actions';
import SavedReplies from './SavedReplies';
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

/**
 * What a message body renders as.
 *
 * A texted link is 60-odd unbreakable characters, and the raw thing turned one
 * bubble into a five-line brick of hex on a phone. The anchor keeps the whole
 * URL; the bubble shows what it IS.
 */
function MessageBody({ body }: { body: string }) {
  const segments = linkifyMessage(body);
  return (
    <p>
      {segments.map((segment, index) =>
        segment.kind === 'link' ? (
          <a
            key={index}
            className="inbox-bubble-link"
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            title={segment.href}
          >
            {segment.label}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { thread?: string; q?: string; filter?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const allConversations = await listConversations(supabase, accountId);

  // Filtering happens before the active thread is chosen, so opening the page
  // on "Unread" lands you in an unread thread rather than on an empty pane.
  const rawQuery = (searchParams.q ?? '').trim();
  const query = rawQuery.toLowerCase();
  const filter: InboxFilter = FILTERS.some((option) => option.key === searchParams.filter)
    ? (searchParams.filter as InboxFilter)
    : 'all';
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
  const empty = inboxEmptyState({ total: allConversations.length, filter, query: rawQuery });

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
              linkable, and the back button behaves.

              THE ACTION AND THE BUTTON ARE BOTH LOAD-BEARING. This was a form
              with neither, relying on the browser to submit a lone text field
              on Enter — which it did not do here, so typing a name and pressing
              Enter reloaded the unfiltered inbox and threw the term away, while
              the same URL typed by hand filtered correctly. An explicit action
              takes the destination off the current URL (which carries ?thread=,
              a param a search must drop), and a real submit button means the
              form no longer depends on implicit submission at all — it is also
              the only way to run a search on a touch keyboard that offers
              "Go" in some browsers and nothing in others. */}
          <form className="inbox-search" method="get" action="/dashboard/messages" role="search">
            <svg className="inbox-search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
            <input type="search" name="q" defaultValue={rawQuery} placeholder="Search conversations…" aria-label="Search conversations" />
            {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
            <button type="submit" className="inbox-search-go">Search</button>
            {rawQuery ? (
              <Link
                className="inbox-search-clear"
                href={filter === 'all' ? '/dashboard/messages' : `/dashboard/messages?filter=${filter}`}
                aria-label="Clear search"
              >
                <span aria-hidden="true">×</span>
              </Link>
            ) : null}
          </form>
          <div className="inbox-filters" role="group" aria-label="Filter conversations">
            {FILTERS.map((option) => {
              const params = new URLSearchParams();
              if (option.key !== 'all') params.set('filter', option.key);
              if (rawQuery) params.set('q', rawQuery);
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

      {/* ONE SHAPE, ALWAYS. An empty result used to replace the whole workspace
          with a single panel, so searching for a name that matched nothing
          removed the list, the thread and the search box's own surroundings —
          the page reorganised itself around the fact that you had mistyped. The
          empty state now lives INSIDE the list, where the list would be. */}
      <section className={`inbox-layout${threadChosen ? ' show-thread' : ' show-list'}`}>
        <aside className="panel workspace-section-card inbox-list">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Conversations</p>
          </div>
          {conversations.length === 0 ? (
            <div className="inbox-empty">
              <p className="inbox-empty-title">{empty.title}</p>
              <p className="inbox-empty-body">{empty.body}</p>
              {empty.clear ? (
                <Link className="btn secondary" href="/dashboard/messages">Show all conversations</Link>
              ) : null}
            </div>
          ) : (
            <div className="inbox-thread-list">
              {conversations.map((conversation) => {
                const name = conversation.name ?? formatPhoneDashes(conversation.phone);
                const when = formatTime(conversation.lastAt);
                return (
                  <Link
                    key={conversation.phone}
                    href={`/dashboard/messages?thread=${encodeURIComponent(conversation.phone)}`}
                    className={`inbox-thread-item${conversation.phone === activePhone ? ' is-active' : ''}`}
                    // The row's own text is a name, a time, a clipped preview
                    // and sometimes a badge — read out in full, every row, when
                    // tabbing the list. The preview is still in the DOM and
                    // still read in browse mode; this is what the LINK says.
                    aria-label={conversationLinkLabel({ name, unread: conversation.unread, when })}
                    // Which conversation is open is a fact the list showed only
                    // in color. `page` rather than `true`: the thread is in the
                    // URL, so this really is the current page.
                    aria-current={conversation.phone === activePhone ? 'page' : undefined}
                    // Picking a conversation is a navigation, and the router's
                    // default is to scroll a new page to the top — so the inbox
                    // jumped away from the list you just clicked. Nothing above
                    // the fold changed; only the pane beside it did.
                    scroll={false}
                  >
                    <div className="inbox-thread-top">
                      <strong>{name}</strong>
                      <span className="inbox-thread-time">{when}</span>
                    </div>
                    <p className="inbox-thread-preview">
                      {conversation.lastDirection === 'outbound' ? 'You: ' : ''}
                      {/* A photo-only text has no body, and previewing it as blank
                          reads as a bug rather than as a picture. */}
                      {conversationPreview(conversation.lastBody) ||
                        (conversation.lastHasMedia ? 'Sent a photo' : '')}
                    </p>
                    {conversation.unread > 0 ? (
                      <span className="inbox-unread" aria-hidden="true">{conversation.unread}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
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
                                  {message.body ? <MessageBody body={message.body} /> : null}
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

              {/* The composer and everything that feeds it, in one block at the
                  foot of the thread. The saved-reply MANAGER used to be a panel
                  below the whole inbox — past 900px on a laptop — so adding a
                  canned reply meant scrolling the box you were adding it for
                  off the screen. */}
              <div className="inbox-reply-area">
                <SavedReplies
                  templates={templates}
                  starters={starterRepliesFor(activeName)}
                  targetId="reply-body"
                  createAction={createTemplateAction}
                  deleteAction={deleteTemplateAction}
                />
                <form action={sendReplyAction.bind(null, activePhone)} className="inbox-reply">
                  <textarea id="reply-body" name="body" rows={2} placeholder="Type a reply…" required aria-label="Reply message" />
                  <SaveButton className="btn primary" pendingLabel="Sending…" savedLabel="Sent ✓">Send</SaveButton>
                </form>
              </div>
            </>
          ) : (
            <>
              <p className="empty-state">Pick a conversation to read and reply.</p>
              {/* The manager, and only the manager — see canInsert. Moving
                  saved replies into the composer would otherwise have made
                  them unreachable on an account with no conversations yet,
                  which is exactly when somebody sits down to write them. */}
              <div className="inbox-reply-area">
                <SavedReplies
                  templates={templates}
                  targetId="reply-body"
                  createAction={createTemplateAction}
                  deleteAction={deleteTemplateAction}
                  canInsert={false}
                />
              </div>
            </>
          )}
        </div>

        {/* Who they are and what this is about. Nullable all the way down: a
            text can arrive from a number nobody in the book owns, and saying
            so beats an empty shell that reads as a stuck loading state.

            Only with a thread open. Without one there is nobody for it to
            describe, and it rendered "this number isn't in your customer book
            yet" beside a number that did not exist. */}
        {activePhone ? (
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
                <strong className="inbox-ctx-name">{formatPhoneDashes(activePhone)}</strong>
                <p className="ins-empty-note">
                  This number isn&rsquo;t in your customer book yet, so there&rsquo;s no job or history to show
                  beside it. Adding them as a client links it up.
                </p>
                {/* The sentence above has told people to do this for months with
                    nothing to press. */}
                <AddAsCustomer phone={activePhone} action={addPhoneAsClientAction.bind(null, activePhone)} />
              </div>
            )}
          </aside>
        ) : null}
      </section>

      {/* "Every text we send" — all 32 of them, written out — used to sit here,
          and it is the reason this page ran past 16,000px on a phone. It is
          reference material about what the AUTOMATIONS say, read once when you
          are deciding whether to switch one on, and it now lives on the page
          that holds those switches: /dashboard/automations#outgoing-texts. */}
    </main>
  );
}
