'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SiteBlogPost } from '@/lib/site-content';
import { postDateLabel, postState, POST_STATE_LABEL, todayKeyOf } from '@/lib/marketing-status';
import { blocksPublish, tradeDriftNotice, tradeDriftOf } from '@/lib/blog-trade-drift';
import { wordCount, BlogBody } from '@/lib/blog-text';
import StockPhotoPicker from '../StockPhotoPicker';
import { stashCampaignDraft } from '../../campaign-handoff';
import {
  deleteBlogPostAction,
  updateBlogPostAction,
  uploadBlogCoverAction,
  type BlogPostEdit,
} from '../actions';

/**
 * One post's editor.
 *
 * Autosave is unchanged: every field saves on blur, every control on change.
 * This screen adds full local SEO tools:
 * - Real-time Google SERP preview with 155-char cut line
 * - Target keyword detection across title, excerpt, first paragraph, and headings
 * - Client-side computed SEO Health Checklist & score
 * - Direct URL slug editing
 * - Image alt text and photographer attribution
 * - Fast 1-click internal link insertion to service pages
 * - Google Search Console & Sitemap submission nudge
 */

export default function PostEditor({
  post: initialPost,
  publicBase,
  trade,
  sectionEnabled,
  initialBlockedTrade = false,
}: {
  post: SiteBlogPost;
  publicBase: string | null;
  trade: string;
  sectionEnabled: boolean;
  initialBlockedTrade?: boolean;
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

  // Dynamic today clock that refreshes so overnight sessions don't mislabel posts
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

  const state = postState(post, today);
  const words = wordCount(post.body);
  const liveUrl = publicBase && post.status === 'published' ? `${publicBase}/${post.slug}` : null;
  const sitemapUrl = publicBase
    ? `${publicBase.replace(/\/blog\/?$/, '')}/sitemap.xml`
    : 'https://yourdomain.com/sitemap.xml';

  const drift = tradeDriftOf(post.trade, trade);
  const [tradeAcknowledged, setTradeAcknowledged] = useState(false);
  const tradeBlocked = blocksPublish(drift) && !tradeAcknowledged;
  const driftNotice = tradeDriftNotice(drift, post.trade, trade);

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

  /** Optimistic save */
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

  function campaignFromPost() {
    const readMore = liveUrl ? `\n\nRead it here: ${liveUrl}` : '';
    const firstPara = post.body.split(/\n{2,}/)[0] || '';
    stashCampaignDraft({
      channel: 'email',
      audience: 'all',
      subject: post.title.trim() || 'Something new on our site',
      subjectOptions: [],
      body: `${post.excerpt.trim() || firstPara}${readMore}`.trim(),
      beatId: post.beatId ?? '',
    });
    router.push('/dashboard/marketing/campaigns');
  }

  function insertLink(label: string, url: string) {
    const md = `[${label}](${url})`;
    const updated = post.body ? `${post.body.trim()}\n\n${md}` : md;
    edit({ body: updated });
    setMessage({ tone: 'ok', text: `Inserted internal link: ${md}` });
  }

  // --- SEO Metrics & Calculations -------------------------------------------
  const keyword = (post.targetKeyword || '').trim().toLowerCase();
  const titleLower = (post.title || '').toLowerCase();
  const excerptLower = (post.excerpt || '').toLowerCase();
  const bodyLower = (post.body || '').toLowerCase();
  const firstParaLower = (post.body || '').split(/\n{2,}/)[0]?.toLowerCase() || '';

  const titleLength = post.title.trim().length;
  const isTitleGood = titleLength >= 35 && titleLength <= 65;
  const excerptLength = post.excerpt.trim().length;
  const isExcerptGood = excerptLength >= 70 && excerptLength <= 160;
  const isWordCountGood = words >= 400;
  const hasHeadings = /##\s+/.test(post.body);
  const hasCover = Boolean(post.coverImage);
  const hasCoverAlt = Boolean(post.coverAlt && post.coverAlt.trim());
  const hasLinks = /\[([^\]]+)\]\(([^)]+)\)/.test(post.body);

  const keywordInTitle = keyword ? titleLower.includes(keyword) : false;
  const keywordInExcerpt = keyword ? excerptLower.includes(keyword) : false;
  const keywordInFirstPara = keyword ? firstParaLower.includes(keyword) : false;

  const seoChecklist = [
    { label: 'Title length is optimal (35–65 characters)', pass: isTitleGood, detail: `${titleLength} chars` },
    { label: 'Meta description excerpt (70–160 characters)', pass: isExcerptGood, detail: `${excerptLength} chars` },
    { label: 'Content depth (400+ words)', pass: isWordCountGood, detail: `${words} words` },
    { label: 'Structured headings (## Heading)', pass: hasHeadings, detail: hasHeadings ? 'Present' : 'Add ## Headings' },
    { label: 'Cover photo with descriptive alt text', pass: hasCover && hasCoverAlt, detail: !hasCover ? 'No cover' : !hasCoverAlt ? 'Alt missing' : 'Ready' },
    { label: 'Internal or service links included', pass: hasLinks, detail: hasLinks ? 'Links included' : 'Add link' },
    ...(keyword
      ? [
          { label: `Keyword in title ("${keyword}")`, pass: keywordInTitle, detail: keywordInTitle ? 'Found' : 'Missing' },
          { label: `Keyword in excerpt`, pass: keywordInExcerpt, detail: keywordInExcerpt ? 'Found' : 'Missing' },
          { label: `Keyword in first paragraph`, pass: keywordInFirstPara, detail: keywordInFirstPara ? 'Found' : 'Missing' },
        ]
      : []),
  ];

  const passedCount = seoChecklist.filter((c) => c.pass).length;
  const seoScore = Math.round((passedCount / seoChecklist.length) * 100);

  // SERP display components
  const serpDomain = publicBase
    ? publicBase.replace(/^https?:\/\//, '').replace(/\/blog\/?$/, '')
    : 'yourwebsite.com';
  const serpPath = `${serpDomain} › blog › ${post.slug || 'article'}`;
  const serpTitle = post.title.trim() ? `${post.title.trim()} | ${trade || 'Contractor'}` : 'Untitled Article';
  const rawExcerpt = post.excerpt.trim();
  const serpSnippet = rawExcerpt || 'Add an excerpt below to control the description snippet that Google displays in search results.';

  return (
    <>
      {picking ? (
        <StockPhotoPicker
          defaultQuery={post.title.trim() || trade}
          onClose={() => setPicking(false)}
          onPick={(photo) => {
            setPicking(false);
            edit({
              coverImage: photo.url,
              coverAlt: photo.alt || post.title.trim(),
              photographerName: photo.photographerName,
              photographerUrl: photo.photographerUrl,
            });
          }}
        />
      ) : null}

      {initialBlockedTrade ? (
        <div className="blog-warn" style={{ marginBottom: '1rem' }} role="alert">
          <strong>Publishing paused:</strong> You were brought to this post because it was originally drafted for{' '}
          <strong>{post.trade || 'an earlier trade'}</strong> rather than your current trade (<strong>{trade}</strong>).
          Review the drift notice below and click &ldquo;Publish it anyway&rdquo; if you still wish to publish it.
        </div>
      ) : null}

      <section className="workspace-hero panel mkt-editor-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Blog post</p>
          <h1 className="workspace-title">{post.title.trim() || 'Untitled post'}</h1>
          <p className="workspace-lead">
            <span className={`mkt-state mkt-state-${state}`}>{POST_STATE_LABEL[state]}</span>
            <span className="mkt-editor-meta">
              {postDateLabel(post, today)}
              {` · ${words} words · ~${Math.max(1, Math.round(words / 220))} min read`}
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

      {/* --- 1. Status and Scheduling ----------------------------------------- */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <h2>Status &amp; Schedule</h2>
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

        {driftNotice ? (
          <div className={`mkt-trade-drift${drift === 'drift' ? ' is-blocking' : ''}`} role="status">
            <p className="mkt-trade-drift-text">
              {post.status === 'published' && drift === 'drift' ? 'This is live and off-trade. ' : null}
              {driftNotice}
            </p>
            {tradeBlocked ? (
              <button type="button" className="btn secondary" onClick={() => setTradeAcknowledged(true)}>
                Publish it anyway
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mkt-status-actions">
          {post.status !== 'published' ? (
            <>
              {post.status !== 'ready' ? (
                <button
                  type="button"
                  className="btn secondary"
                  disabled={tradeBlocked}
                  onClick={() => edit({ status: 'ready' })}
                >
                  Mark as ready
                </button>
              ) : (
                <button type="button" className="btn secondary" onClick={() => edit({ status: 'draft' })}>
                  Back to draft
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={tradeBlocked}
                onClick={() => edit({ status: 'published' })}
              >
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

      {/* --- 2. SEO Health & Google Preview ---------------------------------- */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Search Engine Optimization</p>
            <h2>Google SERP &amp; SEO Checklist</h2>
          </div>
          <div className="mkt-seo-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>SEO Health:</span>
            <strong style={{ fontSize: '1rem', color: seoScore >= 80 ? 'var(--ok, #16a34a)' : seoScore >= 60 ? 'var(--accent)' : 'var(--bad)' }}>
              {seoScore}%
            </strong>
          </div>
        </div>

        {/* Google SERP Preview */}
        <div className="mkt-serp-preview">
          <p className="mkt-serp-eyebrow">Google Search Result Preview</p>
          <div className="mkt-serp-box">
            <cite className="mkt-serp-url">{serpPath}</cite>
            <h3 className="mkt-serp-title">{serpTitle}</h3>
            <p className="mkt-serp-snippet">
              {rawExcerpt ? (
                rawExcerpt.length > 155 ? (
                  <>
                    <span>{rawExcerpt.slice(0, 155)}</span>
                    <span className="mkt-serp-cut" title="Search engines typically truncate snippets after 155 characters">
                      {rawExcerpt.slice(155)}
                    </span>
                  </>
                ) : (
                  rawExcerpt
                )
              ) : (
                serpSnippet
              )}
            </p>
          </div>
          <small className="mkt-serp-note">
            The post excerpt serves directly as your <code>meta description</code>. Keep it within 155 characters to prevent cut-off in Google results.
          </small>
        </div>

        {/* Target Keyword Input */}
        <div style={{ marginTop: '1.25rem' }}>
          <label className="cash-bill-field wide">
            <span>Target Keyword / Search Query</span>
            <input
              defaultValue={post.targetKeyword || ''}
              placeholder="e.g. deck restoration tips, boiler maintenance checklist"
              maxLength={80}
              onBlur={(event) => {
                if (event.target.value !== (post.targetKeyword || '')) {
                  edit({ targetKeyword: event.target.value.trim() });
                }
              }}
            />
            <small className="cash-bill-note">
              Enter the main term homeowners search for. We verify its placement across your title, excerpt, and article body.
            </small>
          </label>
        </div>

        {/* Checklist */}
        <div className="mkt-seo-checklist" style={{ marginTop: '1rem' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.45rem' }}>
            {seoChecklist.map((item, idx) => (
              <li
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  fontSize: '0.84rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '6px',
                  background: item.pass ? 'rgba(74, 222, 128, 0.08)' : 'rgba(var(--tint), 0.03)',
                  border: `1px solid ${item.pass ? 'rgba(74, 222, 128, 0.25)' : 'var(--edge-t12)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span aria-hidden="true" style={{ color: item.pass ? '#16a34a' : 'var(--muted)' }}>
                    {item.pass ? '✓' : '○'}
                  </span>
                  <span style={{ color: item.pass ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                </div>
                {item.detail ? (
                  <small style={{ color: item.pass ? '#16a34a' : 'var(--muted)' }}>{item.detail}</small>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- 3. The Document Form --------------------------------------------- */}
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
              <img src={post.coverImage} alt={post.coverAlt || ''} className="mkt-preview-cover" />
            ) : null}
            <h3>{post.title.trim() || 'Untitled post'}</h3>
            {post.excerpt.trim() ? <p className="mkt-preview-excerpt">{post.excerpt}</p> : null}
            <BlogBody body={post.body} />
            {!post.body.trim() ? <p className="empty-state">Nothing written yet.</p> : null}
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
          <small className="cash-bill-note">
            {titleLength}/65 recommended characters
          </small>
        </label>

        <label className="cash-bill-field wide">
          <span>URL Slug</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>/blog/</span>
            <input
              defaultValue={post.slug}
              maxLength={80}
              placeholder="article-slug"
              onBlur={(event) => {
                const val = event.target.value.trim();
                if (val && val !== post.slug) edit({ slug: val });
              }}
            />
          </div>
          {post.status === 'published' ? (
            <small className="cash-bill-note" style={{ color: 'var(--bad)' }}>
              Note: Changing the URL of an already-published post may break external links pointing to the previous address.
            </small>
          ) : (
            <small className="cash-bill-note">
              The permanent link for this article on your site.
            </small>
          )}
        </label>

        <label className="cash-bill-field wide">
          <span>Excerpt (Meta Description)</span>
          <input
            defaultValue={post.excerpt}
            maxLength={200}
            placeholder="One sentence that makes someone want to read it."
            onBlur={(event) => {
              if (event.target.value !== post.excerpt) edit({ excerpt: event.target.value });
            }}
          />
          <small className="cash-bill-note">
            {excerptLength}/155 recommended characters {excerptLength > 155 ? '(Google will truncate after 155 chars)' : ''}
          </small>
        </label>

        <div className="cash-bill-field wide">
          <span id="cover-label">Cover photo</span>
          {post.coverImage ? (
            <div className="blog-cover">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.coverImage} alt={post.coverAlt || ''} />
              <button type="button" className="btn ghost" onClick={() => edit({ coverImage: '', coverAlt: '', photographerName: '', photographerUrl: '' })}>
                Remove
              </button>
            </div>
          ) : null}
          <div className="blog-cover-actions">
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

          {post.coverImage ? (
            <div style={{ marginTop: '0.75rem' }}>
              <label className="cash-bill-field wide">
                <span>Cover photo alt text</span>
                <input
                  defaultValue={post.coverAlt || ''}
                  maxLength={150}
                  placeholder="e.g. Clean residential rain gutter on single-family home"
                  onBlur={(event) => {
                    if (event.target.value !== (post.coverAlt || '')) {
                      edit({ coverAlt: event.target.value });
                    }
                  }}
                />
                <small className="cash-bill-note">
                  Describes the photo for search engines (image SEO) and screen readers.
                  {post.photographerName ? (
                    <> · Photo by {post.photographerName} on Pexels</>
                  ) : null}
                </small>
              </label>
            </div>
          ) : null}
        </div>

        <div className="cash-bill-field wide">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <span>Article Body (Supports ## Headings, - Bullet lists, and [Link](url))</span>
            {/* Quick Internal Linking Helpers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Insert Link:</span>
              <button
                type="button"
                className="btn ghost btn-sm"
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem' }}
                onClick={() => insertLink('Our Services', '/#our-services')}
                title="Add internal link to Services section"
              >
                + Services
              </button>
              <button
                type="button"
                className="btn ghost btn-sm"
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem' }}
                onClick={() => insertLink('Get a Free Quote', '/#contact')}
                title="Add internal link to Quote form"
              >
                + Quote Form
              </button>
              <button
                type="button"
                className="btn ghost btn-sm"
                style={{ fontSize: '0.74rem', padding: '0.2rem 0.5rem' }}
                onClick={() => insertLink('Browse our Blog', '/blog')}
                title="Add internal link to Blog Index"
              >
                + Blog Index
              </button>
            </div>
          </div>

          <textarea
            rows={18}
            defaultValue={post.body}
            placeholder="Write in short paragraphs separated by blank lines. Use ## for section headings and - for bullet items."
            onBlur={(event) => {
              if (event.target.value !== post.body) edit({ body: event.target.value });
            }}
          />
          <small className="cash-bill-note">
            {words} words · ~{Math.max(1, Math.round(words / 220))} min read
            {words > 0 && words < 400 ? ' — aim for 400+ words to rank competitively on local search' : ' — healthy article depth'}
          </small>
        </div>
      </section>

      {/* --- 4. Search Console & Indexing Nudge ------------------------------- */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Search Console</p>
            <h2>Sitemap &amp; Google Submission</h2>
          </div>
        </div>
        <p className="field-note">
          Your published articles are automatically added to your website&apos;s sitemap at:
        </p>
        <p style={{ margin: '0.5rem 0 0.85rem' }}>
          <code style={{ fontSize: '0.85rem', padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'rgba(var(--tint), 0.05)' }}>
            {sitemapUrl}
          </code>
        </p>
        <div className="marketing-actions">
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noopener noreferrer"
            className="btn secondary"
          >
            Submit to Google Search Console ↗
          </a>
        </div>
      </section>

      {/* --- 5. Danger, kept apart -------------------------------------------- */}
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
