import { describe, expect, it } from 'vitest';
import { signalWireTimingSummary } from '@/lib/voice/provider-timing';
import { minimizeSignalWireVoiceReceiptPayload, signalwireVoiceProvider } from '@/lib/voice/signalwire';

const anchor = 1_788_968_000_000_000;
describe('numeric provider timing projection', () => {
  it('does not change immutable receipt identity when diagnostic fields differ', () => {
    const payload = { call_id: 'test-call', project_id: 'test-project', space_id: 'test-space', action: 'post_conversation' };
    const parsed = signalwireVoiceProvider.parseReceipt(payload);
    if (!parsed.ok) throw Error('Fixture receipt rejected');
    const baseline = minimizeSignalWireVoiceReceiptPayload(payload, parsed.receipt);
    expect(minimizeSignalWireVoiceReceiptPayload({ ...payload,
      raw_call_log: [{ role: 'assistant', content: 'private', latency: 900 }],
      times: [{ answer_time: 2 }],
    }, parsed.receipt)).toEqual(baseline);
  });
  it('deduplicates fillers and replies by the caller last-word anchor, choosing first audio', () => {
    const result = signalWireTimingSummary({ raw_call_log: [
      { role: 'assistant', timing: { stamps_us: { last_word_end: anchor, first_audio: anchor + 7_000_000 } } },
      { role: 'assistant-manual', stamps_us: { last_word_end: anchor, first_audio: anchor + 1_200_000 } },
      { role: 'assistant', stamps_us: { last_word_end: anchor + 20_000_000, first_audio: anchor + 22_000_000 } },
    ] });
    expect(result.speechToFirstAudioMs).toEqual([1200, 2000]);
    expect(result.available).toBe(true);
  });

  it('keeps only numeric allowlisted values and never copies text, identifiers or credentials', () => {
    const result = signalWireTimingSummary({ raw_call_log: [
      { role: 'assistant', content: 'secret words', latency: 420, timing: { audio_latency: 1100, entity: 'secret entity' }, authorization: 'secret auth' },
      { role: 'user', content: 'secret address', eos_to_push_latency: 700 },
      { role: 'secret role', latency: 300 },
      { role: 'tool', execution_latency: 500, original_result: 'secret result' },
    ], times: [{ response: 'secret response', answer_time: 2.5, token_time: 1.2, tokens: 32 }], swaig_log: ['secret log'] });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.samples).toEqual([
      { index: 0, role: 'assistant', reported: { latency: 420, audio_latency: 1100 } },
      { index: 1, role: 'user', reported: { eos_to_push_latency: 700 } },
      { index: 3, role: 'tool', reported: { execution_latency: 500 } },
    ]);
    expect(result.generations[0]).toEqual({ index: 0, answer_time: 2.5, token_time: 1.2, tokens: 32 });
  });

  it('marks missing metrics unavailable without treating transcript publication as audible timing', () => {
    const result = signalWireTimingSummary({ raw_call_log: [], call_log: [
      { role: 'user', timestamp: anchor }, { role: 'assistant', timestamp: anchor + 9_000_000 },
    ] });
    expect(result.available).toBe(false);
    expect(result.speechToFirstAudioMs).toEqual([]);
  });

  it('rejects invalid durations and reversed/unsafe timestamps without coercing strings', () => {
    const result = signalWireTimingSummary({ call_log: [
      { role: 'assistant', latency: '123456', audio_latency: Infinity, utterance_latency: -1, acoustic_latency: 600001,
        stamps_us: { last_word_end: anchor, first_audio: anchor - 1 } },
      { role: 'assistant', stamps_us: { last_word_end: '123456', first_audio: anchor } },
    ] });
    expect(result.available).toBe(false);
  });

  it('bounds diagnostics for a large provider payload', () => {
    const result = signalWireTimingSummary({ raw_call_log: Array.from({ length: 1200 }, (_, i) => ({
      role: 'assistant', latency: 100, stamps_us: { last_word_end: anchor + i * 1_000_000, first_audio: anchor + i * 1_000_000 + 1000 },
    })) });
    expect(result.inspectedTurns).toBe(1000);
    expect(result.samples).toHaveLength(100);
    expect(result.speechToFirstAudioMs).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });
});
