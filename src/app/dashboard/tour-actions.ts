'use server';

import { requireDashboardShellContext } from '@/lib/auth';
import { getTourDefinition, getStepById, filterStepsForUser } from '@/lib/product-tour/catalog';
import type { TourProgressRecord, TourStatus, TourAudience } from '@/lib/product-tour/types';

export async function loadTourProgressAction(
  tourKey: string,
  tourVersion = 1,
): Promise<{ success: boolean; progress?: TourProgressRecord | null; error?: string }> {
  try {
    const { supabase, accountId, userId } = await requireDashboardShellContext();

    const { data, error } = await supabase
      .from('product_tour_progress')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('tour_key', tourKey)
      .eq('tour_version', tourVersion)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, progress: data as TourProgressRecord | null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load tour progress';
    return { success: false, error: message };
  }
}

export async function startTourAction(
  tourKey: string,
  tourVersion = 1,
): Promise<{ success: boolean; progress?: TourProgressRecord; error?: string }> {
  try {
    const { supabase, accountId, userId, role, capabilities } = await requireDashboardShellContext();
    const tour = getTourDefinition(tourKey, tourVersion);
    if (!tour) {
      return { success: false, error: 'Tour definition not found' };
    }

    const availableSteps = filterStepsForUser(tour, { userId, accountId, role: role as TourAudience, capabilities });
    if (availableSteps.length === 0) {
      return { success: false, error: 'No accessible steps in tour' };
    }

    const firstStep = availableSteps[0];
    const now = new Date().toISOString();

    const record: TourProgressRecord = {
      account_id: accountId,
      user_id: userId,
      tour_key: tourKey,
      tour_version: tourVersion,
      status: 'active',
      current_step_id: firstStep.id,
      started_at: now,
      updated_at: now,
      dismissed_at: null,
      completed_at: null,
    };

    const { data, error } = await supabase
      .from('product_tour_progress')
      .upsert(record, { onConflict: 'account_id,user_id,tour_key,tour_version' })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    // Append telemetry event
    try {
      await supabase.from('product_tour_events').insert({
        client_event_id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: tourKey,
        tour_version: tourVersion,
        event_type: 'tour_started',
        step_id: firstStep.id,
        account_id: accountId,
        user_id: userId,
        role,
        source: 'dashboard_action',
        pathname: firstStep.route,
      });
    } catch {
      // Non-blocking telemetry
    }

    return { success: true, progress: data as TourProgressRecord };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start tour';
    return { success: false, error: message };
  }
}

export async function advanceTourAction(
  tourKey: string,
  tourVersion: number,
  stepId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId, userId, role } = await requireDashboardShellContext();
    const tour = getTourDefinition(tourKey, tourVersion);
    if (!tour) return { success: false, error: 'Tour definition not found' };

    const step = getStepById(tour, stepId);
    if (!step) return { success: false, error: 'Step not found in tour' };

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('product_tour_progress')
      .update({
        current_step_id: stepId,
        updated_at: now,
      })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('tour_key', tourKey)
      .eq('tour_version', tourVersion);

    if (error) return { success: false, error: error.message };

    // Record step_viewed event
    try {
      await supabase.from('product_tour_events').insert({
        client_event_id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: tourKey,
        tour_version: tourVersion,
        event_type: 'step_viewed',
        step_id: stepId,
        account_id: accountId,
        user_id: userId,
        role,
        source: 'dashboard_navigation',
        pathname: step.route,
      });
    } catch {}

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to advance tour';
    return { success: false, error: message };
  }
}

export async function dismissTourAction(
  tourKey: string,
  tourVersion = 1,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId, userId, role } = await requireDashboardShellContext();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('product_tour_progress')
      .update({
        status: 'dismissed' as TourStatus,
        dismissed_at: now,
        updated_at: now,
      })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('tour_key', tourKey)
      .eq('tour_version', tourVersion);

    if (error) return { success: false, error: error.message };

    try {
      await supabase.from('product_tour_events').insert({
        client_event_id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: tourKey,
        tour_version: tourVersion,
        event_type: 'tour_dismissed',
        account_id: accountId,
        user_id: userId,
        role,
        source: 'dashboard_action',
      });
    } catch {}

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to dismiss tour';
    return { success: false, error: message };
  }
}

export async function completeTourAction(
  tourKey: string,
  tourVersion = 1,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId, userId, role } = await requireDashboardShellContext();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('product_tour_progress')
      .update({
        status: 'completed' as TourStatus,
        completed_at: now,
        updated_at: now,
      })
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .eq('tour_key', tourKey)
      .eq('tour_version', tourVersion);

    if (error) return { success: false, error: error.message };

    try {
      await supabase.from('product_tour_events').insert({
        client_event_id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: tourKey,
        tour_version: tourVersion,
        event_type: 'tour_completed',
        account_id: accountId,
        user_id: userId,
        role,
        source: 'dashboard_action',
      });
    } catch {}

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete tour';
    return { success: false, error: message };
  }
}

export async function restartTourAction(
  tourKey: string,
  tourVersion = 1,
): Promise<{ success: boolean; progress?: TourProgressRecord; error?: string }> {
  try {
    const { supabase, accountId, userId, role, capabilities } = await requireDashboardShellContext();
    const tour = getTourDefinition(tourKey, tourVersion);
    if (!tour) return { success: false, error: 'Tour definition not found' };

    const availableSteps = filterStepsForUser(tour, { userId, accountId, role: role as TourAudience, capabilities });
    if (availableSteps.length === 0) return { success: false, error: 'No accessible steps in tour' };

    const firstStep = availableSteps[0];
    const now = new Date().toISOString();

    const record: TourProgressRecord = {
      account_id: accountId,
      user_id: userId,
      tour_key: tourKey,
      tour_version: tourVersion,
      status: 'active',
      current_step_id: firstStep.id,
      started_at: now,
      updated_at: now,
      dismissed_at: null,
      completed_at: null,
    };

    const { data, error } = await supabase
      .from('product_tour_progress')
      .upsert(record, { onConflict: 'account_id,user_id,tour_key,tour_version' })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    try {
      await supabase.from('product_tour_events').insert({
        client_event_id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tour_key: tourKey,
        tour_version: tourVersion,
        event_type: 'tour_restarted',
        step_id: firstStep.id,
        account_id: accountId,
        user_id: userId,
        role,
        source: 'dashboard_restart',
        pathname: firstStep.route,
      });
    } catch {}

    return { success: true, progress: data as TourProgressRecord };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to restart tour';
    return { success: false, error: message };
  }
}
