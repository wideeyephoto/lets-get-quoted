import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auth from '@/lib/auth';
import {
  triggerOperatorCycleAction,
  resolveHitlActionServerAction,
  askOperatorServerAction,
  triageCaseServerAction,
} from '@/app/admin/operator/actions';
import {
  previewPlatformCampaignAction,
  getAudienceReachAction,
  sendTestPlatformEmailAction,
  sendPlatformCampaignBlastAction,
} from '@/app/admin/campaigns/actions';

describe('Admin Server Action Security Gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AI Operator Server Actions', () => {
    it('rejects unauthenticated triggerOperatorCycleAction calls', async () => {
      vi.spyOn(auth, 'requirePermission').mockRejectedValueOnce(
        new Error('Your read only role does not include "ops.manage"'),
      );

      await expect(triggerOperatorCycleAction()).rejects.toThrow(
        'Your read only role does not include "ops.manage"',
      );
    });

    it('rejects unauthenticated resolveHitlActionServerAction calls', async () => {
      vi.spyOn(auth, 'requirePermission').mockRejectedValueOnce(
        new Error('Your support role does not include "ops.manage"'),
      );

      await expect(
        resolveHitlActionServerAction('act-123', 'approved', 'Test approval'),
      ).rejects.toThrow('Your support role does not include "ops.manage"');
    });

    it('rejects unauthorized triageCaseServerAction calls', async () => {
      vi.spyOn(auth, 'requirePermission').mockRejectedValueOnce(
        new Error('Your read only role does not include "account.support"'),
      );

      await expect(
        triageCaseServerAction('case-123', 'Test Case', 'Body text'),
      ).rejects.toThrow('Your read only role does not include "account.support"');
    });
  });

  describe('Campaigns Server Actions', () => {
    it('rejects unauthorized sendPlatformCampaignBlastAction without ops.manage permission', async () => {
      vi.spyOn(auth, 'requirePermission').mockRejectedValueOnce(
        new Error('Your support role does not include "ops.manage"'),
      );

      const result = await sendPlatformCampaignBlastAction({
        audience: 'all_contractors',
        subject: 'Unauthorized Blast',
        heading: 'Test Blast',
        body: 'Body',
        theme: 'studio',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Your support role does not include "ops.manage"');
    });

    it('rejects previewPlatformCampaignAction if not authenticated', async () => {
      vi.spyOn(auth, 'requireAdmin').mockRejectedValueOnce(new Error('NEXT_NOT_FOUND'));

      const result = await previewPlatformCampaignAction({
        subject: 'Test Subject',
        heading: 'Test Heading',
        body: 'Test Body',
        theme: 'studio',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('NEXT_NOT_FOUND');
    });
  });
});
