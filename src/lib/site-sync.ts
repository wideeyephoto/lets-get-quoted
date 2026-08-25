import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedSiteContent, SiteShowcaseItem, SiteTestimonialItem } from '@/lib/site-content';
import { getSiteContent } from '@/lib/site-content';

export type JobSyncResult = {
  syncedJobs: number;
  syncedPhotos: number;
  addedItems: number;
};

export type ReviewSyncResult = {
  syncedReviews: number;
  addedTestimonials: number;
};

/**
 * Automatically syncs completed jobs and their photos to the contractor's website showcase.
 */
export async function syncCompletedJobsToSite(
  supabase: SupabaseClient,
  accountId: string,
): Promise<JobSyncResult> {
  // Fetch site content
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    throw new Error('No website found for this account.');
  }

  const content = getSiteContent(site.content as Record<string, unknown> | null);

  // Fetch completed jobs for this account
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, status, location, client_name, completed_at, created_at')
    .eq('account_id', accountId)
    .in('status', ['complete', 'archived'])
    .order('completed_at', { ascending: false })
    .limit(20);

  if (!jobs || jobs.length === 0) {
    return { syncedJobs: 0, syncedPhotos: 0, addedItems: 0 };
  }

  const jobIds = jobs.map((j) => j.id as string);

  // Fetch photos from completed jobs
  const { data: photos } = await supabase
    .from('job_photos')
    .select('id, job_id, url, caption, created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });

  const existingUrls = new Set<string>([
    ...content.showcase.items.map((item) => item.url),
    ...content.projectShowcase.items.map((item) => item.url),
  ]);

  const newShowcaseItems: SiteShowcaseItem[] = [];

  for (const photo of photos || []) {
    if (!photo.url || existingUrls.has(photo.url)) continue;
    const parentJob = jobs.find((j) => j.id === photo.job_id);
    const caption = photo.caption || (parentJob?.title ? `${parentJob.title} — Completed project` : 'Completed client project');

    newShowcaseItems.push({
      id: photo.id,
      url: photo.url,
      alt: caption,
      caption,
      category: 'craft',
      source: 'upload',
    });
    existingUrls.add(photo.url);
  }

  if (newShowcaseItems.length > 0) {
    const updatedItems = [...content.showcase.items, ...newShowcaseItems].slice(0, 18);
    const updatedContent: NormalizedSiteContent = {
      ...content,
      showcase: {
        ...content.showcase,
        enabled: true,
        items: updatedItems,
      },
      projectShowcase: {
        ...content.projectShowcase,
        enabled: true,
        items: updatedItems.slice(0, 12),
      },
    };

    await supabase
      .from('sites')
      .update({ content: updatedContent, updated_at: new Date().toISOString() })
      .eq('id', site.id);
  }

  return {
    syncedJobs: jobs.length,
    syncedPhotos: photos?.length || 0,
    addedItems: newShowcaseItems.length,
  };
}

/**
 * Automatically syncs verified client reviews and feedback to the website testimonials.
 */
export async function syncClientReviewsToSite(
  supabase: SupabaseClient,
  accountId: string,
): Promise<ReviewSyncResult> {
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) {
    throw new Error('No website found for this account.');
  }

  const content = getSiteContent(site.content as Record<string, unknown> | null);

  // Fetch reviews / positive ratings from completed jobs & feedback
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, client_name, rating, review_text, created_at, job_id')
    .eq('account_id', accountId)
    .gte('rating', 4)
    .order('created_at', { ascending: false })
    .limit(10);

  const existingTexts = new Set(
    content.testimonials.items.map((t) => t.text.trim().toLowerCase()),
  );

  const newTestimonials: SiteTestimonialItem[] = [];

  for (const review of reviews || []) {
    if (!review.review_text || existingTexts.has(review.review_text.trim().toLowerCase())) continue;

    newTestimonials.push({
      id: review.id,
      author: review.client_name || 'Verified Homeowner',
      text: review.review_text,
      rating: review.rating || 5,
      label: 'Verified Project Review',
      imageUrl: '',
      imageAlt: review.client_name || 'Customer',
    });
    existingTexts.add(review.review_text.trim().toLowerCase());
  }

  if (newTestimonials.length > 0) {
    const updatedTestimonials = [...content.testimonials.items, ...newTestimonials].slice(0, 12);
    const updatedContent: NormalizedSiteContent = {
      ...content,
      testimonials: {
        ...content.testimonials,
        enabled: true,
        items: updatedTestimonials,
      },
    };

    await supabase
      .from('sites')
      .update({ content: updatedContent, updated_at: new Date().toISOString() })
      .eq('id', site.id);
  }

  return {
    syncedReviews: reviews?.length || 0,
    addedTestimonials: newTestimonials.length,
  };
}
