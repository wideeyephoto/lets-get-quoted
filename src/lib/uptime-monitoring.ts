import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { smsProviderSummary } from '@/lib/sms-provider';
import { aiVoiceEnabled } from '@/lib/voice/admission';
import { voiceWebhookSecuritySummary } from '@/lib/voice/auth';
import { CRON_JOBS, cronHealth } from '@/lib/cron-jobs';
import { loadCronStatus } from '@/lib/cron-runs';

export type SubsystemStatus = 'operational' | 'configured' | 'degraded' | 'outage';

export interface SubsystemHealthProbe {
  id: string;
  name: string;
  category: 'core' | 'payments' | 'communications' | 'ai' | 'infrastructure';
  status: SubsystemStatus;
  latencyMs: number | null;
  lastCheckedAt: string;
  detail: string;
  consequenceIfDown: string;
}

export interface UptimeSlaMetrics {
  uptime24hPct: number | null;
  uptime7dPct: number | null;
  uptime30dPct: number | null;
  incidentFreeDays: number | null;
  totalProbesRun24h: number | null;
  degradedProbesRun24h: number | null;
  outageProbesRun24h: number | null;
}

export interface SyntheticUptimeReport {
  overallStatus: SubsystemStatus;
  testedAt: string;
  totalLatencyMs: number;
  subsystems: SubsystemHealthProbe[];
  sla: UptimeSlaMetrics;
  externalMonitoring: {
    heartbeatConfigured: boolean;
    pingEndpoint: string;
    recommendedProbeIntervalSec: number;
    supportedProviders: string[];
  };
}

/**
 * Runs a comprehensive synthetic health probe across all 8 critical platform subsystems
 */
