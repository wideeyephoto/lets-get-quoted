import { describe, expect, it } from 'vitest';
import { officeReadPageRedirect } from '@/lib/office-access';

const id = '11111111-2222-4333-8444-555555555555';
describe('office read-page redirect before streaming', () => {
  it('sends an office dashboard visit to its current permitted landing page', () => {
    expect(officeReadPageRedirect('/dashboard', [])).toBe('/office-access');
    expect(officeReadPageRedirect('/dashboard', ['clients.read'])).toBe('/dashboard/clients');
  });
  it('admits real client and job read pages only with their existing requirements', () => {
    for (const path of ['/dashboard/clients', `/dashboard/clients/${id}`]) {
      expect(officeReadPageRedirect(path, [])).toBe('/office-access');
      expect(officeReadPageRedirect(path, ['clients.read'])).toBeNull();
    }
    for (const path of ['/dashboard/jobs', `/dashboard/jobs/${id}`, `/dashboard/jobs/${id}/quote`]) {
      expect(officeReadPageRedirect(path, ['clients.read'])).toBe('/dashboard/clients');
      expect(officeReadPageRedirect(path, ['jobs.read'])).toBe('/dashboard/services');
      expect(officeReadPageRedirect(path, ['clients.read', 'jobs.read'])).toBeNull();
    }
  });
  it('leaves unrelated and nested pages with different capabilities to their own guards', () => {
    for (const path of [null, '/dashboard/clients/import', `/dashboard/clients/${id}/statement`,
      '/dashboard/jobs/import', `/dashboard/jobs/${id}/invoices/${id}`, `/dashboard/jobs/${id}/forms/${id}/print`,
      '/dashboard/payments', '/dashboard/jobsource']) {
      expect(officeReadPageRedirect(path, [])).toBeNull();
    }
  });
});
