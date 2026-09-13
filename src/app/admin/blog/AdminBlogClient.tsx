'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { PlatformBlogPost } from '@/lib/platform-blog';
import { toggleAdminBlogPostStatusAction, deleteAdminBlogPostAction } from './actions';
import styles from '../admin.module.css';

interface AdminBlogClientProps {
  posts: PlatformBlogPost[];
}

export default function AdminBlogClient({ posts: initialPosts }: AdminBlogClientProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const filtered = posts.filter((p) => {
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  const handleToggleStatus = (id: string) => {
    startTransition(async () => {
      try {
        await toggleAdminBlogPostStatusAction(id);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, status: p.status === 'published' ? 'draft' : 'published' }
              : p,
          ),
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    startTransition(async () => {
      try {
        await deleteAdminBlogPostAction(id);
        setPosts((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <>
      {/* Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`${styles.filterButton || styles.btn} ${filterStatus === 'all' ? styles.btnPrimary : styles.btnSecondary}`}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All ({posts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('published')}
            className={`${styles.filterButton || styles.btn} ${filterStatus === 'published' ? styles.btnPrimary : styles.btnSecondary}`}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Published ({posts.filter((p) => p.status === 'published').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('draft')}
            className={`${styles.filterButton || styles.btn} ${filterStatus === 'draft' ? styles.btnPrimary : styles.btnSecondary}`}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Drafts ({posts.filter((p) => p.status === 'draft').length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles..."
            style={{
              padding: '7px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              minWidth: '220px',
            }}
          />
          <Link
            href="/admin/blog/new"
            className={styles.btnPrimary}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              textDecoration: 'none',
              background: '#ff7137',
              color: '#fff',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Article
          </Link>
        </div>
      </div>

      {/* Posts Table */}
      <div className={styles.tableWrap} style={{ overflowX: 'auto', opacity: isPending ? 0.7 : 1 }}>
        <table className={styles.table} style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '12px', color: '#88909b' }}>
              <th style={{ padding: '12px 10px' }}>TITLE / SLUG</th>
              <th style={{ padding: '12px 10px' }}>CATEGORY</th>
              <th style={{ padding: '12px 10px' }}>AUTHOR</th>
              <th style={{ padding: '12px 10px' }}>DATE</th>
              <th style={{ padding: '12px 10px' }}>STATUS</th>
              <th style={{ padding: '12px 10px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#88909b' }}>
                  No articles found matching filter criteria.
                </td>
              </tr>
            ) : (
              filtered.map((post) => (
                <tr
                  key={post.id}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '13px',
                  }}
                >
                  <td style={{ padding: '12px 10px', maxWidth: '340px' }}>
                    <div style={{ fontWeight: 600, color: '#f7f7f4', marginBottom: '2px' }}>
                      {post.title}
                    </div>
                    <code style={{ fontSize: '11px', color: '#88909b' }}>/blog/{post.slug}</code>
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'rgba(78, 224, 188, 0.1)',
                        color: '#4ee0bc',
                        border: '1px solid rgba(78, 224, 188, 0.25)',
                      }}
                    >
                      {post.category}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px', color: '#c0c3ca' }}>{post.author.name}</td>
                  <td style={{ padding: '12px 10px', color: '#88909b', whiteSpace: 'nowrap' }}>
                    {post.datePublished}
                  </td>
                  <td style={{ padding: '12px 10px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        background:
                          post.status === 'published'
                            ? 'rgba(78, 224, 188, 0.15)'
                            : 'rgba(255, 196, 77, 0.15)',
                        color: post.status === 'published' ? '#4ee0bc' : '#ffc44d',
                        border:
                          post.status === 'published'
                            ? '1px solid rgba(78, 224, 188, 0.3)'
                            : '1px solid rgba(255, 196, 77, 0.3)',
                      }}
                    >
                      {post.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <Link
                        href={`/blog/${post.slug}?preview=true`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '12px',
                          color: '#67b7ff',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(103, 183, 255, 0.1)',
                        }}
                      >
                        Live Preview ↗
                      </Link>
                      <Link
                        href={`/admin/blog/${post.id}`}
                        style={{
                          fontSize: '12px',
                          color: '#fff',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(post.id)}
                        disabled={isPending}
                        style={{
                          fontSize: '12px',
                          color: post.status === 'published' ? '#ffc44d' : '#4ee0bc',
                          background: 'none',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        {post.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(post.id, post.title)}
                        disabled={isPending}
                        style={{
                          fontSize: '12px',
                          color: '#ff6b6b',
                          background: 'none',
                          border: '1px solid rgba(255, 107, 107, 0.3)',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
