'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BLOG_CATEGORIES, type PlatformBlogPost, DEFAULT_AUTHOR } from '@/lib/platform-blog';
import styles from '../admin.module.css';

interface AdminBlogEditorProps {
  initialPost?: PlatformBlogPost;
  action: (formData: FormData) => Promise<void>;
  isEditing?: boolean;
}

export default function AdminBlogEditor({ initialPost, action, isEditing }: AdminBlogEditorProps) {
  const [title, setTitle] = useState(initialPost?.title || '');
  const [slug, setSlug] = useState(initialPost?.slug || '');
  const [isAutoSlug, setIsAutoSlug] = useState(!isEditing);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (isAutoSlug) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, ''),
      );
    }
  };

  // Convert initial blocks to text representation for editing
  const initialContent = initialPost?.blocks
    ? initialPost.blocks
        .map((b) => {
          if (b.type === 'h2') return `## ${b.text}`;
          if (b.type === 'h3') return `### ${b.text}`;
          if (b.type === 'quote') return `> ${b.quote}${b.author ? `\n— ${b.author}` : ''}`;
          if (b.type === 'ul') return b.items.map((it) => `- ${it}`).join('\n');
          if (b.type === 'callout') return `> [!${b.kind || 'info'}] ${b.title || ''}\n${b.text}`;
          return b.text;
        })
        .join('\n\n')
    : '';

  return (
    <form action={action} className={styles.form} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <Link href="/admin/blog" style={{ color: '#88909b', fontSize: '13px', textDecoration: 'none' }}>
          &larr; Back to Articles List
        </Link>
        {isEditing && initialPost && (
          <Link
            href={`/blog/${initialPost.slug}?preview=true`}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#67b7ff', fontSize: '13px', textDecoration: 'none' }}
          >
            Live Preview ↗
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Left / Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f7f7f4', marginBottom: '6px' }}>
              Article Title *
            </label>
            <input
              type="text"
              name="title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. The Per-Seat Trap: Why Adding Field Crew Shouldn't Hike Your Software Bill"
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f7f7f4', marginBottom: '6px' }}>
              URL Slug *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#88909b' }}>/blog/</span>
              <input
                type="text"
                name="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setIsAutoSlug(false);
                }}
                required
                style={{
                  flexGrow: 1,
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f7f7f4', marginBottom: '6px' }}>
              Subtitle / Hook
            </label>
            <input
              type="text"
              name="subtitle"
              defaultValue={initialPost?.subtitle || ''}
              placeholder="e.g. Hiring an apprentice or helper shouldn’t cost you $40/month in extra software licensing."
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f7f7f4', marginBottom: '6px' }}>
              Excerpt / Meta Description *
            </label>
            <textarea
              name="excerpt"
              defaultValue={initialPost?.excerpt || ''}
              placeholder="1–2 sentences summarizing the article for Google search snippets and card previews."
              required
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#f7f7f4' }}>
                Article Content (Paragraphs &amp; Headings)
              </label>
              <span style={{ fontSize: '11px', color: '#88909b' }}>
                Supports ## Heading 2, ### Heading 3, - bullets, &gt; quotes
              </span>
            </div>
            <textarea
              name="content"
              defaultValue={initialContent}
              placeholder="Write or paste your article content here. Separate paragraphs with a blank line. Use '## Subheading' for sections."
              rows={16}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#f7f7f4',
                fontSize: '14px',
                lineHeight: '1.6',
                fontFamily: 'monospace',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        {/* Right / Sidebar Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '18px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f7f7f4' }}>
              Publishing Options
            </h3>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Status
              </label>
              <select
                name="status"
                defaultValue={initialPost?.status || 'draft'}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                <option value="draft">Draft (Private to staff)</option>
                <option value="published">Published (Live on site &amp; RSS)</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Category
              </label>
              <select
                name="category"
                defaultValue={initialPost?.category || 'Software Economics'}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              >
                {BLOG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Read Time (Minutes)
              </label>
              <input
                type="number"
                name="read_minutes"
                min="1"
                max="60"
                defaultValue={initialPost?.readMinutes || 5}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  name="featured"
                  defaultChecked={initialPost?.featured || false}
                  style={{ accentColor: '#ff7137' }}
                />
                <span>Hero Featured Guide</span>
              </label>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Tags (Comma-separated)
              </label>
              <input
                type="text"
                name="tags"
                defaultValue={initialPost?.tags?.join(', ') || ''}
                placeholder="e.g. software, pricing, crew"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Author Name
              </label>
              <input
                type="text"
                name="author_name"
                defaultValue={initialPost?.author?.name || DEFAULT_AUTHOR.name}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#c0c3ca', marginBottom: '4px' }}>
                Author Role
              </label>
              <input
                type="text"
                name="author_role"
                defaultValue={initialPost?.author?.role || DEFAULT_AUTHOR.role}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '13px',
                }}
              />
            </div>

            <button
              type="submit"
              className={styles.btnPrimary}
              style={{
                marginTop: '12px',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                background: '#ff7137',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(255, 113, 55, 0.35)',
              }}
            >
              {isEditing ? 'Save Article Changes' : 'Create Article'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
