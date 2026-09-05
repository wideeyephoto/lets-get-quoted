'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { draftBlogPost } from '@/lib/blog-generate';
import { uploadSiteImage } from '@/lib/site-image-storage';
import { pickBlogCover } from '@/app/dashboard/sites/actions';
import { saveBlogPosts, uniqueBlogSlug } from '@/lib/site-blog';
import { getSiteContent, slugifyBlogTitle, type SiteBlogPost } from '@/lib/site-content';
import type { StoredPostStatus } from '@/lib/marketing-status';

// Every write here goes through saveBlogPosts, which re-reads the site content
// immediately before writing and replaces the post list alone. The website
// builder no longer sends posts at all (see preserveBlogPosts), so the two
// pages cannot take each other's work back out.

function revalidateBlog() {
  revalidatePath('/dashboard/marketing/blog');
  revalidatePath('/dashboard/marketing');
  // The builder shows a read-only preview of the same posts.
  revalidatePath('/dashboard/sites');
}

const MAX_POSTS = 60;

export async function createBlogPostAction(): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const now = new Date().toISOString().slice(0, 10);
  const posts = await saveBlogPosts(supabase, accountId, (current) => {
    if (current.length >= MAX_POSTS) throw new Error(`You can keep up to ${MAX_POSTS} posts.`);
    const post: SiteBlogPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: uniqueBlogSlug('post', current),
      title: '',
      excerpt: '',
      body: '',
      coverImage: '',
      coverAlt: '',
      status: 'draft',
      date: now,
      updatedAt: now,
      publishAt: '',
    };
    return [post, ...current];
  });
  revalidateBlog();
  return posts;
}

export type BlogPostEdit = {
  title?: string;
  excerpt?: string;
  body?: string;
  coverImage?: string;
  coverAlt?: string;
  photographerName?: string;
  photographerUrl?: string;
  targetKeyword?: string;
  slug?: string;
  status?: StoredPostStatus;
  publishAt?: string;
};

export async function updateBlogPostAction(postId: string, edit: BlogPostEdit): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const now = new Date().toISOString().slice(0, 10);

  const posts = await saveBlogPosts(supabase, accountId, (current) =>
    current.map((post) => {
      if (post.id !== postId) return post;
      const title = edit.title !== undefined ? String(edit.title).slice(0, 120) : post.title;
      return {
        ...post,
        title,
        excerpt: edit.excerpt !== undefined ? String(edit.excerpt).slice(0, 200) : post.excerpt,
        body: edit.body !== undefined ? String(edit.body).slice(0, 20000) : post.body,
        coverImage: edit.coverImage !== undefined ? String(edit.coverImage).slice(0, 500) : post.coverImage,
        coverAlt: edit.coverAlt !== undefined ? String(edit.coverAlt).slice(0, 150) : post.coverAlt,
        photographerName: edit.photographerName !== undefined ? String(edit.photographerName).slice(0, 120) : post.photographerName,
        photographerUrl: edit.photographerUrl !== undefined ? String(edit.photographerUrl).slice(0, 500) : post.photographerUrl,
        targetKeyword: edit.targetKeyword !== undefined ? String(edit.targetKeyword).slice(0, 80) : post.targetKeyword,
        status: edit.status ?? post.status,
        updatedAt: now,
        // A published post keeps no schedule — it is already out. Archiving
        // drops it too: shouldAutoPublish already refuses an archived post, but
        // a stale date left on the row would fire the moment somebody moved it
        // back to Ready, publishing something they only meant to un-archive.
        publishAt: edit.status === 'published' || edit.status === 'archived'
          ? ''
          : edit.publishAt !== undefined
            ? (/^\d{4}-\d{2}-\d{2}$/.test(edit.publishAt) ? edit.publishAt : '')
            : post.publishAt,
        // Renaming a post that was auto-slugged re-slugs it; one the owner has
        // already published keeps its URL, because that URL may be linked to
        // and is in the sitemap. Allow explicit manual slug edits if provided.
        slug:
          edit.slug !== undefined
            ? uniqueBlogSlug(slugifyBlogTitle(edit.slug) || 'post', current, post.id)
            : edit.title !== undefined && post.status !== 'published' && (!post.slug || /^post(-\d+)?$/.test(post.slug))
              ? uniqueBlogSlug(title, current, post.id)
              : post.slug,
        // Publishing dates the post today rather than the day the draft was
        // made — a post written three weeks ago and published now is new.
        date: edit.status === 'published' && post.status !== 'published'
          ? now
          : post.date,
      };
    }),
  );
  revalidateBlog();
  return posts;
}

export async function deleteBlogPostAction(postId: string): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const posts = await saveBlogPosts(supabase, accountId, (current) => current.filter((post) => post.id !== postId));
  revalidateBlog();
  return posts;
}

