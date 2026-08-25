import { describe, expect, it } from 'vitest';
import {
  AI_VOICE_DISCLOSURE,
  RECORDING_DISCLOSURE,
  greetingWithAiDisclosure,
  type VoiceAnswerPlan,
} from '@/lib/voice/provider';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import {
  inferProviderOutcome,
  recordCallHistory,
  recordProvisionalVoiceCall,
} from '@/lib/voice/settlement';
import {
  loadVoiceCallDetail,
  loadVoiceWorkspaceQueue,
  sanitizeTranscriptTurns,
} from '@/lib/voice/call-workspace';
import { detectCallEmergency } from '@/lib/voice/triage';

const ACCOUNT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROVIDER_CALL_ID = 'SW-CALL-987654321';
const CALL_ID = 'vc-001';

describe('Voice Calls Workspace Complete End-to-End Lifecycle', () => {
  it('executes full 7-stage lifecycle: admission -> swml -> settlement -> recording -> queue -> detail -> staff workflow', async () => {
    const memoryDb: {
      voice_calls: Record<string, unknown>[];
      voice_call_workflows: Record<string, unknown>[];
      voice_call_notes: Record<string, unknown>[];
      leads: Record<string, unknown>[];
      clients: Record<string, unknown>[];
      jobs: Record<string, unknown>[];
    } = {
      voice_calls: [],
      voice_call_workflows: [],
      voice_call_notes: [],
      leads: [],
      clients: [],
      jobs: [],
    };

    const mockSupabase = {
      from(table: keyof typeof memoryDb) {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'order', 'limit', 'gte', 'in', 'neq']) {
          chain[m] = () => chain;
        }

        let eqConditions: Record<string, unknown> = {};
        chain.eq = (col: string, val: unknown) => {
          eqConditions[col] = val;
          return chain;
        };

        chain.maybeSingle = async () => {
          const rows = memoryDb[table].filter((r) =>
            Object.entries(eqConditions).every(([k, v]) => r[k] === v),
          );
          return { data: rows[0] ?? null, error: null };
        };

        chain.insert = async (row: Record<string, unknown>) => {
          const inserted = { id: row.id ?? `id-${Date.now()}`, ...row };
          memoryDb[table].push(inserted);
          return { data: [inserted], error: null };
        };

        chain.update = (row: Record<string, unknown>) => {
          const rows = memoryDb[table].filter((r) =>
            Object.entries(eqConditions).every(([k, v]) => r[k] === v),
          );
          for (const target of rows) {
            Object.assign(target, row);
          }
          return chain;
        };

        chain.upsert = async (row: Record<string, unknown>) => {
          const existingIdx = memoryDb[table].findIndex((r) =>
            (row.id && r.id === row.id)
            || (row.call_id && r.call_id === row.call_id)
            || (row.provider_call_id && r.provider_call_id === row.provider_call_id),
          );
          if (existingIdx >= 0) {
            Object.assign(memoryDb[table][existingIdx]!, row);
          } else {
            memoryDb[table].push({ id: row.id ?? `id-${Date.now()}`, ...row });
          }
          return { error: null };
        };

        (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
          const rows = memoryDb[table].filter((r) =>
            Object.entries(eqConditions).every(([k, v]) => r[k] === v),
          );
          return resolve({ data: rows, error: null });
        };

        return chain;
      },
    } as never;

    // Stage 1: Call Admission & Provisional Record
    await recordProvisionalVoiceCall(mockSupabase, {
      accountId: ACCOUNT_ID,
      provider: 'signalwire',
      providerCallId: PROVIDER_CALL_ID,
      callerNumber: '+12485550199',
      startedAt: new Date().toISOString(),
    });

    expect(memoryDb.voice_calls).toHaveLength(1);
    const provisional = memoryDb.voice_calls[0]!;
    expect(provisional.provider_call_id).toBe(PROVIDER_CALL_ID);
    expect(provisional.is_provisional).toBe(true);
    expect(provisional.outcome).toBe('in_progress');

    // Stage 2: SignalWire SWML Answer Rendering with Disclosures and Recording
    const plan: VoiceAnswerPlan = {
      kind: 'ai_agent',
      receiptUrl: 'https://app.letsgetquoted.com/api/voice/post-prompt',
      receiptAuthorization: { scheme: 'basic', username: 'sw_user', password: 'sw_password' },
      greeting: 'Thanks for calling BrokePipes Plumbing.',
      capMinutes: 10,
      transferTo: '+12485559999',
      recordCall: true,
      recordingStatusUrl: 'https://app.letsgetquoted.com/api/voice/recording-status',
    };

    const rendered = signalwireVoiceProvider.renderAnswer(plan);
    expect(rendered.contentType).toBe('application/json');
    const swml = JSON.parse(rendered.body);
    expect(swml.sections.main).toHaveLength(4);
    expect(swml.sections.main[0]).toEqual({ answer: {} });
    expect(swml.sections.main[1]).toMatchObject({
      record_call: {
        status_url: 'https://app.letsgetquoted.com/api/voice/recording-status',
        format: 'mp3',
      },
    });
    expect(swml.sections.main[2].play.url).toContain(AI_VOICE_DISCLOSURE);
    expect(swml.sections.main[2].play.url).toContain(RECORDING_DISCLOSURE);

    // Stage 3: Conversation Settlement & Ingestion
    const rawConversation = [
      { role: 'system', content: 'You are an AI receptionist for BrokePipes.', timestamp: null },
      { role: 'user', content: 'We smell a natural gas leak in our basement and the pipe is hissing.', timestamp: null },
      { role: 'assistant', content: 'Please evacuate immediately. I am alerting emergency dispatch.', timestamp: null },
      { role: 'tool', content: 'SWAIG tool dispatch_emergency invoked', timestamp: null },
    ];

    const receipt = {
      provider: 'signalwire' as const,
      providerCallId: PROVIDER_CALL_ID,
      eventType: 'post_conversation' as const,
      projectId: 'proj-1',
      spaceId: 'space-1',
      callStartMicros: 1000000,
      callAnswerMicros: 2000000,
      callEndMicros: 87000000,
      aiStartMicros: 2000000,
      aiEndMicros: 87000000,
      callerNumber: '+12485550199',
      summary: 'Emergency natural gas leak detected in basement.',
      callLog: rawConversation,
    };

    const inferredOutcome = inferProviderOutcome(receipt);
    expect(inferredOutcome).toBe('ai_handled');

    const emergency = detectCallEmergency('We smell a natural gas leak in our basement and the pipe is hissing.');
    expect(emergency.isEmergency).toBe(true);

    await recordCallHistory(mockSupabase, receipt, {
      accountId: ACCOUNT_ID,
      minutes: 2,
      unmetered: false,
      overage: false,
      unbillable: false,
      leadId: 'lead-001',
      voiceEventId: 'evt-001',
    });

    const settledCall = memoryDb.voice_calls[0]!;
    expect(settledCall.is_provisional).toBe(false);
    expect(settledCall.outcome).toBe('ai_handled');
    expect(settledCall.outcome_source).toBe('swml_post_prompt');

    // Urgent / Emergency workflow was created automatically
    expect(memoryDb.voice_call_workflows).toHaveLength(1);
    expect(memoryDb.voice_call_workflows[0]!.urgency).toBe('emergency');

    // Stage 4: Recording Ingest Callback
    Object.assign(settledCall, {
      recording_status: 'ready',
      recording_storage_path: 'https://cdn.signalwire.com/recordings/SW-CALL-987654321.mp3',
      recording_duration_seconds: 85,
      recording_size_bytes: 680000,
      recording_content_type: 'audio/mp3',
    });

    // Stage 5: Workspace Queue & Counters
    const queue = await loadVoiceWorkspaceQueue(mockSupabase, ACCOUNT_ID);
    expect(queue.available).toBe(true);
    expect(queue.items).toHaveLength(1);
    expect(queue.counters.urgent).toBe(1);
    expect(queue.counters.unreviewed).toBe(1);
    expect(queue.items[0]!.workflow.urgency).toBe('emergency');

    // Stage 6: Transcript Detail View
    const callDetail = await loadVoiceCallDetail(mockSupabase, ACCOUNT_ID, String(settledCall.id));
    expect(callDetail).not.toBeNull();
    expect(callDetail!.transcript).toHaveLength(2);
    expect(callDetail!.transcript[0]).toEqual({
      role: 'caller',
      content: 'We smell a natural gas leak in our basement and the pipe is hissing.',
      timestamp: null,
    });
    expect(callDetail!.transcript[1]).toEqual({
      role: 'assistant',
      content: 'Please evacuate immediately. I am alerting emergency dispatch.',
      timestamp: null,
    });
    expect(callDetail!.recordingStatus).toBe('ready');

    // Stage 7: Staff Workflow Note & Disposition
    memoryDb.voice_call_workflows[0]!.disposition = 'contacted';
    memoryDb.voice_call_workflows[0]!.reviewed_by = 'dispatcher-1';
    memoryDb.voice_call_notes.push({
      id: 'note-01',
      call_id: settledCall.id,
      account_id: ACCOUNT_ID,
      author_user_id: 'dispatcher-1',
      author_name: 'Sarah',
      note: 'Dispatched emergency tech team onsite.',
      created_at: new Date().toISOString(),
    });

    const updatedDetail = await loadVoiceCallDetail(mockSupabase, ACCOUNT_ID, String(settledCall.id));
    expect(updatedDetail!.workflow.disposition).toBe('contacted');
    expect(updatedDetail!.notes).toHaveLength(1);
    expect(updatedDetail!.notes[0]!.note).toBe('Dispatched emergency tech team onsite.');
  });
});
