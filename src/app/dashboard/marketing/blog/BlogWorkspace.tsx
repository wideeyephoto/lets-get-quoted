'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteBlogPost } from '@/lib/site-content';
import {
  countStates, postDateLabel, postState, POST_STATE_LABEL, todayKeyOf, type PostState,
} from '@/lib/marketing-status';
import { createBlogPostAction, generateBlogPostAction, setBlogReminderAction } from './actions';

/**
 * The post list.
 *
 * This used to be the list AND the editor: clicking a title expanded a full
 * form — title, excerpt, cover picker, a 14-row body — inside the row. So the
 * page was either a list you could scan or one post you could edit, never both,
 * and the "list" was a stack of collapsed accordions whose heights jumped every
 * time you opened one. Editing now has its own screen at /blog/[id]; this is a
 * list again.
 */

const FILTERS: { id: PostState | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'ready', label: 'Ready' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
];

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function BlogWorkspace({
  initialPosts,
  reminderWeeks,
  sectionEnabled,
  initialTopic,
  initialFilter,
  readOnly = false,
  basePath = '/dashboard',
}: {
  initialPosts: SiteBlogPost[];
  reminderWeeks: number;
  sectionEnabled: boolean;
  /** ?topic= — somebody pressed "Create blog post" on a seasonal topic. */
  initialTopic: string;
  /** ?status= — arrived from an overview tile. */
  initialFilter: PostState | 'all';
  /**
   * The logged-out demo. Everything that WRITES is withheld rather than
   * disabled: drafting a post calls a server action that starts with
   * requireOwnerContext, so a visible "Draft it with AI" button would spin and
   * then bounce a prospect to /login. Reading the list, filtering it and seeing
   * how posts are staged is the part worth showing, and all of that is local.
   */
  readOnly?: boolean;
  basePath?: string;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [topic, setTopic] = useState(initialTopic);
  const [filter, setFilter] = useState<PostState | 'all'>(initialFilter);
  const [reminder, setReminder] = useState(reminderWeeks);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // One clock for the whole render, so two rows can never disagree about
  // whether today is past a scheduled date.
  const today = useMemo(() => todayKeyOf(), []);
  const counts = useMemo(() => countStates(posts, today), [posts, today]);
  const shown = useMemo(
    () => (filter === 'all' ? posts : posts.filter((post) => postState(post, today) === filter)),
    [posts, filter, today],
  );

  function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
      } catch (error) {
        setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'That did not save. Please try again.' });
      } finally {
        setBusy(null);
      }
    });
  }

  // A new post goes STRAIGHT to its editor. Creating something and leaving the
  // person on a list, to find the thing they just made, is a step nobody wants.
  function openNewest(next: SiteBlogPost[]) {
    setPosts(next);
    const newest = next[0];
    if (newest) router.push(`/dashboard/marketing/blog/${newest.id}`);
  }

  return (
    <>
      {message ? (
        <p className={message.tone === 'bad' ? 'marketing-error' : 'blog-flash'} role="status">{message.text}</p>
      ) : null}

      {!sectionEnabled && posts.length > 0 ? (
        <p className="blog-warn">
          Your blog band is switched off on your website, so none of these are visible to anyone — publishing one
          won&apos;t change that. <Link href={`${basePath}/sites`}>Turn it on in the website builder →</Link>
        </p>
      ) : null}

      {readOnly ? null : (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>New blog post</h2>
        </div>
        <label className="cash-bill-field wide">
          <span>What should it be about?</span>
          <input
            id="blog-topic"
            value={topic}
            maxLength={200}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Fall gutter maintenance checklist — leave blank and AI picks a seasonal topic"
          />
        </label>
        <div className="marketing-actions">
          <button
            type="button"
            className="btn primary"
            disabled={pending && busy === 'generate'}
            onClick={() =>
              run('generate', async () => {
                const result = await generateBlogPostAction(topic);
                if (!result.ok) {
                  setMessage({ tone: 'bad', text: result.message });
                  return;
                }
                setTopic('');
                openNewest(result.posts);
              })
            }
          >
            {pending && busy === 'generate' ? 'Writing your draft…' : '✨ Draft it with AI'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={pending && busy === 'blank'}
            onClick={() => run('blank', async () => openNewest(await createBlogPostAction()))}
          >
            Write one myself
          </button>
        </div>
        <p className="field-note">
          Everything saves as a hidden draft. Nothing appears on your website until you publish it.
        </p>
      </section>
      )}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>Your posts</h2>
          <p className="job-meta">
            {counts.all === 0
              ? 'None yet'
              : `${counts.draft + counts.ready} ${counts.draft + counts.ready === 1 ? 'draft' : 'drafts'} · ${counts.scheduled} scheduled · ${counts.published} published`}
          </p>
        </div>

        {/* Filters, with their counts on them. A chip that says "Archived" and
            hides everything when pressed is a chip you press once. */}
        <div className="mkt-filters" role="group" aria-label="Filter posts by status">
          {FILTERS.map((entry) => {
            const count = entry.id === 'all' ? counts.all : counts[entry.id];
            const active = filter === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={`mkt-filter${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setFilter(entry.id)}
              >
                {entry.label} <span className="mkt-filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        {counts.all === 0 ? (
          <p className="empty-state">
            No posts yet. Draft one above — a few genuinely useful articles give Google more local pages to rank
            and give past customers a reason to come back.
          </p>
        ) : shown.length === 0 ? (
          <p className="empty-state">
            No {POST_STATE_LABEL[filter as PostState].toLowerCase()} posts.{' '}
            <button type="button" className="linklike" onClick={() => setFilter('all')}>Show all {counts.all}</button>
          </p>
        ) : (
          <ul className="mkt-post-list">
            {shown.map((post) => {
              const state = postState(post, today);
              const words = wordCount(post.body);
              return (
                <li key={post.id}>
                  <Link href={`${basePath}/marketing/blog/${post.id}`} className="mkt-post-row">
                    <span className="mkt-post-copy">
                      <strong>{post.title.trim() || 'Untitled post'}</strong>
                      <small>
                        {postDateLabel(post, today)}
                        {words > 0 ? ` · ${words} words` : ''}
                      </small>
                    </span>
                    {/* The word itself carries the state — the colour only
                        repeats it, so this reads the same in greyscale. */}
                    <span className={`mkt-state mkt-state-${state}`}>{POST_STATE_LABEL[state]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {readOnly ? null : (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>Reminders</h2>
        </div>
        <label className="cash-bill-field">
          <span>Remind me to publish</span>
          <select
            value={reminder}
            onChange={(event) => {
              const weeks = Number(event.target.value);
              setReminder(weeks);
              run('reminder', async () => {
                await setBlogReminderAction(weeks);
              });
            }}
          >
            <option value={0}>Off</option>
            <option value={2}>Every 2 weeks</option>
            <option value={4}>Every 4 weeks</option>
            <option value={8}>Every 8 weeks</option>
          </select>
          <small className="cash-bill-note">
            We&apos;ll nudge you on your dashboard when it&apos;s been this long since you last published. Keeping a
            blog current is one of the slowest and most reliable SEO moves there is.
          </small>
        </label>
      </section>
      )}
    </>
  );
}
