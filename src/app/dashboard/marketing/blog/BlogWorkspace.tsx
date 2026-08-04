'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { SiteBlogPost } from '@/lib/site-content';
import StockPhotoPicker from './StockPhotoPicker';
import {
  createBlogPostAction,
  deleteBlogPostAction,
  generateBlogPostAction,
  setBlogReminderAction,
  updateBlogPostAction,
  uploadBlogCoverAction,
  type BlogPostEdit,
} from './actions';

// Every edit saves on blur or on the control's own change, so there is no Save
// button and nothing to lose. That is the difference between this page and the
// website builder, which batches a whole site into one save — a blog post is a
// document, and a document that only exists until you navigate away is a
// document people stop writing.

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function postLabel(post: SiteBlogPost, index: number): string {
  const title = post.title.trim();
  if (!title) return `Untitled post ${index + 1}`;
  return title.length > 60 ? `${title.slice(0, 60).trimEnd()}…` : title;
}

function statusLabel(post: SiteBlogPost): { text: string; tone: string } {
  if (post.status === 'published') return { text: 'Live', tone: 'live' };
  if (post.publishAt) return { text: `Scheduled ${post.publishAt}`, tone: 'scheduled' };
  return { text: 'Draft', tone: 'draft' };
}

export default function BlogWorkspace({
  initialPosts,
  reminderWeeks,
  sectionEnabled,
  publicBase,
  initialTopic,
  initialPostId,
  trade,
}: {
  initialPosts: SiteBlogPost[];
  reminderWeeks: number;
  sectionEnabled: boolean;
  publicBase: string | null;
  /** ?topic= from the dashboard reminder or a seasonal-topic handoff. */
  initialTopic: string;
  /** ?post= — open this post straight away. From the marketing calendar. */
  initialPostId: string;
  /** Fallback stock-photo search for a post that has no title yet. */
  trade: string;
}) {
  const [posts, setPosts] = useState(initialPosts);
  // Opened from the URL when a card linked to one specific post, and checked
  // against the real list so a stale link opens nothing rather than nothing
  // visible with an editor's worth of state pointing at a deleted post.
  const [openId, setOpenId] = useState<string | null>(
    () => (initialPostId && initialPosts.some((post) => post.id === initialPostId) ? initialPostId : null),
  );
  /** The post whose cover photo is being chosen, or null. */
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [topic, setTopic] = useState(initialTopic);
  const [reminder, setReminder] = useState(reminderWeeks);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Arriving with ?topic= means somebody pressed "write about this" elsewhere.
  useEffect(() => {
    if (initialTopic) document.getElementById('blog-topic')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [initialTopic]);

  // Arriving with ?post= means a card elsewhere linked to one specific draft.
  // Scrolled to its TOP, not centred: an open post is taller than the viewport,
  // and centring it puts the title off-screen above — you land in the middle of
  // a body field with nothing saying which post you are in.
  useEffect(() => {
    if (!openId || !initialPostId || openId !== initialPostId) return;
    document.getElementById(`blog-post-${initialPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Once only — after this, opening posts by hand should not move the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId]);

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

  function edit(postId: string, patch: BlogPostEdit) {
    // Optimistic, so typing never fights the round trip; the server's list
    // replaces it when it lands.
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...patch } : post)));
    run(`edit:${postId}`, async () => {
      setPosts(await updateBlogPostAction(postId, patch));
    });
  }

  const liveCount = posts.filter((post) => post.status === 'published').length;
  const picking = posts.find((post) => post.id === pickingFor) ?? null;

  return (
    <>
      {picking ? (
        <StockPhotoPicker
          // The post's own subject first; its trade is the fallback, because a
          // brand-new untitled post would otherwise search for nothing.
          defaultQuery={picking.title.trim() || trade}
          onClose={() => setPickingFor(null)}
          onPick={(photo) => {
            setPickingFor(null);
            edit(picking.id, { coverImage: photo.url });
          }}
        />
      ) : null}

      {message ? (
        <p className={message.tone === 'bad' ? 'marketing-error' : 'blog-flash'}>{message.text}</p>
      ) : null}

      {!sectionEnabled && posts.length > 0 ? (
        <p className="blog-warn">
          Your blog band is switched off on your website, so none of these are visible to anyone — publishing one
          won&apos;t change that. <Link href="/dashboard/sites">Turn it on in the website builder →</Link>
        </p>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Write a post</p>
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
                setPosts(result.posts);
                setOpenId(result.posts[0]?.id ?? null);
                setTopic('');
                setMessage({ tone: 'ok', text: `Draft written: “${result.title}”. Read it through, then publish when you're happy.` });
              })
            }
          >
            {pending && busy === 'generate' ? 'Writing your draft…' : '✨ Draft it with AI'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={pending && busy === 'blank'}
            onClick={() =>
              run('blank', async () => {
                const next = await createBlogPostAction();
                setPosts(next);
                setOpenId(next[0]?.id ?? null);
              })
            }
          >
            Write one myself
          </button>
        </div>
        <p className="field-note">
          Everything saves as a hidden draft. Nothing appears on your website until you publish it.
        </p>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Your posts</p>
          <p className="job-meta">
            {posts.length === 0
              ? 'None yet'
              : `${posts.length} total · ${liveCount} live · drafts stay hidden until you publish them`}
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="empty-state">
            No posts yet. Draft one above — a few genuinely useful articles give Google more local pages to rank
            and give past customers a reason to come back.
          </p>
        ) : (
          <div className="blog-list">
            {posts.map((post, index) => {
              const open = openId === post.id;
              const status = statusLabel(post);
              const words = wordCount(post.body);
              return (
                <article key={post.id} id={`blog-post-${post.id}`} className={`blog-row${open ? ' is-open' : ''}`}>
                  <header className="blog-row-head">
                    <button
                      type="button"
                      className="blog-row-title"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : post.id)}
                    >
                      <strong>{postLabel(post, index)}</strong>
                      <span className="blog-row-meta">
                        {words > 0 ? `${words} words · ` : ''}
                        {post.date}
                      </span>
                    </button>
                    <span className={`blog-status blog-status-${status.tone}`}>{status.text}</span>
                  </header>

                  {open ? (
                    <div className="blog-row-body">
                      <div className="blog-publish-row">
                        <button
                          type="button"
                          className={`btn ${post.status === 'published' ? 'ghost' : 'primary'}`}
                          onClick={() => edit(post.id, { status: post.status === 'published' ? 'draft' : 'published' })}
                        >
                          {post.status === 'published' ? '✓ Published — take it down' : 'Publish now'}
                        </button>
                        {post.status !== 'published' ? (
                          <label className="cash-bill-field">
                            <span>or auto-publish on</span>
                            <input
                              type="date"
                              value={post.publishAt}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={(event) => edit(post.id, { publishAt: event.target.value })}
                            />
                          </label>
                        ) : null}
                        {post.status === 'published' && publicBase ? (
                          <a className="btn ghost" href={`${publicBase}/${post.slug}`} target="_blank" rel="noopener noreferrer">
                            View it live ↗
                          </a>
                        ) : null}
                      </div>

                      <label className="cash-bill-field wide">
                        <span>Title</span>
                        <input
                          defaultValue={post.title}
                          maxLength={120}
                          placeholder="5 signs it’s time to reseal your deck"
                          onBlur={(event) => {
                            if (event.target.value !== post.title) edit(post.id, { title: event.target.value });
                          }}
                        />
                        {post.status === 'published' ? (
                          <small className="cash-bill-note">
                            Its web address stays <code>/{post.slug}</code> — it&apos;s published, so anything linking
                            to it would break.
                          </small>
                        ) : null}
                      </label>

                      <label className="cash-bill-field wide">
                        <span>Excerpt</span>
                        <input
                          defaultValue={post.excerpt}
                          maxLength={200}
                          placeholder="One sentence that makes someone want to read it."
                          onBlur={(event) => {
                            if (event.target.value !== post.excerpt) edit(post.id, { excerpt: event.target.value });
                          }}
                        />
                      </label>

                      <div className="cash-bill-field wide">
                        <span>Cover photo</span>
                        {post.coverImage ? (
                          <div className="blog-cover">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={post.coverImage} alt="" />
                            <button type="button" className="btn ghost" onClick={() => edit(post.id, { coverImage: '' })}>
                              Remove
                            </button>
                          </div>
                        ) : null}
                        <div className="blog-cover-actions">
                          {/* Stock first. Almost nobody has a photo of a clean
                              gutter to hand, and a post with no cover renders
                              as a grey box on every blog layout. */}
                          <button type="button" className="btn secondary" onClick={() => setPickingFor(post.id)}>
                            {post.coverImage ? 'Choose a different photo' : 'Choose a photo'}
                          </button>
                          <label className="blog-cover-upload">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              disabled={pending && busy === `cover:${post.id}`}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.currentTarget.value = '';
                                if (!file) return;
                                const form = new FormData();
                                form.set('image', file);
                                run(`cover:${post.id}`, async () => {
                                  setPosts(await uploadBlogCoverAction(post.id, form));
                                });
                              }}
                            />
                            <span>
                              {pending && busy === `cover:${post.id}` ? 'Uploading…' : 'Upload my own'}
                            </span>
                          </label>
                        </div>
                      </div>

                      <label className="cash-bill-field wide">
                        <span>Body</span>
                        <textarea
                          rows={14}
                          defaultValue={post.body}
                          placeholder="Write in short paragraphs separated by a blank line."
                          onBlur={(event) => {
                            if (event.target.value !== post.body) edit(post.id, { body: event.target.value });
                          }}
                        />
                        <small className="cash-bill-note">
                          {words} words · ~{Math.max(1, Math.round(words / 220))} min read
                          {words > 0 && words < 300 ? ' — aim for 400+ so the post feels worth the click' : ''}
                        </small>
                      </label>

                      <div className="marketing-actions">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            if (!window.confirm(`Delete “${postLabel(post, index)}”? This can't be undone.`)) return;
                            run(`delete:${post.id}`, async () => {
                              setPosts(await deleteBlogPostAction(post.id));
                              setOpenId(null);
                            });
                          }}
                        >
                          Delete this post
                        </button>
                        <span className="field-note">Changes save as you go.</span>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Reminders</p>
        </div>
        <label className="cash-bill-field">
          <span>Nudge me to publish</span>
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
    </>
  );
}