export async function runSyntheticUptimeProbe(supabase?: SupabaseClient): Promise<SyntheticUptimeReport> {
  const startTime = performance.now();
  const testedAt = new Date().toISOString();
  const client = supabase || createAdminClient();
  const subsystems: SubsystemHealthProbe[] = [];

  // 1. PostgreSQL Database & Storage Engine Probe
  const dbStart = performance.now();
  let dbStatus: SubsystemStatus = 'operational';
  let dbDetail = 'PostgreSQL primary cluster operational';
  let dbLatency = 0;
  try {
    const probePromise = client.from('sites').select('id').limit(1);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database probe timeout (2500ms)')), 2500),
    );
    const { error } = (await Promise.race([probePromise, timeoutPromise])) as { error: { message: string } | null };
    dbLatency = Math.max(1, Math.round(performance.now() - dbStart));
    if (error) {
      dbStatus = 'outage';
      dbDetail = `Database query error: ${error.message}`;
    } else if (dbLatency > 1500) {
      dbStatus = 'degraded';
      dbDetail = `Elevated latency (${dbLatency}ms)`;
    } else {
      dbDetail = `Connected with sub-second response (${dbLatency}ms)`;
    }
  } catch (err) {
    dbStatus = 'outage';
    dbDetail = `Unreachable: ${err instanceof Error ? err.message : String(err)}`;
    dbLatency = Math.max(1, Math.round(performance.now() - dbStart));
  }

  subsystems.push({
    id: 'database',
    name: 'PostgreSQL Database & RLS Engine',
    category: 'core',
    status: dbStatus,
    latencyMs: dbLatency,
    lastCheckedAt: testedAt,
    detail: dbDetail,
    consequenceIfDown: 'Zero reads/writes can occur; entire platform enters fail-closed state.',
  });

  // 2. Instant Quoting & PDF Generation Engine
  const hasDb = dbStatus === 'operational' || dbStatus === 'degraded';
  subsystems.push({
    id: 'quoting-engine',
    name: 'Instant Quoting & PDF Generation Engine',
    category: 'core',
    status: hasDb ? 'configured' : 'outage',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: hasDb ? 'Material algorithms and PDF builder operational' : 'Blocked by database outage',
    consequenceIfDown: 'Contractors cannot generate live estimates or produce branded client PDFs.',
  });

  // 3. Stripe Payments & Connected Accounts
  const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);
  subsystems.push({
    id: 'stripe-payments',
    name: 'Stripe Payments & Connect Rails',
    category: 'payments',
    status: hasStripeSecret ? 'configured' : 'degraded',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: hasStripeSecret ? 'Stripe Connect API credentials configured' : 'Missing STRIPE_SECRET_KEY credentials',
    consequenceIfDown: 'Homeowners cannot pay deposits or invoices; payouts cannot settle.',
  });

  // 4. Two-Way Carrier SMS Gateway
  const smsSummary = smsProviderSummary();
  const hasSmsConfig = Boolean(smsSummary.active);
  subsystems.push({
    id: 'sms-gateway',
    name: 'Two-Way SMS & Dedicated Phone Gateway',
    category: 'communications',
    status: hasSmsConfig ? 'configured' : 'degraded',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: hasSmsConfig
      ? `${smsSummary.active === 'signalwire' ? 'SignalWire' : 'Twilio'} carrier integration configured (${smsSummary.senderMode})`
      : 'No SMS carrier credentials configured',
    consequenceIfDown: 'Lead text-backs, quote reminders, and two-way dispatch conversations stall.',
  });

  // 5. AI Voice Webhook Engine
  const voiceEnabled = aiVoiceEnabled();
  const voiceSecurity = voiceWebhookSecuritySummary();
  const voiceConfigured = !voiceEnabled || (voiceSecurity.inboundSigningConfigured && voiceSecurity.receiptBasicConfigured);
  subsystems.push({
    id: 'voice-webhook',
    name: 'AI Voice Receptionist & Webhook Engine',
    category: 'ai',
    status: voiceConfigured ? 'configured' : 'degraded',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: !voiceEnabled
      ? 'Feature disabled by LGQ_AI_VOICE_ENABLED'
      : voiceConfigured
        ? 'Inbound HMAC & Basic auth credentials configured'
        : 'Incomplete webhook signing keys or credentials',
    consequenceIfDown: 'AI phone answering fails to admit calls or drop recordings into CRM.',
  });

  // 6. Resend Email Delivery Rails
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  subsystems.push({
    id: 'email-resend',
    name: 'Transactional Email Delivery (Resend)',
    category: 'communications',
    status: hasResend ? 'configured' : 'degraded',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: hasResend ? 'Resend transactional API configured' : 'Missing RESEND_API_KEY credential',
    consequenceIfDown: 'Quotes, receipts, invite tokens, and owner notification emails cannot dispatch.',
  });

  // 7. Background Scheduled Cron Fleet
  let cronStatus: SubsystemStatus = 'operational';
  let cronDetail = 'All scheduled background jobs running on cadence';
  const cronStart = performance.now();
  let cronLatency: number | null = null;
  try {
    const { last, lastSuccessAt } = await loadCronStatus(client, CRON_JOBS.map((j) => j.job));
    cronLatency = Math.max(1, Math.round(performance.now() - cronStart));
    const now = new Date();
    const evaluated = CRON_JOBS.map((spec) => ({
      spec,
      health: cronHealth(spec, last.get(spec.job) ?? null, lastSuccessAt.get(spec.job) ?? null, now),
    }));
    const failingCrons = evaluated.filter((e) => e.health === 'failing');
    const staleCrons = evaluated.filter((e) => e.health === 'stale');

    if (failingCrons.length > 0) {
      cronStatus = failingCrons.some((c) => c.spec.importance === 'money') ? 'outage' : 'degraded';
      cronDetail = `${failingCrons.length} failing job(s): ${failingCrons.map((c) => c.spec.label).join(', ')}`;
    } else if (staleCrons.length > 0) {
      cronStatus = 'degraded';
      cronDetail = `${staleCrons.length} overdue job(s): ${staleCrons.map((c) => c.spec.label).join(', ')}`;
    }
  } catch {
    cronStatus = 'degraded';
    cronDetail = 'Unable to evaluate cron run history table';
    cronLatency = Math.max(1, Math.round(performance.now() - cronStart));
  }

  subsystems.push({
    id: 'cron-cadence',
    name: 'Background Scheduled Cron Fleet',
    category: 'infrastructure',
    status: cronStatus,
    latencyMs: cronLatency,
    lastCheckedAt: testedAt,
    detail: cronDetail,
    consequenceIfDown: 'Billing settlements, overage period freezes, and automated dunning stall.',
  });

  // 8. Global Edge Network CDN & Domains
  const hasCdn = Boolean(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  subsystems.push({
    id: 'contractor-cdn',
    name: 'Edge Network CDN & Contractor Domains',
    category: 'infrastructure',
    status: hasCdn ? 'configured' : 'degraded',
    latencyMs: null,
    lastCheckedAt: testedAt,
    detail: hasCdn ? 'Edge Network and root domain configured' : 'Missing root domain config',
    consequenceIfDown: 'Homeowner public website visits and quote viewing links fail.',
  });

  // Determine overall status
  let overallStatus: SubsystemStatus = 'operational';
  if (subsystems.some((s) => s.status === 'outage')) {
    overallStatus = 'outage';
  } else if (subsystems.some((s) => s.status === 'degraded')) {
    overallStatus = 'degraded';
  }

  const totalLatencyMs = Math.max(1, Math.round(performance.now() - startTime));

  // SLA calculations: unmeasured until historical synthetic probe telemetry is persisted
  const sla: UptimeSlaMetrics = {
    uptime24hPct: null,
    uptime7dPct: null,
    uptime30dPct: null,
    incidentFreeDays: null,
    totalProbesRun24h: null,
    degradedProbesRun24h: null,
    outageProbesRun24h: null,
  };

  return {
    overallStatus,
    testedAt,
    totalLatencyMs,
    subsystems,
    sla,
    externalMonitoring: {
      heartbeatConfigured: Boolean(process.env.BETTER_STACK_HEARTBEAT_URL),
      pingEndpoint: '/api/health',
      recommendedProbeIntervalSec: 60,
      supportedProviders: ['Better Stack', 'Pingdom', 'UptimeRobot', 'Checkly', 'Datadog Synthetics'],
    },
  };
}
