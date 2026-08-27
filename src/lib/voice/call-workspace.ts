import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { boundedVoiceHistoryDays } from '@/lib/voice/call-history';

export type VoiceCallOutcome =
  | 'in_progress'
  | 'ai_handled'
  | 'transfer_attempted'
  | 'transferred_and_answered'
  | 'caller_abandoned'
  | 'no_input'
  | 'voicemail_fallback'
  | 'provider_failure'
  | 'completed'
  | 'transferred'
  | 'voicemail'
  | 'abandoned'
  | 'failed'
  | 'unknown';

export type VoiceCallDisposition =
  | 'unreviewed'
  | 'needs_callback'
  | 'callback_scheduled'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'not_a_fit'
  | 'spam'
  | 'resolved';

export type VoiceCallUrgency = 'normal' | 'urgent' | 'emergency';

export type VoiceCallWorkflowData = Readonly<{
  disposition: VoiceCallDisposition;
  urgency: VoiceCallUrgency;
  assignedUserId: string | null;
  callbackDueAt: string | null;
  callbackCompletedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}>;

export type VoiceCallQueueItem = Readonly<{
  id: string;
  providerCallId: string;
  callerNumber: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  aiSeconds: number | null;
  billedMinutes: number | null;
  settlement: string;
  outcome: VoiceCallOutcome;
  outcomeSource: string | null;
  isProvisional: boolean;
  summary: string | null;
  leadId: string | null;
  recordingStatus: string;
  recordingStoragePath: string | null;
  recordingDurationSeconds: number | null;
  workflow: VoiceCallWorkflowData;
}>;

export type VoiceCallNoteItem = Readonly<{
  id: string;
  callId: string;
  authorUserId: string | null;
  authorName: string;
  note: string;
  createdAt: string;
}>;

export type SanitizedTranscriptTurn = Readonly<{
  role: 'caller' | 'assistant';
  content: string;
  timestamp: number | null;
}>;

export type MatchedClientProfile = Readonly<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  totalJobsCount: number;
}>;

export type MatchedLeadProfile = Readonly<{
  id: string;
  name: string;
  phone: string | null;
  status: string;
  address: string | null;
  serviceCategory: string | null;
}>;

export type PriorCallSummary = Readonly<{
  id: string;
  startedAt: string | null;
  aiSeconds: number | null;
  outcome: VoiceCallOutcome;
  summary: string | null;
}>;

export type CallerContactIntelligence = Readonly<{
  client: MatchedClientProfile | null;
  lead: MatchedLeadProfile | null;
  priorCalls: readonly PriorCallSummary[];
  totalPriorCallsCount: number;
}>;

export type VoiceCallDetail = Readonly<{
  id: string;
  providerCallId: string;
  callerNumber: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  aiSeconds: number | null;
  billedMinutes: number | null;
  settlement: string;
  outcome: VoiceCallOutcome;
  outcomeSource: string | null;
  isProvisional: boolean;
  summary: string | null;
  leadId: string | null;
  recordingStatus: string;
  recordingStoragePath: string | null;
  recordingDurationSeconds: number | null;
  workflow: VoiceCallWorkflowData;
  notes: readonly VoiceCallNoteItem[];
  transcript: readonly SanitizedTranscriptTurn[];
  contact: CallerContactIntelligence;
}>;

export type VoiceWorkspaceCounters = Readonly<{
  unreviewed: number;
  needsCallback: number;
  urgent: number;
  transferred: number;
  completedToday: number;
  resolvedCount: number;
  totalCount: number;
  totalAiMinutes: number;
  avgDurationSeconds: number;
  handledCount: number;
  emergencyCount: number;
  leadsGeneratedCount: number;
  peakHour: string | null;
}>;

