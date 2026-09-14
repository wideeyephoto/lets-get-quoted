import type { SupabaseClient } from '@supabase/supabase-js';

export type MonitorCron = { path: string; schedule: string };

export type MonitorState = 'healthy' | 'degraded' | 'outage' | 'recovered' | 'recovered_interruption';

export type InterruptionDetail = {
  stage: string;
  code: string | null;
  httpStatus: number | null;
  elapsedMs: number;
  retryAttempt: number;
  isGatewayTimeout: boolean;
};

export type OperationalMonitorResult = {
  active: number;
  queued: number;
  claimed: number;
  accepted: number;
  delivered: number;
  failed: number;
  observedAt: string;
  state: MonitorState;
  outageId: string | null;
  wasOutage: boolean;
  interruptions: InterruptionDetail[];
};

export class OperationalMonitorError extends Error {
  stage: string;
  dbCode: string | null;
  httpStatus: number | null;
  elapsedMs: number;
  retryAttempt: number;
  isGatewayTimeout: boolean;
  isNetworkError: boolean;
  isRateLimit: boolean;
  isFatal: boolean;
  sanitizedMessage: string;
  isRetryable: boolean;
}

export function cronMonitorConfig(crons: MonitorCron[]): { job: string; max_gap_minutes: number; required: boolean }[];
export function sanitizeErrorMessage(message: unknown): string;
export function parseStructuredError(error: unknown, stage: string, options?: { elapsedMs?: number; retryAttempt?: number }): OperationalMonitorError;
export function logMonitorDiagnostic(event: string, data?: Record<string, unknown>): void;
export function requireResult<T = any>(result: { data: T; error: any }, stage: string, options?: { elapsedMs?: number; retryAttempt?: number }): T;
export function resendRequest(path: string, options: { key?: string; method?: string; payload?: unknown; idempotencyKey?: string; fetcher?: typeof fetch }): Promise<Record<string, any>>;
export function operationalRecipient(env: Record<string, string | undefined>): string;
export function assertOperationalDeliveryAllowed(admin: SupabaseClient, payload: unknown, recipient: string): Promise<void>;
export function withSafeRetry<T>(fn: (attempt: number) => Promise<T>, stage: string, options?: Record<string, unknown>): Promise<T>;
export function recordDurableSuccess(admin: SupabaseClient, options?: { source?: string }): Promise<{ monitor_state: string; was_outage: boolean; outage_id: string | null }>;
export function recordDurableFailure(admin: SupabaseClient, error: unknown, options?: { source?: string; deploymentId?: string | null }): Promise<{ monitor_state: string; consecutive_failures: number; should_alert: boolean; is_first_outage_alert: boolean; outage_id: string }>;
export function claimNotificationDispatch(admin: SupabaseClient, options?: { outageId?: string; type?: string }): Promise<boolean>;
export function sendMonitorFailure(options?: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: Date; drill?: boolean; error?: unknown; stateInfo?: any; source?: string; deploymentId?: string | null }): Promise<string>;
export function sendMonitorFailureEmail(options?: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: Date; drill?: boolean; error?: unknown; stateInfo?: any; source?: string; deploymentId?: string | null }): Promise<string>;
export function sendMonitorRecovery(options?: { admin?: SupabaseClient; env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: Date; drill?: boolean; result?: any; stateInfo?: any; source?: string; deploymentId?: string | null }): Promise<string | null>;
export function runOperationalMonitor(options: { admin: SupabaseClient; crons: MonitorCron[]; env?: Record<string, string | undefined>; fetcher?: typeof fetch; pause?: (ms: number) => Promise<void>; source?: string; runId?: string | null; deploymentId?: string | null }): Promise<OperationalMonitorResult>;
