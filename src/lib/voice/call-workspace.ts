import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { boundedVoiceHistoryDays } from '@/lib/voice/call-history';
import { detectCallEmergency } from '@/lib/voice/triage';

import type {
  VoiceCallOutcome,
  VoiceCallDisposition,
} from '@/lib/voice/call-formatting';
export type {
  VoiceCallOutcome,
  VoiceCallDisposition,
};
export {
  formatOutcomeLabel,
  formatDispositionLabel,
} from '@/lib/voice/call-formatting';

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
  forwardingSeconds?: number | null;
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

export {
  parseVoiceCallSummary,
  type StructuredVoiceSummary,
  type ParsedVoiceCallSummary,
} from '@/lib/voice/call-formatting';

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
  forwardingSeconds?: number | null;
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
  answeredCount: number;
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
  answeredCount: 0,
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
  page?: number;
  historyDays?: number;
  timezone?: string;
  now?: Date;
}>;

export type VoiceWorkspaceQueueResult = Readonly<{
  available: boolean;
  items: readonly VoiceCallQueueItem[];
  counters: VoiceWorkspaceCounters;
  totalFiltered: number;
  page: number;
  pageSize: number;
}>;


export function getTimezoneDayBoundaries(now: Date, timeZone: string): {
  todayStartIso: string;
  yesterdayStartIso: string;
  monthStartIso: string;
} {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    const year = parseInt(getPart('year'), 10);
    const month = parseInt(getPart('month'), 10);
    const day = parseInt(getPart('day'), 10);

    const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const probeParts = formatter.formatToParts(localMidnightAsUtc);
    const pGet = (t: string) => probeParts.find((p) => p.type === t)?.value ?? '00';
    const pYear = parseInt(pGet('year'), 10);
    const pMonth = parseInt(pGet('month'), 10);
    const pDay = parseInt(pGet('day'), 10);
    const pHour = parseInt(pGet('hour'), 10);
    const pMin = parseInt(pGet('minute'), 10);
    const pSec = parseInt(pGet('second'), 10);

    const probeDateInTz = new Date(Date.UTC(pYear, pMonth - 1, pDay, pHour, pMin, pSec));
    const offsetMs = probeDateInTz.getTime() - localMidnightAsUtc.getTime();

    const todayStart = new Date(localMidnightAsUtc.getTime() - offsetMs);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const localMonthStartAsUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const monthProbeParts = formatter.formatToParts(localMonthStartAsUtc);
    const mpGet = (t: string) => monthProbeParts.find((p) => p.type === t)?.value ?? '00';
    const mpYear = parseInt(mpGet('year'), 10);
    const mpMonth = parseInt(mpGet('month'), 10);
    const mpDay = parseInt(mpGet('day'), 10);
    const mpHour = parseInt(mpGet('hour'), 10);
    const mpMin = parseInt(mpGet('minute'), 10);
    const mpSec = parseInt(mpGet('second'), 10);
    const monthProbeInTz = new Date(Date.UTC(mpYear, mpMonth - 1, mpDay, mpHour, mpMin, mpSec));
    const monthOffsetMs = monthProbeInTz.getTime() - localMonthStartAsUtc.getTime();
    const monthStart = new Date(localMonthStartAsUtc.getTime() - monthOffsetMs);

    return {
      todayStartIso: todayStart.toISOString(),
      yesterdayStartIso: yesterdayStart.toISOString(),
      monthStartIso: monthStart.toISOString(),
    };
  } catch {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      todayStartIso: today.toISOString(),
      yesterdayStartIso: yest.toISOString(),
      monthStartIso: month.toISOString(),
    };
  }
}

export function getLocalHour(isoDate: string, timeZone: string): number | null {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(d);
    const parsed = parseInt(hourStr, 10);
    return Number.isFinite(parsed) ? (parsed === 24 ? 0 : parsed) : null;
  } catch {
    return d.getHours();
  }
}

