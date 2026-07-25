import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { listClientsWithStats, getClient, type Client } from '@/lib/clients';
import { sendRebookInviteSms } from '@/lib/sms';
import { sendRebookInviteEmail } from '@/lib/email';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
const DAY = 24 * 60 * 60 * 1000;

// Default "due to rebook" threshold, and the options the page offers.
export const DEFAULT_REBOOK_DAYS = 90;
export const REBOOK_DAY_OPTIONS = [60, 90, 120, 180];

// Don't re-invite a client we already nudged within this window (avoid spam).
const REINVITE_COOLDOWN_DAYS = 14;
const MAX_INVITES_PER_RUN = 100;
const BATCH_SIZE = 8;

export type RebookCandidate = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  jobCount: number;
  totalValue: number;
  lastJobAt: string | null;
  daysSince: number;
  smsReady: boolean;
  hasEmail: boolean;
  invitedAt: string | null;
};

function firstName(name: string | null): string {
  return (name || 'there').trim().split(/\s+/)[0] || 'there';
}

async function loadOptedInPhones(supabase: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('sms_consent')
    .select('phone_number')
    .eq('account_id', accountId)
    .eq('status', 'opted_in');
  return new Set((data ?? []).map((row) => row.phone_number as string));
}

// The account's booking link + display name. bookingUrl is null when the site
// isn't published (no page to send people to yet).
export async function resolveRebookContext(supabase: SupabaseClient, accountId: string): Promise<{ bookingUrl: string | null; businessName: string }> {
  const [{ data: site }, { data: account }] = await Promise.all([
    supabase.from('sites').select('subdomain, published, company_name').eq('account_id', accountId).maybeSingle(),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  const businessName = site?.company_name || account?.business_name || "Let's Get Quoted contractor";
  const bookingUrl = site?.subdomain && site.published ? `${APP_ORIGIN}/book/${site.subdomain}` : null;
  return { bookingUrl, businessName };
}

// Past customers whose most recent job is at least `minDays` old — the ones
// worth nudging to book again. Most overdue first.
export async function listRebookCandidates(supabase: SupabaseClient, accountId: string, minDays = DEFAULT_REBOOK_DAYS): Promise<RebookCandidate[]> {
  const [clients, optedIn] = await Promise.all([
    listClientsWithStats(supabase, accountId),
    loadOptedInPhones(supabase, accountId),
  ]);
  const now = Date.now();

  return clients
    .filter((client) => client.jobCount >= 1 && client.lastJobAt)
    .map((client) => {
      const phone = client.phone ? normalizeUsPhone(client.phone) : null;
      return {
        id: client.id,
        name: client.name,
        phone,
        email: client.email,
        jobCount: client.jobCount,
        totalValue: client.totalValue,
        lastJobAt: client.lastJobAt,
        daysSince: Math.floor((now - new Date(client.lastJobAt as string).getTime()) / DAY),
        smsReady: Boolean(phone && optedIn.has(phone)),
        hasEmail: Boolean(client.email),
        invitedAt: client.last_rebook_invite_at,
      };
    })
    .filter((candidate) => candidate.daysSince >= minDays)
    .sort((a, b) => b.daysSince - a.daysSince);
}

export async function countRebookCandidates(supabase: SupabaseClient, accountId: string, minDays = DEFAULT_REBOOK_DAYS): Promise<number> {
  return (await listRebookCandidates(supabase, accountId, minDays)).length;
}

async function deliverRebookInvite(
  supabase: SupabaseClient,
  accountId: string,
  client: Pick<Client, 'id' | 'name' | 'phone' | 'email'>,
  bookingUrl: string,
  businessName: string,
): Promise<'sms' | 'email' | 'skipped'> {
  const phone = client.phone ? normalizeUsPhone(client.phone) : null;
  let canText = false;
  if (phone) {
    const { data: consent } = await supabase.from('sms_consent').select('status').eq('account_id', accountId).eq('phone_number', phone).maybeSingle();
    canText = consent?.status === 'opted_in';
  }

  let channel: 'sms' | 'email';
  if (canText && phone) {
    await sendRebookInviteSms({ phone, businessName, clientName: firstName(client.name), url: bookingUrl, accountId });
    channel = 'sms';
  } else if (client.email) {
    await sendRebookInviteEmail({ recipientEmail: client.email, businessName, clientName: firstName(client.name), url: bookingUrl });
    channel = 'email';
  } else {
    return 'skipped';
  }

  await supabase.from('clients').update({ last_rebook_invite_at: new Date().toISOString() }).eq('account_id', accountId).eq('id', client.id);
  return channel;
}

// One-tap: invite a single client to book again. Throws with a clear message
// when there's no booking page yet or the client has no reachable channel.
export async function sendRebookInvite(supabase: SupabaseClient, accountId: string, clientId: string): Promise<'sms' | 'email'> {
  const client = await getClient(supabase, accountId, clientId);
  if (!client) throw new Error('Client not found.');
  const { bookingUrl, businessName } = await resolveRebookContext(supabase, accountId);
  if (!bookingUrl) throw new Error('Publish your booking page first so the invite has a link to send.');
  const channel = await deliverRebookInvite(supabase, accountId, client, bookingUrl, businessName);
  if (channel === 'skipped') throw new Error('This client has no opted-in phone or email to reach.');
  return channel;
}

export type RebookBatchResult = { total: number; sent: number; skipped: number; failed: number };

// Invite every due client who's reachable and not already nudged in the cooldown
// window. Best-effort per client so one bad send never sinks the batch.
export async function sendAllRebookInvites(supabase: SupabaseClient, accountId: string, minDays = DEFAULT_REBOOK_DAYS): Promise<RebookBatchResult> {
  const { bookingUrl, businessName } = await resolveRebookContext(supabase, accountId);
  if (!bookingUrl) throw new Error('Publish your booking page first so invites have a link to send.');

  const now = Date.now();
  const targets = (await listRebookCandidates(supabase, accountId, minDays))
    .filter((candidate) => candidate.smsReady || candidate.hasEmail)
    .filter((candidate) => !candidate.invitedAt || now - new Date(candidate.invitedAt).getTime() > REINVITE_COOLDOWN_DAYS * DAY)
    .slice(0, MAX_INVITES_PER_RUN);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (candidate) => {
        try {
          const channel = await deliverRebookInvite(supabase, accountId, { id: candidate.id, name: candidate.name, phone: candidate.phone, email: candidate.email }, bookingUrl, businessName);
          if (channel === 'skipped') skipped++;
          else sent++;
        } catch (error) {
          failed++;
          console.error(`Rebook invite failed for client ${candidate.id}:`, error instanceof Error ? error.message : error);
        }
      }),
    );
  }

  return { total: targets.length, sent, skipped, failed };
}