export const EMPTY_WORKSPACE_COUNTERS: VoiceWorkspaceCounters = {
  unreviewed: 0,
  needsCallback: 0,
  urgent: 0,
  transferred: 0,
  completedToday: 0,
  resolvedCount: 0,
  totalCount: 0,
  totalAiMinutes: 0,
  avgDurationSeconds: 0,
  handledCount: 0,
  emergencyCount: 0,
  leadsGeneratedCount: 0,
  peakHour: null,
};

export type VoiceWorkspaceFilters = Readonly<{
  tab?: 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed';
  dateRange?: 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month';
  query?: string;
  disposition?: VoiceCallDisposition | 'all';
  outcome?: VoiceCallOutcome | 'all';
  urgency?: VoiceCallUrgency | 'all';
  limit?: number;
  historyDays?: number;
  now?: Date;
}>;

export type VoiceWorkspaceQueueResult = Readonly<{
  available: boolean;
  items: readonly VoiceCallQueueItem[];
  counters: VoiceWorkspaceCounters;
}>;

export function formatOutcomeLabel(outcome: VoiceCallOutcome): string {
  switch (outcome) {
    case 'ai_handled':
      return 'AI Handled';
    case 'transfer_attempted':
      return 'Transfer Attempted';
    case 'transferred_and_answered':
    case 'transferred':
      return 'Transferred';
    case 'caller_abandoned':
    case 'abandoned':
      return 'Caller Abandoned';
    case 'no_input':
      return 'No Input';
    case 'voicemail_fallback':
    case 'voicemail':
      return 'Voicemail';
    case 'in_progress':
      return 'In Progress';
    case 'provider_failure':
    case 'failed':
      return 'Provider Failure';
    case 'completed':
      return 'Completed';
    default:
      return 'Unknown';
  }
}

export function formatDispositionLabel(disposition: VoiceCallDisposition): string {
  switch (disposition) {
    case 'unreviewed':
      return 'Unreviewed';
    case 'needs_callback':
      return 'Needs Callback';
    case 'callback_scheduled':
      return 'Callback Scheduled';
    case 'contacted':
      return 'Contacted';
    case 'qualified':
      return 'Qualified';
    case 'converted':
      return 'Converted';
    case 'not_a_fit':
      return 'Not a Fit';
    case 'spam':
      return 'Spam';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Unreviewed';
  }
}

