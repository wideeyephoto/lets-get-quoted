import { describe, expect, it, vi } from 'vitest';
import { syncClientReviewsToSite, syncCompletedJobsToSite } from '@/lib/site-sync';

describe('syncCompletedJobsToSite', () => {
  it('extracts completed job photos and populates showcase items', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site-1',
                    content: {
                      showcase: { enabled: true, title: 'Featured Projects', intro: '', navLabel: 'Gallery', layout: 'grid', items: [] },
                      projectShowcase: { enabled: true, eyebrow: '', title: 'Projects', intro: '', items: [] },
                    },
                  },
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === 'jobs') {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        { id: 'job-1', title: 'Custom Deck Installation', status: 'complete', location: 'Maplewood', client_name: 'John Smith' },
                        { id: 'job-2', title: 'Kitchen Remodel', status: 'complete', location: 'Summit', client_name: 'Sarah Connor' },
                      ],
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'job_photos') {
          return {
            select: () => ({
              in: () => ({
                order: async () => ({
                  data: [
                    { id: 'photo-1', job_id: 'job-1', url: 'https://cdn.example.com/deck-after.jpg', caption: 'Finished cedar deck' },
                    { id: 'photo-2', job_id: 'job-2', url: 'https://cdn.example.com/kitchen.jpg', caption: null },
                  ],
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const result = await syncCompletedJobsToSite(mockSupabase, 'acct-123');

    expect(result.syncedJobs).toBe(2);
    expect(result.syncedPhotos).toBe(2);
    expect(result.addedItems).toBe(2);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('syncClientReviewsToSite', () => {
  it('extracts positive job reviews and merges into testimonials', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'site-1',
                    content: {
                      testimonials: { enabled: true, title: 'Reviews', sourceMode: 'manual', displayStyle: 'grid', items: [] },
                    },
                  },
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === 'reviews') {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({
                      data: [
                        { id: 'rev-1', client_name: 'Emily Davis', rating: 5, review_text: 'Excellent craftsmanship and communication!' },
                      ],
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as any;

    const result = await syncClientReviewsToSite(mockSupabase, 'acct-123');

    expect(result.syncedReviews).toBe(1);
    expect(result.addedTestimonials).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
