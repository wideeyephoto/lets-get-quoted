/** Numeric-only diagnostics from SignalWire's final report. No conversation text,
 * arguments, URLs or arbitrary provider fields may enter this log projection.
 * Keep it separate from immutable receipt evidence so a release cannot change
 * the payload hash of an old callback retried after deployment.
 */
const METRICS = [
  'latency', 'utterance_latency', 'audio_latency', 'acoustic_latency',
  'eos_to_push_latency', 'execution_latency', 'function_latency',
  'speaking_to_turn_detection', 'turn_detection_to_final_event', 'barge_elapsed_ms',
] as const;
const ROLES = new Set(['user', 'assistant', 'assistant-manual', 'tool']);
const LIMIT = 100;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function duration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 600_000;
}

function stamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 1_000_000_000_000;
}

export function signalWireTimingSummary(payload: unknown) {
  const body = object(payload) ?? {};
  const turns = Array.isArray(body.raw_call_log) && body.raw_call_log.length > 0
    ? body.raw_call_log : Array.isArray(body.call_log) ? body.call_log : [];
  const samples: { index: number; role: string; reported: Record<string, number> }[] = [];
  const firstAudioByLastWord = new Map<number, number>();
  for (const [index, value] of turns.slice(0, 1000).entries()) {
    const turn = object(value);
    if (!turn || typeof turn.role !== 'string' || !ROLES.has(turn.role)) continue;
    const timing = object(turn.timing);
    const reported: Record<string, number> = {};
    for (const key of METRICS) {
      const value = turn[key] ?? timing?.[key];
      if (duration(value)) reported[key] = value;
    }
    if (Object.keys(reported).length > 0 && samples.length < LIMIT) {
      samples.push({ index, role: turn.role, reported });
    }
    // A filler and final response can share one caller turn. Only its first
    // audio belongs in the mouth-to-ear sample; never use transcript timestamps.
    const stamps = object(timing?.stamps_us) ?? object(turn.stamps_us);
    const lastWord = stamps?.last_word_end;
    const firstAudio = stamps?.first_audio;
    if ((turn.role === 'assistant' || turn.role === 'assistant-manual')
      && stamp(lastWord) && stamp(firstAudio) && firstAudio >= lastWord
      && firstAudio - lastWord <= 600_000_000) {
      const previous = firstAudioByLastWord.get(lastWord);
      if (previous !== undefined || firstAudioByLastWord.size < LIMIT) {
        firstAudioByLastWord.set(lastWord, Math.min(previous ?? firstAudio, firstAudio));
      }
    }
  }
  const speechToFirstAudioMs = [...firstAudioByLastWord].map(([lastWord, firstAudio]) => (
    Math.round((firstAudio - lastWord) / 1000)
  ));
  const generations = (Array.isArray(body.times) ? body.times : []).slice(0, LIMIT)
    .flatMap((entry, index) => {
      const row = object(entry);
      if (!row) return [];
      const numeric: Record<string, number> = {};
      for (const key of ['answer_time', 'token_time', 'response_word_count', 'tokens', 'tps']) {
        if (duration(row[key])) numeric[key] = row[key];
      }
      return Object.keys(numeric).length > 0 ? [{ index, ...numeric }] : [];
    });
  return {
    schema: 1,
    available: samples.length > 0 || generations.length > 0 || speechToFirstAudioMs.length > 0,
    source: turns === body.raw_call_log ? 'raw_call_log' : 'call_log',
    inspectedTurns: Math.min(turns.length, 1000),
    truncated: turns.length > 1000 || samples.length === LIMIT || generations.length === LIMIT,
    samples, speechToFirstAudioMs, generations,
  };
}
