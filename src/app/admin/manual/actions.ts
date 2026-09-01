'use server';

import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { exportAllManualArticlesMarkdown } from '@/lib/admin-manual';

export interface ManualResolutionInput {
  slug: string;
  articleTitle: string;
  stepsCompleted: number;
  totalSteps: number;
  durationSeconds?: number;
  targetEntityId?: string;
  notes?: string;
}

export async function logManualResolutionAction(input: ManualResolutionInput) {
  try {
    const context = await requireAdmin();

    await logAdminAction(context.admin, context, {
      action: 'manual.resolution_completed',
      targetType: 'manual_article',
      targetId: input.slug,
      reason: `Staff completed operational runbook: ${input.articleTitle}`,
      meta: {
        stepsCompleted: input.stepsCompleted,
        totalSteps: input.totalSteps,
        percentage: Math.round((input.stepsCompleted / (input.totalSteps || 1)) * 100),
        durationSeconds: input.durationSeconds ?? 0,
        targetEntityId: input.targetEntityId || null,
        notes: input.notes || null,
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function requestDualApprovalAction(input: {
  slug: string;
  articleTitle: string;
  targetEntityId?: string;
  reason: string;
}) {
  try {
    const context = await requireAdmin();

    await logAdminAction(context.admin, context, {
      action: 'manual.dual_auth_requested',
      targetType: 'manual_article',
      targetId: input.slug,
      reason: `Secondary authorization requested for ${input.articleTitle}: ${input.reason}`,
      meta: {
        targetEntityId: input.targetEntityId || null,
        requestedBy: context.adminEmail,
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function exportManualMarkdownAction() {
  try {
    const context = await requireAdmin();
    const markdown = exportAllManualArticlesMarkdown(context.role, context.staff?.active ?? true);
    return { success: true, markdown };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