export async function loadVoiceWorkspaceQueue(
  supabase: SupabaseClient,
  accountId: string,
  filters: VoiceWorkspaceFilters = {},
): Promise<VoiceWorkspaceQueueResult> {
  const limit = Math.min(1000, Math.max(1, filters.limit ?? 100));
  const page = Math.max(1, filters.page ?? 1);
  const historyDays = boundedVoiceHistoryDays(filters.historyDays);
  const timezone = filters.timezone || 'America/New_York';
  const now = filters.now ?? new Date();
  const retainedAfter = new Date(
    now.getTime() - historyDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { todayStartIso, yesterdayStartIso, monthStartIso } = getTimezoneDayBoundaries(now, timezone);

  // Date range cutoff determination
  const dateRange = filters.dateRange ?? 'all';
  let startCutoffIso: string | null = null;
  let endCutoffIso: string | null = null;
  if (dateRange !== 'all') {
    const nowMs = now.getTime();
    if (dateRange === 'today') {
      startCutoffIso = todayStartIso;
    } else if (dateRange === 'yesterday') {
      startCutoffIso = yesterdayStartIso;
      endCutoffIso = todayStartIso;
    } else if (dateRange === '7d') {
      startCutoffIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateRange === '30d') {
      startCutoffIso = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (dateRange === 'month') {
      startCutoffIso = monthStartIso;
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
        forwarding_seconds,
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
      .gte('started_at', retainedAfter)
      .order('started_at', { ascending: false, nullsFirst: false });

    if (callsError) {
      console.error('Voice calls workspace queue read failed:', callsError);
      return {
        available: false,
        items: [],
        counters: EMPTY_WORKSPACE_COUNTERS,
        totalFiltered: 0,
        page,
        pageSize: limit,
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
      const baseWorkflow = workflowMap.get(id) ?? {
        disposition: 'unreviewed' as const,
        urgency: 'normal' as const,
        assignedUserId: null,
        callbackDueAt: null,
        callbackCompletedAt: null,
        reviewedAt: null,
        reviewedBy: null,
      };

      let urgency = baseWorkflow.urgency;
      // Live emergency detection: elevate provisional or unflagged emergencies if summary detects emergency
      if (urgency === 'normal' && r.summary) {
        const emergency = detectCallEmergency(String(r.summary));
        if (emergency.isEmergency) {
          urgency = emergency.severity === 'critical' ? 'emergency' : 'urgent';
        }
      }

      const workflow: VoiceCallWorkflowData = {
        ...baseWorkflow,
        urgency,
      };

      return {
        id,
        providerCallId: String(r.provider_call_id),
        callerNumber: (r.caller_number as string | null) ?? null,
        startedAt: (r.started_at as string | null) ?? null,
        answeredAt: (r.answered_at as string | null) ?? null,
        endedAt: (r.ended_at as string | null) ?? null,
        aiSeconds: typeof r.ai_seconds === 'number' ? r.ai_seconds : null,
        forwardingSeconds: typeof r.forwarding_seconds === 'number' ? r.forwarding_seconds : null,
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
    const dateFilteredItems = allItems.filter((i) => {
      if (!i.startedAt) return !startCutoffIso;
      if (startCutoffIso && i.startedAt < startCutoffIso) return false;
      if (endCutoffIso && i.startedAt >= endCutoffIso) return false;
      return true;
    });

    // Compute top-level counters and analytics on the date-filtered set
    let unreviewed = 0;
    let needsCallback = 0;
    let urgent = 0;
    let transferred = 0;
    let completedToday = 0;
    let resolvedCount = 0;
    let totalBilledMinutes = 0;
    let handledCount = 0;
    let emergencyCount = 0;
    let leadsGeneratedCount = 0;
    let answeredCount = 0;
    let totalCompletedAiSeconds = 0;
    let completedCallsWithDuration = 0;
    const hourHistogram: Record<number, number> = {};

    for (const item of dateFilteredItems) {
      const isAnswered = Boolean(item.answeredAt) || (
        item.outcome !== 'caller_abandoned' &&
        item.outcome !== 'abandoned' &&
        item.outcome !== 'failed' &&
        item.outcome !== 'provider_failure' &&
        item.outcome !== 'no_input'
      );
      if (isAnswered) {
        answeredCount += 1;
      }

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

      if (['allowance', 'overage'].includes(item.settlement) && typeof item.billedMinutes === 'number' && item.billedMinutes > 0) {
        totalBilledMinutes += item.billedMinutes;
      }

      // Exclude in-progress and zero-duration calls from average calculation
      if (!item.isProvisional && item.outcome !== 'in_progress' && typeof item.aiSeconds === 'number' && item.aiSeconds > 0) {
        totalCompletedAiSeconds += item.aiSeconds;
        completedCallsWithDuration += 1;
      }

      if (item.startedAt) {
        if (item.startedAt >= todayStartIso) completedToday += 1;
        const hr = getLocalHour(item.startedAt, timezone);
        if (hr !== null) {
          hourHistogram[hr] = (hourHistogram[hr] ?? 0) + 1;
        }
      }
    }

    let peakHourStr: string | null = null;
    const callsWithTimestamp = dateFilteredItems.filter((i) => Boolean(i.startedAt)).length;
    // Minimum sample guard: require at least 3 calls before reporting a peak hour
    if (callsWithTimestamp >= 3) {
      const sortedHours = Object.entries(hourHistogram)
        .map(([h, c]) => ({ hour: Number(h), count: c }))
        .sort((a, b) => b.count - a.count || a.hour - b.hour);

      if (sortedHours.length > 0 && sortedHours[0]!.count > 0) {
        const top = sortedHours[0]!;
        const hrNum = top.hour;
        const ampm = hrNum >= 12 ? 'PM' : 'AM';
        const displayHr = hrNum % 12 === 0 ? 12 : hrNum % 12;
        peakHourStr = `${displayHr} ${ampm}`;
      }
    }

    const avgDurationSeconds = completedCallsWithDuration > 0
      ? Math.round(totalCompletedAiSeconds / completedCallsWithDuration)
      : 0;

    const counters: VoiceWorkspaceCounters = {
      unreviewed,
      needsCallback,
      urgent,
      transferred,
      completedToday,
      resolvedCount,
      totalCount: dateFilteredItems.length,
      answeredCount,
      totalAiMinutes: totalBilledMinutes,
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

    const offset = (page - 1) * limit;
    const pagedItems = filtered.slice(offset, offset + limit);

    return {
      available: true,
      items: pagedItems,
      counters,
      totalFiltered: filtered.length,
      page,
      pageSize: limit,
    };
  } catch (error) {
    console.error('loadVoiceWorkspaceQueue unexpected error:', error);
    return {
      available: false,
      items: [],
      counters: EMPTY_WORKSPACE_COUNTERS,
      totalFiltered: 0,
      page,
      pageSize: limit,
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
      forwardingSeconds: typeof callRow.forwarding_seconds === 'number' ? callRow.forwarding_seconds : null,
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
