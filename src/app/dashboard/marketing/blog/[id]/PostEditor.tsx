'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteBlogPost } from '@/lib/site-content';
import { postDateLabel, postState, POST_STATE_LABEL, todayKeyOf } from '@/lib/marketing-status';
import StockPhotoPicker from '../StockPhotoPicker';
import { stashCampaignDraft } from '../../campaign-handoff';
import {
  deleteBlogPostAction, updateBlogPostAction, uploadBlogCoverAction, type BlogPostEdit,
} from '../actions';

/**
 * One post's editor.
 *
 * Autosave is unchanged and deliberately so: every field saves on blur, every
 * control on its own change, and there is no Save button. A blog post is a
 * document, and a document that only exists until you navigate away is a
 * document people stop writing. What this screen adds is a visible PROGRESSION
 * — Draft → Ready → Scheduled or Published — because the old page had one
 * "Publish now" button and no way to say "this is finished, not out yet".
 */

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Paragraph split, matching how the public template renders a body. */
function paragraphs(body: string): string[] {
  return body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

export default function PostEditor({
  post: initialPost,
  publicBase,
  trade,
  sectionEnabled,
}: {
  post: SiteBlogPost;
  publicBase: string | null;
  trade: string;
  sectionEnabled: boolean;
}) {
  const router = useRouter();
  const [post, setPost] = useState(initialPost);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = useMemo(() => todayKeyOf(), []);
  const state = postState(post, today);
  const words = wordCount(post.body);
  const liveUrl = publicBase && post.status === 'published' ? `${publicBase}/${post.slug}` : null;

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

  /** Optimistic, so typing never fights the round trip. */
  function edit(patch: BlogPostEdit) {
    setPost((current) => ({ ...current, ...patch }));
    setSaving(true);
    startTransition(async () => {
      try {
        const posts = await updateBlogPostAction(post.id, patch);
        const fresh = posts.find((entry) => entry.id === post.id);
        if (fresh) setPost(fresh);
      } catch (error) {
        setMessage({ tone: 'bad', text: error instanceof Error ? error.message : 'That did not save.' });
      } finally {
        setSaving(false);
      }
    });
  }

  /**
   * Turn this post into an email.
   *
   * Built here, deterministically, from what is already on screen — not sent to
   * the model. The contractor wrote this post; an email that says something
   * different from the post it is advertising is worse than no email.
   */
  function campaignFromPost() {
    const readMore = liveUrl ? `\n\nRead it here: ${liveUrl}` : '';
    stashCampaignDraft({
      channel: 'email',
      audience: 'all',
      subject: post.title.trim() || 'Something new on our site',
      subjectOptions: [],
      body: `${post.excerpt.trim() || paragraphs(post.body)[0] || ''}${readMore}`.trim(),
      beatId: post.beatId ?? '',
    });
    router.push('/dashboard/marketing/campaigns');
  }

  return (
    <>
      {picking ? (
        <StockPhotoPicker
          defaultQuery={post.title.trim() || trade}
          onClose={() => setPicking(false)}
          onPick={(photo) => {
            setPicking(false);
            edit({ coverImage: photo.url });
          }}
        />
      ) : null}

      <section className="workspace-hero panel mkt-editor-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Blog post</p>
          <h1 className="workspace-title">{post.title.trim() || 'Untitled post'}</h1>
          <p className="workspace-lead">
            <span className={`mkt-state mkt-state-${state}`}>{POST_STATE_LABEL[state]}</span>
            <span className="mkt-editor-meta">
              {postDateLabel(post, today)}
              {words > 0 ? ` · ${words} words · ~${Math.max(1, Math.round(words / 220))} min read` : ''}
            </span>
          </p>
        </div>
        <p className="mkt-save" aria-live="polite">
          {saving ? 'Saving…' : 'Changes save as you go'}
        </p>
      </section>

      {message ? (
        <p className={message.tone === 'bad' ? 'marketing-error' : 'blog-flash'} role="status">{message.text}</p>
      ) : null}

      {!sectionEnabled ? (
        <p className="blog-warn">
          Your blog band is switched off on your website, so nothing here is visible to anyone — publishing this
          won&apos;t change that. <Link href="/dashboard/sites">Turn it on in the website builder →</Link>
        </p>
      ) : null}

      {/* --- Where it is, and where it goes next ---------------------------- */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>Status</h2>
        </div>

        <ol className="mkt-progress">
          {(['draft', 'ready', state === 'scheduled' ? 'scheduled' : 'published'] as const).map((step) => {
            const order = ['draft', 'ready', 'scheduled', 'published'];
            const done = order.indexOf(state) >= order.indexOf(step) && state !== 'archived';
            return (
              <li key={step} className={`mkt-progress-step${done ? ' is-done' : ''}${state === step ? ' is-here' : ''}`}>
                <span className="mkt-progress-dot" aria-hidden="true" />
                <span>{POST_STATE_LABEL[step]}</span>
                {state === step ? <span className="sr-only">(current)</span> : null}
              </li>
            );
          })}
        </ol>

        <div className="mkt-status-actions">
          {post.status !== 'published' ? (
            <>
              {post.status !== 'ready' ? (
                <button type="button" className="btn secondary" onClick={() => edit({ status: 'ready' })}>
                  Mark as ready
                </button>
              ) : (
                <button type="button" className="btn secondary" onClick={() => edit({ status: 'draft' })}>
                  Back to draft
                </button>
              )}
              <button type="button" className="btn primary" onClick={() => edit({ status: 'published' })}>
                Publish now
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn secondary" onClick={() => edit({ status: 'draft' })}>
                Unpublish — back to draft
              </button>
              {liveUrl ? (
                <a className="btn secondary" href={liveUrl} target="_blank" rel="noopener noreferrer">
                  View it live ↗
                </a>
              ) : null}
            </>
          )}
        </div>

        {post.status !== 'published' && post.status !== 'archived' ? (
          <label className="cash-bill-field">
            <span>Or schedule it for</span>
            <input
              type="date"
              value={post.publishAt}
              min={today}
              onChange={(event) => edit({ publishAt: event.target.value })}
            />
            <small className="cash-bill-note">
              {post.publishAt
                ? 'It publishes itself on that morning. Clear the date to stop it.'
                : 'Leave empty to publish by hand.'}
            </small>
          </label>
        ) : null}

        {/* Offered only once it is actually out — an email pointing at an
            unpublished post links to a 404. */}
        {post.status === 'published' ? (
          <div className="mkt-after-publish">
            <p className="field-note">It&apos;s live. Worth telling your customers?</p>
            <div className="marketing-actions">
              <button type="button" className="btn primary" onClick={campaignFromPost}>
                Create email campaign from this post
              </button>
              <Link className="btn secondary" href="/dashboard/marketing">
                Return to Marketing overview
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      {/* --- The document ---------------------------------------------------- */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>The post</h2>
          <button
            type="button"
            className="mkt-section-link"
            aria-expanded={preview}
            aria-controls="post-preview"
            onClick={() => setPreview((current) => !current)}
          >
            {preview ? 'Hide preview' : 'Preview'}
          </button>
        </div>

        {preview ? (
          <article id="post-preview" className="mkt-preview">
            {post.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.coverImage} alt="" className="mkt-preview-cover" />
            ) : null}
            <h3>{post.title.trim() || 'Untitled post'}</h3>
            {post.excerpt.trim() ? <p className="mkt-preview-excerpt">{post.excerpt}</p> : null}
            {paragraphs(post.body).map((para, index) => (
              <p key={index}>{para}</p>
            ))}
            {paragraphs(post.body).length === 0 ? <p className="empty-state">Nothing written yet.</p> : null}
          </article>
        ) : null}

        <label className="cash-bill-field wide">
          <span>Title</span>
          <input
            defaultValue={post.title}
            maxLength={120}
            placeholder="5 signs it’s time to reseal your deck"
            onBlur={(event) => {
              if (event.target.value !== post.title) edit({ title: event.target.value });
            }}
          />
          {post.status === 'published' ? (
            <small className="cash-bill-note">
              Its web address stays <code>/{post.slug}</code> — it&apos;s published, so anything linking to it
              would break.
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
              if (event.target.value !== post.excerpt) edit({ excerpt: event.target.value });
            }}
          />
        </label>

        <div className="cash-bill-field wide">
          <span id="cover-label">Cover photo</span>
          {post.coverImage ? (
            <div className="blog-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverImage} alt="" />
              <button type="button" className="btn ghost" onClick={() => edit({ coverImage: '' })}>
                Remove
              </button>
            </div>
          ) : null}
          <div className="blog-cover-actions">
            {/* Stock first. Almost nobody has a photo of a clean gutter to hand,
                and a post with no cover renders as a grey box on every layout. */}
            <button type="button" className="btn secondary" aria-describedby="cover-label" onClick={() => setPicking(true)}>
              {post.coverImage ? 'Choose a different photo' : 'Choose a photo'}
            </button>
            <label className="blog-cover-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={pending && busy === 'cover'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (!file) return;
                  const form = new FormData();
                  form.set('image', file);
                  run('cover', async () => {
                    const posts = await uploadBlogCoverAction(post.id, form);
                    const fresh = posts.find((entry) => entry.id === post.id);
                    if (fresh) setPost(fresh);
                  });
                }}
              />
              <span>{pending && busy === 'cover' ? 'Uploading…' : 'Upload my own'}</span>
            </label>
          </div>
        </div>

        <label className="cash-bill-field wide">
          <span>Body</span>
          <textarea
            rows={18}
            defaultValue={post.body}
            placeholder="Write in short paragraphs separated by a blank line."
            onBlur={(event) => {
              if (event.target.value !== post.body) edit({ body: event.target.value });
            }}
          />
          <small className="cash-bill-note">
            {words} words · ~{Math.max(1, Math.round(words / 220))} min read
            {words > 0 && words < 300 ? ' — aim for 400+ so the post feels worth the click' : ''}
          </small>
        </label>
      </section>

      {/* --- Danger, kept apart --------------------------------------------- */}
      <section className="panel workspace-section-card mkt-danger">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>Remove this post</h2>
        </div>
        <p className="field-note">
          Archiving keeps the writing and takes it off your website. Deleting cannot be undone.
        </p>
        <div className="marketing-actions">
          {post.status !== 'archived' ? (
            <button type="button" className="btn secondary" onClick={() => edit({ status: 'archived' })}>
              Archive it
            </button>
          ) : (
            <button type="button" className="btn secondary" onClick={() => edit({ status: 'draft' })}>
              Restore to draft
            </button>
          )}

          {/* Two presses, in place. A window.confirm is easy to dismiss on
              muscle memory and impossible to style or read on a phone. */}
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="btn danger"
                disabled={pending && busy === 'delete'}
                onClick={() =>
                  run('delete', async () => {
                    await deleteBlogPostAction(post.id);
                    router.push('/dashboard/marketing/blog');
                  })
                }
              >
                {pending && busy === 'delete' ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>
              Delete permanently
            </button>
          )}
        </div>
      </section>
    </>
  );
}