export async function loadVoiceWorkspaceQueue(
  supabase: SupabaseClient,
  accountId: string,
  filters: VoiceWorkspaceFilters = {},
): Promise<VoiceWorkspaceQueueResult> {
  const limit = Math.min(1000, Math.max(1, filters.limit ?? 100));
  const historyDays = boundedVoiceHistoryDays(filters.historyDays);
  const now = filters.now ?? new Date();
  const retainedAfter = new Date(
    now.getTime() - historyDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  // Date range cutoff determination
  const dateRange = filters.dateRange ?? 'all';
  let startCutoffIso: string | null = null;
  if (dateRange !== 'all') {
    const nowMs = now.getTime();
    if (dateRange === 'today') {
      startCutoffIso = todayStartIso;
    } else if (dateRange === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      startCutoffIso = yesterday.toISOString();
    } else if (dateRange === '7d') {
      startCutoffIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateRange === '30d') {
      startCutoffIso = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateRange === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      startCutoffIso = monthStart.toISOString();
    }
  }

  try {
    const { data: rawCalls, error: callsError } = await supabase
      .from('voice_calls')
      .select(`
        id,
        provider_call_id,
        caller_number,
        started_at,
        answered_at,
        ended_at,
        ai_seconds,
        billed_minutes,
        settlement,
        outcome,
        outcome_source,
        is_provisional,
        summary,
        lead_id,
        recording_status,
        recording_storage_path,
        recording_duration_seconds
      `)
      .eq('account_id', accountId)
      .gte('created_at', retainedAfter)
      .order('started_at', { ascending: false, nullsFirst: false });

    if (callsError) {
      console.error('Voice calls workspace queue read failed:', callsError);
      return {
        available: false,
        items: [],
        counters: EMPTY_WORKSPACE_COUNTERS,
      };
    }

    const callRows = rawCalls ?? [];
    const callIds = callRows.map((c) => String(c.id));

    // Read workflow state for these calls
    const workflowMap = new Map<string, VoiceCallWorkflowData>();
    if (callIds.length > 0) {
      const { data: workflows } = await supabase
        .from('voice_call_workflows')
        .select('*')
        .in('call_id', callIds);

      for (const w of workflows ?? []) {
        workflowMap.set(String(w.call_id), {
          disposition: (w.disposition as VoiceCallDisposition) ?? 'unreviewed',
          urgency: (w.urgency as VoiceCallUrgency) ?? 'normal',
          assignedUserId: (w.assigned_user_id as string | null) ?? null,
          callbackDueAt: (w.callback_due_at as string | null) ?? null,
          callbackCompletedAt: (w.callback_completed_at as string | null) ?? null,
          reviewedAt: (w.reviewed_at as string | null) ?? null,
          reviewedBy: (w.reviewed_by as string | null) ?? null,
        });
      }
    }

    const allItems: VoiceCallQueueItem[] = callRows.map((row) => {
      const r = row as Record<string, unknown>;
      const id = String(r.id);
      const workflow = workflowMap.get(id) ?? {
        disposition: 'unreviewed' as const,
        urgency: 'normal' as const,
        assignedUserId: null,
        callbackDueAt: null,
        callbackCompletedAt: null,
        reviewedAt: null,
        reviewedBy: null,
      };

      return {
        id,
        providerCallId: String(r.provider_call_id),
        callerNumber: (r.caller_number as string | null) ?? null,
        startedAt: (r.started_at as string | null) ?? null,
        answeredAt: (r.answered_at as string | null) ?? null,
        endedAt: (r.ended_at as string | null) ?? null,
        aiSeconds: typeof r.ai_seconds === 'number' ? r.ai_seconds : null,
        billedMinutes: typeof r.billed_minutes === 'number' ? r.billed_minutes : null,
        settlement: String(r.settlement ?? 'unsettled'),
        outcome: (r.outcome as VoiceCallOutcome) ?? 'completed',
        outcomeSource: (r.outcome_source as string | null) ?? null,
        isProvisional: Boolean(r.is_provisional),
        summary: (r.summary as string | null) ?? null,
        leadId: (r.lead_id as string | null) ?? null,
        recordingStatus: String(r.recording_status ?? 'none'),
        recordingStoragePath: (r.recording_storage_path as string | null) ?? null,
        recordingDurationSeconds: typeof r.recording_duration_seconds === 'number' ? r.recording_duration_seconds : null,
        workflow,
      };
    });

    // Apply dateRange filter before computing counters
    const dateFilteredItems = startCutoffIso
      ? allItems.filter((i) => i.startedAt && i.startedAt >= startCutoffIso)
      : allItems;

    // Compute top-level counters and analytics on the date-filtered set
    let unreviewed = 0;
    let needsCallback = 0;
    let urgent = 0;
    let transferred = 0;
    let completedToday = 0;
    let resolvedCount = 0;
    let totalAiSeconds = 0;
    let handledCount = 0;
    let emergencyCount = 0;
    let leadsGeneratedCount = 0;
    const hourHistogram: Record<number, number> = {};

    for (const item of dateFilteredItems) {
      if (item.workflow.disposition === 'unreviewed') unreviewed += 1;
      if (item.workflow.disposition === 'needs_callback') needsCallback += 1;
      if (item.workflow.urgency === 'urgent' || item.workflow.urgency === 'emergency') urgent += 1;
      if (item.workflow.urgency === 'emergency') emergencyCount += 1;
      if (item.leadId || item.workflow.disposition === 'converted') leadsGeneratedCount += 1;
      if (item.workflow.disposition === 'resolved' || item.workflow.disposition === 'converted' || item.workflow.disposition === 'contacted') {
        resolvedCount += 1;
      }

      if (item.outcome === 'transfer_attempted' || item.outcome === 'transferred_and_answered' || item.outcome === 'transferred') {
        transferred += 1;
      } else if (item.outcome === 'completed' || item.outcome === 'ai_handled') {
        handledCount += 1;
      }

      if (typeof item.aiSeconds === 'number' && item.aiSeconds > 0) {
        totalAiSeconds += item.aiSeconds;
      }

      if (item.startedAt) {
        if (item.startedAt >= todayStartIso) completedToday += 1;
        const callDate = new Date(item.startedAt);
        if (!Number.isNaN(callDate.getTime())) {
          const hr = callDate.getHours();
          hourHistogram[hr] = (hourHistogram[hr] ?? 0) + 1;
        }
      }
    }

    let peakHourStr: string | null = null;
    let maxHourCount = 0;
    for (const [hourStr, count] of Object.entries(hourHistogram)) {
      if (count > maxHourCount) {
        maxHourCount = count;
        const hrNum = Number(hourStr);
        const ampm = hrNum >= 12 ? 'PM' : 'AM';
        const displayHr = hrNum % 12 === 0 ? 12 : hrNum % 12;
        peakHourStr = `${displayHr} ${ampm}`;
      }
    }

    const totalAiMinutes = Math.ceil(totalAiSeconds / 60);
    const avgDurationSeconds = dateFilteredItems.length > 0 ? Math.round(totalAiSeconds / dateFilteredItems.length) : 0;

    const counters: VoiceWorkspaceCounters = {
      unreviewed,
      needsCallback,
      urgent,
      transferred,
      completedToday,
      resolvedCount,
      totalCount: dateFilteredItems.length,
      totalAiMinutes,
      avgDurationSeconds,
      handledCount,
      emergencyCount,
      leadsGeneratedCount,
      peakHour: peakHourStr,
    };

    // Filter items based on active tab and search params
    let filtered = dateFilteredItems;

    const tab = filters.tab ?? 'all';
    if (tab === 'unreviewed') {
      filtered = filtered.filter((i) => i.workflow.disposition === 'unreviewed');
    } else if (tab === 'needs_callback') {
      filtered = filtered.filter((i) => i.workflow.disposition === 'needs_callback');
    } else if (tab === 'urgent') {
      filtered = filtered.filter((i) => i.workflow.urgency === 'urgent' || i.workflow.urgency === 'emergency');
    } else if (tab === 'transferred') {
      filtered = filtered.filter((i) => i.outcome === 'transfer_attempted' || i.outcome === 'transferred_and_answered' || i.outcome === 'transferred');
    } else if (tab === 'completed') {
      filtered = filtered.filter((i) => i.workflow.disposition === 'resolved' || i.workflow.disposition === 'contacted' || i.workflow.disposition === 'converted');
    }

    if (filters.disposition && filters.disposition !== 'all') {
      filtered = filtered.filter((i) => i.workflow.disposition === filters.disposition);
    }

    if (filters.outcome && filters.outcome !== 'all') {
      filtered = filtered.filter((i) => i.outcome === filters.outcome);
    }

    if (filters.urgency && filters.urgency !== 'all') {
      filtered = filtered.filter((i) => i.workflow.urgency === filters.urgency);
    }

    if (filters.query && filters.query.trim().length > 0) {
      const q = filters.query.trim().toLowerCase();
      filtered = filtered.filter((i) =>
        (i.callerNumber && i.callerNumber.toLowerCase().includes(q))
        || (i.summary && i.summary.toLowerCase().includes(q)),
      );
    }

    const pagedItems = filtered.slice(0, limit);

    return {
      available: true,
      items: pagedItems,
      counters,
    };
  } catch (error) {
    console.error('loadVoiceWorkspaceQueue unexpected error:', error);
    return {
      available: false,
      items: [],
      counters: EMPTY_WORKSPACE_COUNTERS,
    };
  }
}

export function sanitizeTranscriptTurns(rawLog: unknown): readonly SanitizedTranscriptTurn[] {
  if (!Array.isArray(rawLog)) return [];

  const turns: SanitizedTranscriptTurn[] = [];

  for (const item of rawLog) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const roleRaw = typeof r.role === 'string' ? r.role.trim().toLowerCase() : '';
    const content = typeof r.content === 'string' ? r.content.trim() : '';

    if (!content) continue;

    // Filter out system turns, tool instructions, and internal SWAIG schemas
    if (roleRaw === 'system' || roleRaw === 'tool' || roleRaw === 'function') continue;
    if (content.startsWith('SWAIG') || content.includes('{"function"') || content.includes('{"argument"')) continue;

    if (roleRaw === 'user' || roleRaw === 'caller') {
      turns.push({
        role: 'caller',
        content,
        timestamp: typeof r.timestamp === 'number' ? r.timestamp : null,
      });
    } else if (roleRaw === 'assistant' || roleRaw === 'agent' || roleRaw === 'receptionist') {
      turns.push({
        role: 'assistant',
        content,
        timestamp: typeof r.timestamp === 'number' ? r.timestamp : null,
      });
    }
  }

  return turns;
}

