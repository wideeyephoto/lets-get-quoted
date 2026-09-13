'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import {
  savePlatformBlogPost,
  deletePlatformBlogPost,
  getPlatformBlogPostById,
  type PlatformBlogPost,
  type PlatformBlogBlock,
  DEFAULT_AUTHOR,
} from '@/lib/platform-blog';

function revalidateAllBlogPaths(slug?: string) {
  revalidatePath('/blog');
  revalidatePath('/blog/rss.xml');
  revalidatePath('/blog/feed.json');
  revalidatePath('/admin/blog');
  if (slug) {
    revalidatePath(`/blog/${slug}`);
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function createAdminBlogPostAction(formData: FormData) {
  const context = await requireAdmin();
  const { admin } = context;

  const title = String(formData.get('title') ?? '').trim();
  let slug = String(formData.get('slug') ?? '').trim();
  const category = String(formData.get('category') ?? 'Software Economics').trim();
  const excerpt = String(formData.get('excerpt') ?? '').trim();
  const subtitle = String(formData.get('subtitle') ?? '').trim() || undefined;
  const authorName = String(formData.get('author_name') ?? DEFAULT_AUTHOR.name).trim();
  const authorRole = String(formData.get('author_role') ?? DEFAULT_AUTHOR.role).trim();
  const readMinutes = Math.max(1, parseInt(String(formData.get('read_minutes') ?? '5'), 10) || 5);
  const status = (String(formData.get('status') ?? 'draft') as 'published' | 'draft' | 'scheduled');
  const tagsRaw = String(formData.get('tags') ?? '');
  const contentRaw = String(formData.get('content') ?? '').trim();

  if (!title) {
    throw new Error('Title is required');
  }
  if (!slug) {
    slug = slugify(title);
  }
  if (!excerpt) {
    throw new Error('Excerpt is required');
  }

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  // Parse raw text into structured blocks (splitting paragraphs and headings)
  const blocks: PlatformBlogBlock[] = parseContentToBlocks(contentRaw);

  const now = new Date().toISOString().slice(0, 10);
  const newPost: PlatformBlogPost = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    slug,
    title,
    subtitle,
    excerpt,
    category,
    author: {
      name: authorName,
      role: authorRole,
      avatarUrl: '/apple-icon.png',
    },
    readMinutes,
    datePublished: now,
    status,
    tags,
    blocks,
    featured: formData.get('featured') === 'on',
  };

  const saved = await savePlatformBlogPost(newPost);

  await logAdminAction(admin, context, {
    action: 'blog_post.create',
    targetType: 'platform_blog_post',
    targetId: saved.id,
    reason: `Staff created blog post: ${saved.title}`,
    meta: {
      slug: saved.slug,
      status: saved.status,
      category: saved.category,
    },
  });

  revalidateAllBlogPaths(saved.slug);
  redirect('/admin/blog');
}

export async function updateAdminBlogPostAction(id: string, formData: FormData) {
  const context = await requireAdmin();
  const { admin } = context;

  const existing = await getPlatformBlogPostById(id);
  if (!existing) {
    throw new Error('Article not found');
  }

  const title = String(formData.get('title') ?? existing.title).trim();
  let slug = String(formData.get('slug') ?? existing.slug).trim();
  const category = String(formData.get('category') ?? existing.category).trim();
  const excerpt = String(formData.get('excerpt') ?? existing.excerpt).trim();
  const subtitle = String(formData.get('subtitle') ?? '').trim() || undefined;
  const authorName = String(formData.get('author_name') ?? existing.author.name).trim();
  const authorRole = String(formData.get('author_role') ?? existing.author.role).trim();
  const readMinutes = Math.max(1, parseInt(String(formData.get('read_minutes') ?? String(existing.readMinutes)), 10) || 5);
  const status = (String(formData.get('status') ?? existing.status) as 'published' | 'draft' | 'scheduled');
  const tagsRaw = String(formData.get('tags') ?? '');
  const contentRaw = String(formData.get('content') ?? '').trim();

  if (!slug) {
    slug = slugify(title);
  }

  const tags = tagsRaw
    ? tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : existing.tags;

  const blocks: PlatformBlogBlock[] = contentRaw
    ? parseContentToBlocks(contentRaw)
    : existing.blocks;

  const updated: PlatformBlogPost = {
    ...existing,
    title,
    slug,
    subtitle,
    excerpt,
    category,
    author: {
      ...existing.author,
      name: authorName,
      role: authorRole,
    },
    readMinutes,
    status,
    tags,
    blocks,
    featured: formData.get('featured') === 'on',
    dateModified: new Date().toISOString().slice(0, 10),
  };

  const saved = await savePlatformBlogPost(updated);

  await logAdminAction(admin, context, {
    action: 'blog_post.update',
    targetType: 'platform_blog_post',
    targetId: saved.id,
    reason: `Staff updated blog post: ${saved.title}`,
    before: { title: existing.title, status: existing.status, slug: existing.slug },
    after: { title: saved.title, status: saved.status, slug: saved.slug },
  });

  revalidateAllBlogPaths(saved.slug);
  redirect('/admin/blog');
}

export async function toggleAdminBlogPostStatusAction(id: string) {
  const context = await requireAdmin();
  const { admin } = context;

  const post = await getPlatformBlogPostById(id);
  if (!post) throw new Error('Article not found');

  const newStatus = post.status === 'published' ? 'draft' : 'published';
  const updated: PlatformBlogPost = {
    ...post,
    status: newStatus,
    dateModified: new Date().toISOString().slice(0, 10),
  };

  await savePlatformBlogPost(updated);

  await logAdminAction(admin, context, {
    action: 'blog_post.toggle_status',
    targetType: 'platform_blog_post',
    targetId: post.id,
    reason: `Staff changed post status to ${newStatus}: ${post.title}`,
    before: { status: post.status },
    after: { status: newStatus },
  });

  revalidateAllBlogPaths(post.slug);
}

export async function deleteAdminBlogPostAction(id: string) {
  const context = await requireAdmin();
  const { admin } = context;

  const post = await getPlatformBlogPostById(id);
  if (!post) throw new Error('Article not found');

  await deletePlatformBlogPost(id);

  await logAdminAction(admin, context, {
    action: 'blog_post.delete',
    targetType: 'platform_blog_post',
    targetId: id,
    reason: `Staff deleted blog post: ${post.title}`,
    before: { title: post.title, slug: post.slug },
  });

  revalidateAllBlogPaths(post.slug);
}

function parseContentToBlocks(raw: string): PlatformBlogBlock[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n\r?\n/);
  const blocks: PlatformBlogBlock[] = [];

  for (const chunk of lines) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ type: 'quote', quote: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = trimmed
        .split('\n')
        .map((l) => l.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean);
      blocks.push({ type: 'ul', items });
    } else {
      blocks.push({ type: 'p', text: trimmed });
    }
  }

  return blocks;
}
