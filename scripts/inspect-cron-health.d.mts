export declare function maxIntervalMinutes(schedule: string): number | null;
export declare function graceMinutesFor(periodMinutes: number): number;

export type JobStatusResult = {
  status: 'ok' | 'idle' | 'stale' | 'silent' | 'failing';
  reason?: string;
  detail: string;
};

export declare function classifyJobStatus(input: {
  job: string;
  schedule: string;
  windowMinutes: number;
  seenRow: { runs: number; failures: number; last_run: string } | null | undefined;
  everRow: { last_run: string; latest_ok: boolean; last_error?: string } | null | undefined;
  now?: Date;
}): JobStatusResult;

export declare function loadEnvFile(): Promise<void>;

export declare function declaredCrons(): Promise<Array<{ job: string; schedule: string }>>;

export declare function runCronInspection(options?: {
  windowMinutes?: number;
  strict?: boolean;
  now?: Date;
}): Promise<{
  silent: Array<{ job: string; schedule: string; status: string; detail: string }>;
  stale: Array<{ job: string; schedule: string; status: string; detail: string }>;
  failing: Array<{ job: string; schedule: string; status: string; detail: string }>;
  idle: Array<{ job: string; schedule: string; status: string; detail: string }>;
  ok: Array<{ job: string; schedule: string; status: string; detail: string }>;
  undeclared?: Array<{ job: string; runs: number }>;
  error?: string;
  skipped?: boolean;
}>;