export async function loadVoiceCallDetail(
  supabase: SupabaseClient,
  accountId: string,
  callId: string,
): Promise<VoiceCallDetail | null> {
  try {
    const { data: callRow, error: callError } = await supabase
      .from('voice_calls')
      .select('*')
      .eq('id', callId)
      .eq('account_id', accountId)
      .maybeSingle();

    if (callError || !callRow) {
      return null;
    }

    const { data: workflowRow } = await supabase
      .from('voice_call_workflows')
      .select('*')
      .eq('call_id', callId)
      .maybeSingle();

    const { data: notesRows } = await supabase
      .from('voice_call_notes')
      .select('*')
      .eq('call_id', callId)
      .order('created_at', { ascending: false });

    const workflow: VoiceCallWorkflowData = {
      disposition: (workflowRow?.disposition as VoiceCallDisposition) ?? 'unreviewed',
      urgency: (workflowRow?.urgency as VoiceCallUrgency) ?? 'normal',
      assignedUserId: (workflowRow?.assigned_user_id as string | null) ?? null,
      callbackDueAt: (workflowRow?.callback_due_at as string | null) ?? null,
      callbackCompletedAt: (workflowRow?.callback_completed_at as string | null) ?? null,
      reviewedAt: (workflowRow?.reviewed_at as string | null) ?? null,
      reviewedBy: (workflowRow?.reviewed_by as string | null) ?? null,
    };

    const notes: VoiceCallNoteItem[] = (notesRows ?? []).map((n) => ({
      id: String(n.id),
      callId: String(n.call_id),
      authorUserId: (n.author_user_id as string | null) ?? null,
      authorName: String(n.author_name ?? 'Staff Member'),
      note: String(n.note ?? ''),
      createdAt: String(n.created_at ?? new Date().toISOString()),
    }));

    const sanitizedTranscript = sanitizeTranscriptTurns(callRow.transcript);

    // Resolve CRM Contact Intelligence
    let matchedClient: MatchedClientProfile | null = null;
    let matchedLead: MatchedLeadProfile | null = null;
    let priorCalls: PriorCallSummary[] = [];
    let totalPriorCallsCount = 0;

    const callerPhone = (callRow.caller_number as string | null) ?? null;

    if (callerPhone) {
      try {
        const { data: clientRow } = await supabase
          .from('clients')
          .select('id, name, email, phone, address, notes')
          .eq('account_id', accountId)
          .eq('phone', callerPhone)
          .maybeSingle();

        if (clientRow) {
          const { count: jobCount } = await supabase
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .eq('account_id', accountId)
            .eq('client_id', clientRow.id);

          matchedClient = {
            id: String(clientRow.id),
            name: String(clientRow.name),
            email: (clientRow.email as string | null) ?? null,
            phone: (clientRow.phone as string | null) ?? null,
            address: (clientRow.address as string | null) ?? null,
            notes: (clientRow.notes as string | null) ?? null,
            totalJobsCount: jobCount ?? 0,
          };
        }

        if (callRow.lead_id) {
          const { data: leadRow } = await supabase
            .from('leads')
            .select('id, name, phone, status, address, service_category')
            .eq('account_id', accountId)
            .eq('id', callRow.lead_id)
            .maybeSingle();

          if (leadRow) {
            matchedLead = {
              id: String(leadRow.id),
              name: String(leadRow.name ?? 'New Lead'),
              phone: (leadRow.phone as string | null) ?? null,
              status: String(leadRow.status ?? 'new'),
              address: (leadRow.address as string | null) ?? null,
              serviceCategory: (leadRow.service_category as string | null) ?? null,
            };
          }
        } else {
          const { data: leadRow } = await supabase
            .from('leads')
            .select('id, name, phone, status, address, service_category')
            .eq('account_id', accountId)
            .eq('phone', callerPhone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (leadRow) {
            matchedLead = {
              id: String(leadRow.id),
              name: String(leadRow.name ?? 'New Lead'),
              phone: (leadRow.phone as string | null) ?? null,
              status: String(leadRow.status ?? 'new'),
              address: (leadRow.address as string | null) ?? null,
              serviceCategory: (leadRow.service_category as string | null) ?? null,
            };
          }
        }

        const { data: priorRows, count: priorCount } = await supabase
          .from('voice_calls')
          .select('id, started_at, ai_seconds, outcome, summary', { count: 'exact' })
          .eq('account_id', accountId)
          .eq('caller_number', callerPhone)
          .neq('id', callId)
          .order('started_at', { ascending: false })
          .limit(5);

        totalPriorCallsCount = priorCount ?? (priorRows?.length ?? 0);
        priorCalls = (priorRows ?? []).map((p) => ({
          id: String(p.id),
          startedAt: (p.started_at as string | null) ?? null,
          aiSeconds: typeof p.ai_seconds === 'number' ? p.ai_seconds : null,
          outcome: (p.outcome as VoiceCallOutcome) ?? 'completed',
          summary: (p.summary as string | null) ?? null,
        }));
      } catch (crmErr) {
        console.warn('CRM intelligence resolution non-blocking error:', crmErr);
      }
    }

    return {
      id: String(callRow.id),
      providerCallId: String(callRow.provider_call_id),
      callerNumber: callerPhone,
      startedAt: (callRow.started_at as string | null) ?? null,
      answeredAt: (callRow.answered_at as string | null) ?? null,
      endedAt: (callRow.ended_at as string | null) ?? null,
      aiSeconds: typeof callRow.ai_seconds === 'number' ? callRow.ai_seconds : null,
      billedMinutes: typeof callRow.billed_minutes === 'number' ? callRow.billed_minutes : null,
      settlement: String(callRow.settlement ?? 'unsettled'),
      outcome: (callRow.outcome as VoiceCallOutcome) ?? 'completed',
      outcomeSource: (callRow.outcome_source as string | null) ?? null,
      isProvisional: Boolean(callRow.is_provisional),
      summary: (callRow.summary as string | null) ?? null,
      leadId: (callRow.lead_id as string | null) ?? null,
      recordingStatus: String(callRow.recording_status ?? 'none'),
      recordingStoragePath: (callRow.recording_storage_path as string | null) ?? null,
      recordingDurationSeconds: typeof callRow.recording_duration_seconds === 'number' ? callRow.recording_duration_seconds : null,
      workflow,
      notes,
      transcript: sanitizedTranscript,
      contact: {
        client: matchedClient,
        lead: matchedLead,
        priorCalls,
        totalPriorCallsCount,
      },
    };
  } catch (error) {
    console.error('loadVoiceCallDetail error:', error);
    return null;
  }
}
