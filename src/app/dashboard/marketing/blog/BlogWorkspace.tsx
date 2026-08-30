'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteBlogPost } from '@/lib/site-content';
import {
  countStates, postDateLabel, postState, POST_STATE_LABEL, todayKeyOf, type PostState,
} from '@/lib/marketing-status';
import { blocksPublish, tradeDriftOf } from '@/lib/blog-trade-drift';
import {
  createBlogPostAction,
  generateBlogPostAction,
  setBlogReminderAction,
  updateBlogPostAction,
} from './actions';

/**
 * The post list.
 *
 * This used to be the list AND the editor: clicking a title expanded a full
 * form — title, excerpt, cover picker, a 14-row body — inside the row. So the
 * page was either a list you could scan or one post you could edit, never both,
 * and the "list" was a stack of collapsed accordions whose heights jumped every
 * time you opened one. Editing now has its own screen at /blog/[id]; this is a
 * list again with fast 1-click edit and publish actions.
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
  trade = '',
  publicBase = null,
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
  trade?: string;
  publicBase?: string | null;
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
    if (newest) router.push(`${basePath}/marketing/blog/${newest.id}`);
  }

  function publishPost(post: SiteBlogPost) {
    const drift = tradeDriftOf(post.trade, trade);
    if (blocksPublish(drift)) {
      router.push(`${basePath}/marketing/blog/${post.id}`);
      return;
    }

    run(`publish-${post.id}`, async () => {
      const updated = await updateBlogPostAction(post.id, { status: 'published' });
      setPosts(updated);
      setMessage({
        tone: 'ok',
        text: `Published "${post.title.trim() || 'Untitled post'}" to your website.`,
      });
    });
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

      {/* 1. Status Summary Strip */}
      <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Drafts</span>
          <strong className="mkt-tile-value">{counts.draft}</strong>
          <span className="mkt-tile-note">In progress</span>
        </article>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Ready</span>
          <strong className="mkt-tile-value">{counts.ready}</strong>
          <span className="mkt-tile-note">Ready to schedule</span>
        </article>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Scheduled</span>
          <strong className="mkt-tile-value">{counts.scheduled}</strong>
          <span className="mkt-tile-note">Upcoming release</span>
        </article>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Published</span>
          <strong className="mkt-tile-value">{counts.published}</strong>
          <span className="mkt-tile-note">Live on your website</span>
        </article>
      </div>

      {/* 2. Post Library First */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Post Library</p>
            <h2>Published &amp; Staged Articles</h2>
          </div>
          <p className="job-meta">
            {counts.all === 0
              ? 'None yet'
              : `${counts.draft + counts.ready} ${counts.draft + counts.ready === 1 ? 'draft' : 'drafts'} · ${counts.scheduled} scheduled · ${counts.published} published`}
          </p>
        </div>

        {/* Filters, with their counts on them. */}
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
            No posts yet. Generate an article with AI below — a few genuinely useful guides give Google local search authority and boost your SEO rankings.
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
              const liveUrl = publicBase && post.status === 'published' ? `${publicBase}/${post.slug}` : null;
              const isPublishing = pending && busy === `publish-${post.id}`;

              return (
                <li key={post.id}>
                  <div className="mkt-post-row">
                    <Link
                      href={`${basePath}/marketing/blog/${post.id}`}
                      className="mkt-post-copy"
                      title="Click to edit post"
                    >
                      <strong>{post.title.trim() || 'Untitled post'}</strong>
                      <small>
                        {postDateLabel(post, today)}
                        {words > 0 ? ` · ${words} words` : ''}
                      </small>
                    </Link>

                    <div className="mkt-post-actions">
                      <span className={`mkt-state mkt-state-${state}`}>{POST_STATE_LABEL[state]}</span>

                      <Link
                        href={`${basePath}/marketing/blog/${post.id}`}
                        className="btn secondary btn-sm"
                        aria-label={`Edit ${post.title.trim() || 'post'}`}
                      >
                        Edit
                      </Link>

                      {!readOnly && post.status !== 'published' ? (
                        <button
                          type="button"
                          className="btn primary btn-sm"
                          disabled={isPublishing}
                          onClick={() => publishPost(post)}
                          aria-label={`Publish ${post.title.trim() || 'post'}`}
                        >
                          {isPublishing ? 'Publishing…' : 'Publish now'}
                        </button>
                      ) : null}

                      {liveUrl ? (
                        <a
                          href={liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn secondary btn-sm"
                          title="View on your live website"
                        >
                          View live ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Content Ideas & AI Generator (Second Section) */}
      {readOnly ? null : (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">AI Content Generator</p>
              <h2>Content Ideas &amp; Search Topics</h2>
            </div>
          </div>

          {/* Quick Idea Starters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: '0.76rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px' }}
              onClick={() => setTopic(`Seasonal Maintenance Checklist for ${trade || 'Homeowners'}`)}
            >
              🍁 Seasonal Maintenance Checklist
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: '0.76rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px' }}
              onClick={() => setTopic(`What Homeowners Should Know Before Hiring a ${trade || 'Contractor'}`)}
            >
              ⭐ Homeowner Hiring Guide
            </button>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: '0.76rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px' }}
              onClick={() => setTopic(`Signs Your Home Needs Urgent ${trade || 'Repair & Replacement'}`)}
            >
              ❓ Warning Signs FAQ
            </button>
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
              disabled={pending && (busy === 'generate' || busy === 'generate-publish')}
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
              disabled={pending && (busy === 'generate' || busy === 'generate-publish')}
              onClick={() =>
                run('generate-publish', async () => {
                  const result = await generateBlogPostAction(topic, true);
                  if (!result.ok) {
                    setMessage({ tone: 'bad', text: result.message });
                    return;
                  }
                  setTopic('');
                  setPosts(result.posts);
                  setMessage({
                    tone: 'ok',
                    text: `Generated and published "${result.title}" to your website!`,
                  });
                })
              }
            >
              {pending && busy === 'generate-publish' ? 'Publishing…' : '🚀 Draft & publish now'}
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
            Drafts stay hidden until published. &ldquo;Draft &amp; publish now&rdquo; makes the article live immediately.
          </p>
        </section>
      )}

      {/* 4. Publishing Reminders & Settings (Bottom) */}
      {readOnly ? null : (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Publication Settings</p>
              <h2>Publishing Reminders</h2>
            </div>
          </div>
          <label className="cash-bill-field">
            <span>Publishing frequency reminder</span>
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
              We&apos;ll remind you on your dashboard when it&apos;s been this long since you last published. Keeping a
              blog current is one of the most reliable organic SEO signals for local ranking.
            </small>
          </label>
        </section>
      )}
    </>
  );
}
