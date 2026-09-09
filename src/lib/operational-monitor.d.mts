import type { SupabaseClient } from '@supabase/supabase-js';
export type MonitorCron = { path: string; schedule: string };
export function cronMonitorConfig(crons: MonitorCron[]): { job: string; max_gap_minutes: number; required: boolean }[];
export function resendRequest(path: string, options: { key?: string; method?: string; payload?: unknown; idempotencyKey?: string; fetcher?: typeof fetch }): Promise<Record<string, any>>;
export function sendMonitorFailure(options?: { env?: Record<string, string | undefined>; fetcher?: typeof fetch; now?: Date; drill?: boolean }): Promise<string>;
export function runOperationalMonitor(options: { admin: SupabaseClient; crons: MonitorCron[]; env?: Record<string, string | undefined>; fetcher?: typeof fetch; pause?: (ms: number) => Promise<void> }): Promise<{ active: number; queued: number; claimed: number; accepted: number; delivered: number; failed: number; observedAt: string }>;
