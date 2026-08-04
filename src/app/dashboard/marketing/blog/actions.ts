'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { draftBlogPost } from '@/lib/blog-generate';
import { uploadSiteImage } from '@/lib/site-image-storage';
import { pickBlogCover } from '@/app/dashboard/sites/actions';
import { saveBlogPosts, uniqueBlogSlug } from '@/lib/site-blog';
import { getSiteContent, type SiteBlogPost } from '@/lib/site-content';

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
  const { supabase, accountId } = await requireOwnerContext();
  const posts = await saveBlogPosts(supabase, accountId, (current) => {
    if (current.length >= MAX_POSTS) throw new Error(`You can keep up to ${MAX_POSTS} posts.`);
    const post: SiteBlogPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: uniqueBlogSlug('post', current),
      title: '',
      excerpt: '',
      body: '',
      coverImage: '',
      status: 'draft',
      date: new Date().toISOString().slice(0, 10),
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
  status?: 'draft' | 'published';
  publishAt?: string;
};

export async function updateBlogPostAction(postId: string, edit: BlogPostEdit): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOwnerContext();

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
        status: edit.status ?? post.status,
        // A published post keeps no schedule — it is already out.
        publishAt: edit.status === 'published'
          ? ''
          : edit.publishAt !== undefined
            ? (/^\d{4}-\d{2}-\d{2}$/.test(edit.publishAt) ? edit.publishAt : '')
            : post.publishAt,
        // Renaming a post that was auto-slugged re-slugs it; one the owner has
        // already published keeps its URL, because that URL may be linked to
        // and is in the sitemap.
        slug:
          edit.title !== undefined && post.status !== 'published' && (!post.slug || /^post(-\d+)?$/.test(post.slug))
            ? uniqueBlogSlug(title, current, post.id)
            : post.slug,
        // Publishing dates the post today rather than the day the draft was
        // made — a post written three weeks ago and published now is new.
        date: edit.status === 'published' && post.status !== 'published'
          ? new Date().toISOString().slice(0, 10)
          : post.date,
      };
    }),
  );
  revalidateBlog();
  return posts;
}

export async function deleteBlogPostAction(postId: string): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOwnerContext();
  const posts = await saveBlogPosts(supabase, accountId, (current) => current.filter((post) => post.id !== postId));
  revalidateBlog();
  return posts;
}

export async function setBlogReminderAction(weeks: number): Promise<void> {
  const { supabase, accountId } = await requireOwnerContext();
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
export async function generateBlogPostAction(topic?: string): Promise<{ ok: true; posts: SiteBlogPost[]; title: string } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `blog-draft:${accountId}`, 20, 3600))) {
    return { ok: false, message: 'That is a lot of posts in an hour — give it a few minutes.' };
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
      serviceArea: (site.service_area as string) || '',
      topic: cleanTopic,
    });
  } catch (error) {
    console.error('Blog draft failed:', error);
    return { ok: false, message: 'Could not write a draft right now. Please try again.' };
  }

  const coverImage = await pickBlogCover(cleanTopic || trade || draft.title);

  const posts = await saveBlogPosts(supabase, accountId, (current) => [
    {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      slug: uniqueBlogSlug(draft.title, current),
      title: draft.title,
      excerpt: draft.excerpt,
      body: draft.body,
      coverImage: coverImage || '',
      status: 'draft' as const,
      date: new Date().toISOString().slice(0, 10),
      publishAt: '',
    },
    ...current,
  ]);

  revalidateBlog();
  return { ok: true, posts, title: draft.title };
}

/** Cover photo upload. Same bucket and same limits as the builder's uploads. */
export async function uploadBlogCoverAction(postId: string, formData: FormData): Promise<SiteBlogPost[]> {
  const { supabase, accountId } = await requireOwnerContext();
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose an image to upload.');

  const image = await uploadSiteImage(accountId, file);
  const posts = await saveBlogPosts(supabase, accountId, (current) =>
    current.map((post) => (post.id === postId ? { ...post, coverImage: image.url } : post)),
  );
  revalidateBlog();
  return posts;
}