export async function duplicateBlogPostAction(postId: string): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const now = new Date().toISOString().slice(0, 10);
  const posts = await saveBlogPosts(supabase, accountId, (current) => {
    if (current.length >= MAX_POSTS) throw new Error(`You can keep up to ${MAX_POSTS} posts.`);
    const source = current.find((p) => p.id === postId);
    if (!source) throw new Error('Post not found.');
    const title = `${source.title || 'Untitled'} (Copy)`.slice(0, 120);
    const copy: SiteBlogPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: uniqueBlogSlug(title, current),
      title,
      excerpt: source.excerpt,
      body: source.body,
      coverImage: source.coverImage,
      coverAlt: source.coverAlt,
      photographerName: source.photographerName,
      photographerUrl: source.photographerUrl,
      targetKeyword: source.targetKeyword,
      status: 'draft',
      date: now,
      updatedAt: now,
      publishAt: '',
      trade: source.trade,
    };
    return [copy, ...current];
  });
  revalidateBlog();
  return posts;
}

export async function bulkUpdateBlogPostsAction(
  postIds: string[],
  action: 'publish' | 'archive' | 'delete',
): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const targetSet = new Set(postIds);
  const now = new Date().toISOString().slice(0, 10);

  const posts = await saveBlogPosts(supabase, accountId, (current) => {
    if (action === 'delete') {
      return current.filter((post) => !targetSet.has(post.id));
    }
    return current.map((post) => {
      if (!targetSet.has(post.id)) return post;
      if (action === 'publish') {
        return {
          ...post,
          status: 'published' as const,
          publishAt: '',
          date: post.status !== 'published' ? now : post.date,
          updatedAt: now,
        };
      }
      if (action === 'archive') {
        return {
          ...post,
          status: 'archived' as const,
          publishAt: '',
          updatedAt: now,
        };
      }
      return post;
    });
  });
  revalidateBlog();
  return posts;
}

export async function setBlogReminderAction(weeks: number): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const allowed = [0, 2, 4, 8].includes(weeks) ? weeks : 0;
  await saveBlogPosts(supabase, accountId, (current) => current, { reminderWeeks: allowed });
  revalidateBlog();
}

/**
 * Draft a post with AI and save it straight away.
 *
 * Saved rather than held in the browser: this page has no unsaved-changes
 * model, and a draft that only exists on screen is one a refresh throws away
 * after it has already been paid for.
 */
export async function generateBlogPostAction(topic?: string, autoPublish = false): Promise<{ ok: true; posts: SiteBlogPost[]; title: string } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  if (!(await checkRateLimit(createAdminClient(), `blog-draft:${accountId}`, 20, 3600))) {
    return { ok: false, message: 'You have reached the AI generation limit of 20 posts per hour. Please wait before drafting more.' };
  }

  const { data: site } = await supabase
    .from('sites')
    .select('company_name, service_area, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) return { ok: false, message: 'You need a website before you can post to it.' };

  const trade = getSiteContent(site.content as Record<string, unknown> | null).trade;
  const cleanTopic = String(topic ?? '').trim().slice(0, 200);

  let draft;
  try {
    draft = await draftBlogPost({
      companyName: (site.company_name as string) || '',
      // `trade` is read two lines up and used two lines down for the cover
      // image; it was simply never handed to the drafter. Without it
      // draftBlogPost falls back to inferring the trade from the business
      // NAME, which is how a plumbing site ends up with a published article
      // about window maintenance. See the note on its `trade` parameter.
      trade,
      serviceArea: (site.service_area as string) || '',
      topic: cleanTopic,
    });
  } catch (error) {
    console.error('Blog draft failed:', error);
    return { ok: false, message: 'Could not write a draft right now. Please try again.' };
  }

  const coverImage = await pickBlogCover(cleanTopic || trade || draft.title);
  const now = new Date().toISOString().slice(0, 10);

  const posts = await saveBlogPosts(supabase, accountId, (current) => [
    {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: uniqueBlogSlug(draft.title, current),
      title: draft.title,
      excerpt: draft.excerpt,
      body: draft.body,
      coverImage: coverImage || '',
      coverAlt: '',
      status: autoPublish ? ('published' as const) : ('draft' as const),
      date: now,
      updatedAt: now,
      publishAt: '',
      // The trade the DRAFT was written for, from the drafter rather than read
      // off the site again — see GeneratedBlogPost.trade. Without it a post
      // cannot be told apart from one written for a trade the owner has since
      // left, which is how a plumber came to publish about window cleaning.
      ...(draft.trade ? { trade: draft.trade } : {}),
    },
    ...current,
  ]);

  revalidateBlog();
  return { ok: true, posts, title: draft.title };
}

/** Cover photo upload. Same bucket and same limits as the builder's uploads. */
export async function uploadBlogCoverAction(postId: string, formData: FormData): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose an image to upload.');

  const image = await uploadSiteImage(accountId, file);
  const posts = await saveBlogPosts(supabase, accountId, (current) =>
    current.map((post) => (post.id === postId ? { ...post, coverImage: image.url } : post)),
  );
  revalidateBlog();
  return posts;
}
