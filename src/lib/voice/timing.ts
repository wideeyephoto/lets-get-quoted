import 'server-only';

// Only operational metadata belongs here: never arguments, phone numbers,
// transcripts, tokens, or raw provider errors.
export class VoiceToolTiming {
  private readonly started = performance.now();
  private readonly stages: Record<string, number> = {};
  accountId?: string;
  providerCallId?: string;
  functionName?: string;

  async measure<T>(stage: 'authorize' | 'identity' | 'dispatch', work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await work();
    } finally {
      this.stages[stage] = Math.round(performance.now() - start);
    }
  }

  finish(status: number): void {
    if (!this.accountId) return;
    console.info('voice_tool_timing', {
      accountId: this.accountId,
      providerCallId: this.providerCallId,
      functionName: this.functionName,
      status,
      durationMs: Math.round(performance.now() - this.started),
      stagesMs: this.stages,
    });
  }
}

export function voiceRequestDeadline<T>(
  request: PromiseLike<T> & { abortSignal?: (signal: AbortSignal) => PromiseLike<T> },
  timeoutMs: number,
): PromiseLike<T> {
  return request.abortSignal ? request.abortSignal(AbortSignal.timeout(timeoutMs)) : request;
}

// Auth's admin client does not expose AbortSignal. Only use this for reads:
// returning early is safe, but the underlying read may still finish afterward.
export async function voiceReadDeadline<T>(read: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Voice read deadline exceeded')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
