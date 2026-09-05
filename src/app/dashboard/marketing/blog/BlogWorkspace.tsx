'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteBlogPost } from '@/lib/site-content';
import {
  countStates, postDateLabel, postState, POST_STATE_LABEL, todayKeyOf, type PostState,
} from '@/lib/marketing-status';
import { blocksPublish, tradeDriftOf } from '@/lib/blog-trade-drift';
import { wordCount } from '@/lib/blog-text';
import {
  createBlogPostAction,
  deleteBlogPostAction,
  duplicateBlogPostAction,
  bulkUpdateBlogPostsAction,
  generateBlogPostAction,
  setBlogReminderAction,
  updateBlogPostAction,
} from './actions';

/**
 * The post list workspace with full search, sorting, pagination, bulk operations,
 * and seamless AI generation.
 */

const FILTERS: { id: PostState | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'ready', label: 'Ready' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
];

const GENERATE_STEPS = [
  'Analyzing seasonal topic & trade…',
  'Writing article & local SEO headings…',
  'Selecting cover photo…',
  'Finalizing article…',
];

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
  readOnly?: boolean;
  basePath?: string;
  trade?: string;
  publicBase?: string | null;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [topic, setTopic] = useState(initialTopic);
  const [filter, setFilter] = useState<PostState | 'all'>(initialFilter);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title-asc' | 'title-desc' | 'updated'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reminder, setReminder] = useState(reminderWeeks);
  const [reminderSaved, setReminderSaved] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const [undoItem, setUndoItem] = useState<{ id: string; title: string } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [generateStep, setGenerateStep] = useState(0);
  const [pending, startTransition] = useTransition();

  // Dynamic today clock that refreshes so overnight sessions don't get stale
  const [today, setToday] = useState(() => todayKeyOf());
  useEffect(() => {
    const updateToday = () => {
      const fresh = todayKeyOf();
      setToday((cur) => (cur !== fresh ? fresh : cur));
    };
    const interval = setInterval(updateToday, 60000);
    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', updateToday);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', updateToday);
    };
  }, []);

  // Cycle progress messages during generation
  useEffect(() => {
    if (!pending || (!busy?.startsWith('generate'))) {
      setGenerateStep(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerateStep((prev) => (prev + 1) % GENERATE_STEPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [pending, busy]);

  // Scroll & focus topic input if arriving with ?topic=
  useEffect(() => {
    if (initialTopic) {
      const el = document.getElementById('blog-topic');
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [initialTopic]);

  const counts = useMemo(() => countStates(posts, today), [posts, today]);

  // Synchronize filter selection with URL
  function handleFilterChange(nextFilter: PostState | 'all') {
    setFilter(nextFilter);
    setCurrentPage(1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextFilter === 'all') url.searchParams.delete('status');
      else url.searchParams.set('status', nextFilter);
      window.history.replaceState({}, '', url.toString());
    }
  }

  // Filtered & sorted posts
  const filteredPosts = useMemo(() => {
    let result = filter === 'all' ? posts : posts.filter((post) => postState(post, today) === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(q) ||
          post.excerpt.toLowerCase().includes(q) ||
          post.body.toLowerCase().includes(q) ||
          (post.targetKeyword && post.targetKeyword.toLowerCase().includes(q)),
      );
    }

    return [...result].sort((a, b) => {
      if (sortBy === 'title-asc') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'title-desc') return (b.title || '').localeCompare(a.title || '');
      if (sortBy === 'oldest') return (a.date || '').localeCompare(b.date || '');
      if (sortBy === 'updated') {
        const dateA = a.updatedAt || a.date || '';
        const dateB = b.updatedAt || b.date || '';
        return dateB.localeCompare(dateA);
      }
      // 'newest' default: insertion/creation order
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [posts, filter, today, search, sortBy]);

  const ITEMS_PER_PAGE = 15;
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / ITEMS_PER_PAGE));
  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPosts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPosts, currentPage]);

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

  function openNewest(next: SiteBlogPost[]) {
    setPosts(next);
    const newest = next[0];
    if (newest) router.push(`${basePath}/marketing/blog/${newest.id}`);
  }

  function publishPost(post: SiteBlogPost) {
    const drift = tradeDriftOf(post.trade, trade);
    if (blocksPublish(drift)) {
      router.push(`${basePath}/marketing/blog/${post.id}?blocked=trade`);
      return;
    }

    run(`publish-${post.id}`, async () => {
      const updated = await updateBlogPostAction(post.id, { status: 'published' });
      setPosts(updated);
      setUndoItem({ id: post.id, title: post.title.trim() || 'Untitled post' });

      let publishMsg = `Published "${post.title.trim() || 'Untitled post'}" to your website.`;
      if (!publicBase) {
        publishMsg = `Published "${post.title.trim() || 'Untitled post'}". Note: your website isn't published yet, so it won't be visible to the public.`;
      } else if (!sectionEnabled) {
        publishMsg = `Published "${post.title.trim() || 'Untitled post'}". Note: your blog band is currently switched off in the builder.`;
      }

      setMessage({ tone: 'ok', text: publishMsg });

      setTimeout(() => {
        const badge = document.getElementById(`status-badge-${post.id}`);
        badge?.focus();
      }, 50);
    });
  }

  function undoPublish(postId: string, title: string) {
    run(`undo-${postId}`, async () => {
      const updated = await updateBlogPostAction(postId, { status: 'draft' });
      setPosts(updated);
      setUndoItem(null);
      setMessage({
        tone: 'ok',
        text: `Unpublished "${title}" and returned it to draft.`,
      });
    });
  }

  function deletePost(postId: string) {
    run(`delete-${postId}`, async () => {
      const updated = await deleteBlogPostAction(postId);
      setPosts(updated);
      setDeletingId(null);
      setSelectedIds((prev) => prev.filter((id) => id !== postId));
      setMessage({ tone: 'ok', text: 'Post deleted permanently.' });
    });
  }

  function duplicatePost(postId: string) {
    run(`duplicate-${postId}`, async () => {
      const updated = await duplicateBlogPostAction(postId);
      setPosts(updated);
      setMessage({ tone: 'ok', text: 'Post duplicated as a draft.' });
    });
  }

  // Bulk actions
  function handleSelectAll() {
    if (selectedIds.length === paginatedPosts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedPosts.map((p) => p.id));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function executeBulkAction(action: 'publish' | 'archive' | 'delete') {
    if (selectedIds.length === 0) return;
    run(`bulk-${action}`, async () => {
      const updated = await bulkUpdateBlogPostsAction(selectedIds, action);
      setPosts(updated);
      const count = selectedIds.length;
      setSelectedIds([]);
      setMessage({
        tone: 'ok',
        text:
          action === 'delete'
            ? `Deleted ${count} posts.`
            : action === 'publish'
              ? `Published ${count} posts.`
              : `Archived ${count} posts.`,
      });
    });
  }

  const isAtMax = posts.length >= 60;
  const isApproachingMax = posts.length >= 50 && !isAtMax;

  // AI Content Generator component to render at top when counts.all === 0, or below post library
  const generatorSection = (
    <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
      <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
        <div>
          <p className="eyebrow">AI Content Generator</p>
          <h2>Content Ideas &amp; Search Topics</h2>
        </div>
        <button
          type="button"
          className="btn ghost btn-sm"
          onClick={() => setExampleOpen(true)}
        >
          See example article →
        </button>
      </div>

      {/* Quick Idea Starters */}
      <div className="mkt-idea-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
        <button
          type="button"
          className="mkt-filter"
          onClick={() => setTopic(`Seasonal Maintenance Checklist for ${trade || 'Homeowners'}`)}
        >
          <span aria-hidden="true">🍁</span> Seasonal Maintenance Checklist
        </button>
        <button
          type="button"
          className="mkt-filter"
          onClick={() => setTopic(`What Homeowners Should Know Before Hiring a ${trade || 'Contractor'}`)}
        >
          <span aria-hidden="true">⭐</span> Homeowner Hiring Guide
        </button>
        <button
          type="button"
          className="mkt-filter"
          onClick={() => setTopic(`Signs Your Home Needs Urgent ${trade || 'Repair & Replacement'}`)}
        >
          <span aria-hidden="true">❓</span> Warning Signs FAQ
        </button>
      </div>

      <label className="cash-bill-field wide">
        <span>What should it be about?</span>
        <input
          id="blog-topic"
          value={topic}
          maxLength={200}
          disabled={pending || isAtMax}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="e.g. Fall gutter maintenance checklist — leave blank and AI picks a seasonal topic"
        />
      </label>
      <div className="marketing-actions">
        <button
          type="button"
          className="btn primary"
          disabled={pending || isAtMax}
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
          {pending && busy === 'generate'
            ? GENERATE_STEPS[generateStep]
            : '✨ Draft it with AI'}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={pending || isAtMax}
          onClick={() =>
            run('generate-publish', async () => {
              const result = await generateBlogPostAction(topic, true);
              if (!result.ok) {
                setMessage({ tone: 'bad', text: result.message });
                return;
              }
              setTopic('');
              setPosts(result.posts);

              let pubMsg = `Generated and published "${result.title}" to your website!`;
              if (!publicBase) {
                pubMsg = `Generated "${result.title}" as published. Note: your website isn't published yet, so it won't be visible to the public.`;
              } else if (!sectionEnabled) {
                pubMsg = `Generated "${result.title}" as published. Note: your blog band is currently switched off in the builder.`;
              }

              setMessage({ tone: 'ok', text: pubMsg });
            })
          }
        >
          {pending && busy === 'generate-publish'
            ? GENERATE_STEPS[generateStep]
            : '🚀 Draft & publish now'}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={pending || isAtMax}
          onClick={() => run('blank', async () => openNewest(await createBlogPostAction()))}
        >
          Write one myself
        </button>
      </div>
      <p className="field-note">
        Drafts stay hidden until published. &ldquo;Draft &amp; publish now&rdquo; makes the article live immediately.
      </p>
    </section>
  );

  return (
    <>
      {/* Sticky/floating notification toast container with always-mounted aria-live region */}
      <div
        className="mkt-floating-toast-container"
        role="status"
        aria-live="polite"
        style={{
          position: 'sticky',
          top: '1rem',
          zIndex: 100,
          marginBottom: message ? '1rem' : 0,
        }}
      >
        {message ? (
          <div className={message.tone === 'bad' ? 'marketing-error' : 'blog-flash'} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <span>{message.text}</span>
            {undoItem ? (
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => undoPublish(undoItem.id, undoItem.title)}
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => setMessage(null)}
                aria-label="Dismiss message"
              >
                ✕
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Warning when blog section is disabled in builder (warns even with 0 posts) */}
      {!sectionEnabled ? (
        <p className="blog-warn">
          Your blog band is switched off on your website, so published posts will not be visible to homeowners until you turn it on.{' '}
          <Link href={`${basePath}/sites`}>Turn it on in the website builder →</Link>
        </p>
      ) : null}

      {/* Warning approaching max posts limit */}
      {isApproachingMax ? (
        <p className="blog-warn">
          You are approaching the limit of 60 blog posts ({posts.length}/60). Consider archiving or deleting older posts.
        </p>
      ) : isAtMax ? (
        <p className="marketing-error">
          You have reached the maximum limit of 60 blog posts ({posts.length}/60). Please delete or archive existing posts before creating more.
        </p>
      ) : null}

      {/* 1. Status Summary Strip — Collapsed when 0 posts */}
      {counts.all > 0 ? (
        <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`panel mkt-tile${filter === 'draft' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('draft')}
            style={{ textAlign: 'left', cursor: 'pointer', background: filter === 'draft' ? 'rgba(var(--tint), 0.08)' : undefined }}
          >
            <span className="mkt-tile-label">Drafts</span>
            <strong className="mkt-tile-value">{counts.draft}</strong>
            <span className="mkt-tile-note">In progress</span>
          </button>
          <button
            type="button"
            className={`panel mkt-tile${filter === 'ready' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('ready')}
            style={{ textAlign: 'left', cursor: 'pointer', background: filter === 'ready' ? 'rgba(var(--tint), 0.08)' : undefined }}
          >
            <span className="mkt-tile-label">Ready</span>
            <strong className="mkt-tile-value">{counts.ready}</strong>
            <span className="mkt-tile-note">Ready to schedule</span>
          </button>
          <button
            type="button"
            className={`panel mkt-tile${filter === 'scheduled' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('scheduled')}
            style={{ textAlign: 'left', cursor: 'pointer', background: filter === 'scheduled' ? 'rgba(var(--tint), 0.08)' : undefined }}
          >
            <span className="mkt-tile-label">Scheduled</span>
            <strong className="mkt-tile-value">{counts.scheduled}</strong>
            <span className="mkt-tile-note">Upcoming release</span>
          </button>
          <button
            type="button"
            className={`panel mkt-tile${filter === 'published' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('published')}
            style={{ textAlign: 'left', cursor: 'pointer', background: filter === 'published' ? 'rgba(var(--tint), 0.08)' : undefined }}
          >
            <span className="mkt-tile-label">Published</span>
            <strong className="mkt-tile-value">{counts.published}</strong>
            <span className="mkt-tile-note">Live on website</span>
          </button>
          <button
            type="button"
            className={`panel mkt-tile${filter === 'archived' ? ' is-active' : ''}`}
            onClick={() => handleFilterChange('archived')}
            style={{ textAlign: 'left', cursor: 'pointer', background: filter === 'archived' ? 'rgba(var(--tint), 0.08)' : undefined }}
          >
            <span className="mkt-tile-label">Archived</span>
            <strong className="mkt-tile-value">{counts.archived}</strong>
            <span className="mkt-tile-note">Taken down</span>
          </button>
        </div>
      ) : null}

      {/* If 0 posts, hoist the AI Content Generator to the top! */}
      {counts.all === 0 && !readOnly ? generatorSection : null}

      {/* 2. Post Library */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Post Library</p>
            <h2>Published &amp; Staged Articles</h2>
          </div>
          <p className="job-meta">
            {counts.all === 0
              ? '0 / 60 posts'
              : `${counts.all} / 60 posts · ${counts.draft + counts.ready} drafts · ${counts.scheduled} scheduled · ${counts.published} published`}
          </p>
        </div>

        {/* Filter Chips */}
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
                onClick={() => handleFilterChange(entry.id)}
              >
                {entry.label} <span className="mkt-filter-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort Controls (when there are posts) */}
        {counts.all > 0 ? (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={{ flex: '1 1 14rem', maxWidth: '24rem' }}>
              <input
                type="search"
                value={search}
                placeholder="Search articles by title or keyword…"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ width: '100%', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                aria-label="Search articles"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label htmlFor="blog-sort" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Sort by:</label>
              <select
                id="blog-sort"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as typeof sortBy);
                  setCurrentPage(1);
                }}
                style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Recently updated</option>
                <option value="title-asc">Title (A–Z)</option>
                <option value="title-desc">Title (Z–A)</option>
              </select>
            </div>
          </div>
        ) : null}

        {/* Bulk action toolbar */}
        {selectedIds.length > 0 && !readOnly ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(var(--tint), 0.08)',
              borderRadius: '8px',
              marginBottom: '0.85rem',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {selectedIds.length} {selectedIds.length === 1 ? 'post' : 'posts'} selected
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn primary btn-sm"
                disabled={pending}
                onClick={() => executeBulkAction('publish')}
              >
                Publish selected
              </button>
              <button
                type="button"
                className="btn secondary btn-sm"
                disabled={pending}
                onClick={() => executeBulkAction('archive')}
              >
                Archive selected
              </button>
              <button
                type="button"
                className="btn danger btn-sm"
                disabled={pending}
                onClick={() => executeBulkAction('delete')}
              >
                Delete selected
              </button>
              <button
                type="button"
                className="btn ghost btn-sm"
                onClick={() => setSelectedIds([])}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {counts.all === 0 ? (
          <div className="empty-state">
            <p>
              {readOnly
                ? 'No blog posts yet. Articles published here build local search authority and boost your SEO rankings.'
                : 'No posts yet. Generate an article with AI above — a few genuinely useful guides give Google local search authority and boost your SEO rankings.'}
            </p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <p className="empty-state">
            {search ? (
              <>
                No articles matching &ldquo;{search}&rdquo;.{' '}
                <button type="button" className="linklike" onClick={() => setSearch('')}>Clear search</button>
              </>
            ) : (
              <>
                No {POST_STATE_LABEL[filter as PostState].toLowerCase()} posts.{' '}
                <button type="button" className="linklike" onClick={() => handleFilterChange('all')}>Show all {counts.all}</button>
              </>
            )}
          </p>
        ) : (
          <>
            {/* Table Select-All Header */}
            {!readOnly ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.2rem', borderBottom: '1px solid var(--rule-t10)' }}>
                <input
                  type="checkbox"
                  id="select-all-posts"
                  checked={selectedIds.length === paginatedPosts.length && paginatedPosts.length > 0}
                  onChange={handleSelectAll}
                  aria-label="Select all posts on this page"
                />
                <label htmlFor="select-all-posts" style={{ fontSize: '0.78rem', color: 'var(--muted)', cursor: 'pointer' }}>
                  Select all on page ({paginatedPosts.length})
                </label>
              </div>
            ) : null}

            <ul className="mkt-post-list">
              {paginatedPosts.map((post) => {
                const postCurrentState = postState(post, today);
                const words = wordCount(post.body);
                const liveUrl = publicBase && post.status === 'published' ? `${publicBase}/${post.slug}` : null;
                const isPublishing = pending && busy === `publish-${post.id}`;
                const drift = tradeDriftOf(post.trade, trade);
                const isOffTrade = blocksPublish(drift) || drift === 'drift';
                const isSelected = selectedIds.includes(post.id);
                const isConfirmingDelete = deletingId === post.id;

                return (
                  <li key={post.id}>
                    <div className="mkt-post-row" style={{ alignItems: 'flex-start' }}>
                      {!readOnly ? (
                        <div style={{ paddingTop: '0.35rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(post.id)}
                            aria-label={`Select ${post.title.trim() || 'post'}`}
                          />
                        </div>
                      ) : null}

                      <div className="mkt-post-copy">
                        <Link
                          href={`${basePath}/marketing/blog/${post.id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <strong>{post.title.trim() || 'Untitled post'}</strong>
                            {isOffTrade ? (
                              <span
                                className="mkt-state"
                                style={{
                                  borderColor: 'var(--ink-amber-1)',
                                  background: 'rgba(251, 191, 36, 0.14)',
                                  color: 'var(--text)',
                                  fontSize: '0.7rem',
                                  padding: '0.1rem 0.4rem',
                                }}
                                title={`Written for ${post.trade || 'different trade'}`}
                              >
                                Off-trade ({post.trade || 'drift'})
                              </span>
                            ) : null}
                          </div>
                          <small>
                            {postDateLabel(post, today)}
                            {` · ${words} words`}
                            {post.targetKeyword ? ` · Key: "${post.targetKeyword}"` : ''}
                          </small>
                        </Link>
                      </div>

                      <div className="mkt-post-actions">
                        <span
                          id={`status-badge-${post.id}`}
                          tabIndex={-1}
                          className={`mkt-state mkt-state-${postCurrentState}`}
                        >
                          {POST_STATE_LABEL[postCurrentState]}
                        </span>

                        <Link
                          href={`${basePath}/marketing/blog/${post.id}`}
                          className="btn secondary btn-sm"
                          aria-label={`Edit ${post.title.trim() || 'post'}`}
                        >
                          Edit
                        </Link>

                        {!readOnly && post.status !== 'published' && post.status !== 'archived' ? (
                          <button
                            type="button"
                            className="btn primary btn-sm"
                            disabled={isPublishing || pending}
                            onClick={() => publishPost(post)}
                            aria-label={`Publish ${post.title.trim() || 'post'}`}
                          >
                            {isPublishing ? 'Publishing…' : 'Publish now'}
                          </button>
                        ) : null}

                        {!readOnly ? (
                          <button
                            type="button"
                            className="btn ghost btn-sm"
                            title="Duplicate this post"
                            disabled={pending || isAtMax}
                            onClick={() => duplicatePost(post.id)}
                            aria-label={`Duplicate ${post.title.trim() || 'post'}`}
                          >
                            Clone
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

                        {!readOnly ? (
                          isConfirmingDelete ? (
                            <div style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn danger btn-sm"
                                disabled={pending}
                                onClick={() => deletePost(post.id)}
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="btn ghost btn-sm"
                                onClick={() => setDeletingId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn ghost btn-sm"
                              title="Delete post"
                              disabled={pending}
                              onClick={() => setDeletingId(post.id)}
                              aria-label={`Delete ${post.title.trim() || 'post'}`}
                            >
                              ✕
                            </button>
                          )
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Pagination Controls */}
            {totalPages > 1 ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1.25rem',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid var(--rule-t10)',
                }}
              >
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Page {currentPage} of {totalPages} ({filteredPosts.length} total)
                </span>
                <button
                  type="button"
                  className="btn secondary btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* 3. AI Content Generator Section (Rendered here when counts.all > 0) */}
      {counts.all > 0 && !readOnly ? generatorSection : null}

      {/* 4. Publishing Reminders & Settings */}
      {readOnly ? null : (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Publication Settings</p>
              <h2>Publishing Reminders</h2>
            </div>
            {reminderSaved ? (
              <span style={{ color: '#16a34a', fontSize: '0.82rem', fontWeight: 600 }}>
                ✓ Saved
              </span>
            ) : null}
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
                  setReminderSaved(true);
                  setTimeout(() => setReminderSaved(false), 2500);
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

      {/* Example Article Modal */}
      {exampleOpen ? (
        <div className="stock-overlay" role="dialog" aria-modal="true" aria-label="Example Blog Post" onMouseDown={() => setExampleOpen(false)}>
          <div className="stock-modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="stock-head">
              <div>
                <strong>Example Contractor Article</strong>
                <small>See how structured headings, local keywords, and internal links boost local rankings.</small>
              </div>
              <button type="button" className="stock-close" onClick={() => setExampleOpen(false)} aria-label="Close">✕</button>
            </div>
            <div style={{ padding: '1.25rem', lineHeight: 1.6, fontSize: '0.92rem' }}>
              <h2 style={{ fontSize: '1.4rem', margin: '0 0 0.5rem' }}>5 Signs Your Deck Needs Resealing Before Winter</h2>
              <p style={{ fontStyle: 'italic', color: 'var(--muted)', margin: '0 0 1rem' }}>
                Protecting your outdoor living space from moisture damage before freeze-and-thaw cycles start.
              </p>
              <h3 style={{ fontSize: '1.15rem', margin: '1rem 0 0.4rem' }}>1. Water Soaks In Instead of Beading</h3>
              <p>
                A simple splash test tells you if your sealant has worn thin. Pour a cup of water onto high-traffic boards. If it beads up, you are safe. If it darkens and sinks into the wood, moisture is penetrating the grain.
              </p>
              <h3 style={{ fontSize: '1.15rem', margin: '1rem 0 0.4rem' }}>2. Mold and Mildew in Shaded Corners</h3>
              <p>
                Green or black discoloration in corners is a telltale warning that damp wood is harboring growth.
              </p>
              <h3 style={{ fontSize: '1.15rem', margin: '1rem 0 0.4rem' }}>Recommended Maintenance Checklist</h3>
              <ul style={{ margin: '0.5rem 0 1rem 1.25rem' }}>
                <li>Power wash on low pressure with wood-safe cleaner</li>
                <li>Sand down splintered grain along high-traffic paths</li>
                <li>Apply penetrating oil or hybrid stain in dry weather</li>
              </ul>
              <p style={{ marginTop: '1rem', borderTop: '1px solid var(--rule-t10)', paddingTop: '0.75rem' }}>
                Need help preparing your exterior surfaces? Check out <a href="/#our-services" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Our Professional Services</a> or <a href="/#contact" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>request a free quote</a>.
              </p>
            </div>
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--rule-t10)', textAlign: 'right' }}>
              <button type="button" className="btn primary btn-sm" onClick={() => setExampleOpen(false)}>Close example</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
