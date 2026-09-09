import { afterEach, describe, expect, it, vi } from 'vitest';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import { buildVoiceSystemPrompt, type VoiceGroundingContext } from '@/lib/voice/grounding';
import { VoiceToolTiming, voiceReadDeadline, voiceRequestDeadline } from '@/lib/voice/timing';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Dispatch latency contract', () => {
  for (const contractorMode of [true, false]) it(`emits asynchronous language-keyed fillers (staff=${contractorMode})`, () => {
    const answer = signalwireVoiceProvider.renderAnswer({
      kind: 'ai_agent', receiptUrl: 'https://example.com/receipt',
      receiptAuthorization: { scheme: 'basic', username: 'fixture', password: 'fixture' },
      greeting: 'Hello', capMinutes: 60, transferTo: null,
      swaigUrl: 'https://example.com/swaig', contractorMode,
    });
    const main = JSON.parse(answer.body).sections.main;
    const ai = main.find((item: { ai?: unknown }) => item.ai).ai;
    expect(main.find((item: { answer?: unknown }) => item.answer).answer.max_duration).toBe(598);
    expect(ai.params.end_of_speech_timeout).toBe(contractorMode ? 700 : 1000);
    expect(ai.params.enable_turn_detection).toBe(true);
    expect(ai.params.turn_detection_timeout).toBe(250);
    expect(ai.params.function_wait_for_talking).toBe(false);
    expect(ai.params.redact_prompt).toContain('verification codes');
    if (contractorMode) {
      expect(ai.params.utility_model).toBe('gpt-4.1-nano');
      expect(ai.params.auto_correct).toBe(true);
      expect(ai.params.enable_text_normalization).toBe('off');
      expect(ai.params.transparent_barge).toBe(true);
      expect(ai.params.barge_functions).toBe(false);
      expect(ai.params.interrupt_prompt).toContain('do not restart or summarize');
      const lookup = ai.SWAIG.functions.find((fn: { function: string }) => fn.function === 'lookup_jobs');
      expect(lookup.purpose).toContain('current total or recorded quote');
      expect(lookup.argument.properties.include_details.description).toContain('even if only one field is requested');
      const update = ai.SWAIG.functions.find((fn: { function: string }) => fn.function === 'update_job_details');
      expect(update.purpose).toContain('clarify the destination first');
      expect(update.argument.properties.scope.description).toContain('Never put notes');
    } else {
      expect(ai.params.interrupt_prompt).toBeUndefined();
      expect(ai.params.utility_model).toBeUndefined();
      expect(ai.params.auto_correct).toBeUndefined();
      expect(ai.params.enable_text_normalization).toBeUndefined();
    }
    for (const fn of ai.SWAIG.functions.filter((f: { web_hook_url?: string }) => f.web_hook_url)) {
      expect(fn.fillers.default.length).toBeGreaterThan(0);
      expect(fn.wait_for_fillers).toBe(false);
      expect(Array.isArray(fn.fillers)).toBe(false);
    }
  });

  const context: VoiceGroundingContext = {
    companyName: 'Fixture', trade: 'plumbing', serviceNames: [], serviceAreas: '', availableSlots: [],
    contractorStaffCaller: { name: 'Brett', role: 'owner' },
    timezone: 'America/New_York', referenceTime: '2026-09-06T01:30:00.000Z',
  };
  it('anchors relative dates to the business calendar across UTC midnight', () => {
    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('Saturday, September 5, 2026');
    expect(prompt).toContain('America/New_York');
    expect(prompt).toContain('Keep jobs and leads distinct');
    expect(prompt).toContain('Preserve the selected exact job reference');
  });
  it('requires an explicit date if the business timezone is missing or invalid', () => {
    for (const timezone of [null, 'Invalid/Zone']) {
      expect(buildVoiceSystemPrompt({ ...context, timezone })).toContain('Ask for an explicit calendar date');
    }
  });
  it('supplies the observed-call readback, quote-read and interruption rules without removing price-write safeguards', () => {
    const prompt = buildVoiceSystemPrompt(context);
    expect(prompt).toContain('quote the exact Saved text from that tool result');
    expect(prompt).toContain('do not call append_job_caution_or_note again');
    expect(prompt).toContain('current job total, price, or quote');
    expect(prompt).toContain('include_details=true');
    expect(prompt).toContain('Do not restart or summarize the interrupted answer');
    expect(prompt).toContain('price changes require');
    expect(prompt).toContain('Keep job scope and internal notes distinct');
    expect(prompt).toContain('retain the already supplied text and destination');
  });
  it('bounds a hung identity read and cleans up successful read timers', async () => {
    vi.useFakeTimers();
    const pending = voiceReadDeadline(new Promise<never>(() => undefined), 4000);
    const rejected = expect(pending).rejects.toThrow('deadline exceeded');
    await vi.advanceTimersByTimeAsync(4000);
    await rejected;
    await expect(voiceReadDeadline(Promise.resolve('found'), 4000)).resolves.toBe('found');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('passes an actual abort signal to the database transport', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: true });
    const request = Object.assign(Promise.resolve({ data: false }), { abortSignal });
    await expect(voiceRequestDeadline(request, 4000)).resolves.toEqual({ data: true });
    expect(abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
  });
  it('reports server timing using only operational metadata', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const timing = new VoiceToolTiming();
    timing.accountId = 'fixture-account'; timing.providerCallId = 'fixture-call'; timing.functionName = 'lookup_jobs';
    await timing.measure('authorize', async () => true);
    await timing.measure('identity', async () => 'staff');
    timing.finish(200);
    expect(log).toHaveBeenCalledWith('voice_tool_timing', {
      accountId: 'fixture-account', providerCallId: 'fixture-call', functionName: 'lookup_jobs',
      status: 200, durationMs: expect.any(Number), stagesMs: { authorize: expect.any(Number), identity: expect.any(Number) },
    });
  });
});
