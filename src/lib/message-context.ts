import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';

/**
 * Who you are texting, and what you are texting them about.
 *
 * A thread is keyed by a phone number and nothing else, so replying meant
 * holding the job, the address and the last invoice in your head — or opening
 * three other tabs to find them. All of it is one hop away: the number finds a
 * client, the client has jobs, a job has invoices.
 *
 * Everything here is nullable on purpose. A text can arrive from a number that
 * belongs to nobody in the book, and the rail has to say so rather than render
 * an empty shell that looks like a loading state that never finishes.
 */

export type MessageJob = {
  id: string;
  ref: string;
  title: string;
  status: string;
  scheduledFor: string | null;
  scheduledTime: string | null;
  address: string | null;
  quotedAmount: number;
};

export type MessageInvoice = {
  id: string;
  jobId: string;
  ref: string;
  status: string;
  total: number;
  createdAt: string;
};

export type MessageContext = {
  client: { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null } | null;
  job: MessageJob | null;
  invoice: MessageInvoice | null;
};

export const EMPTY_MESSAGE_CONTEXT: MessageContext = { client: null, job: null, invoice: null };

export async function messageContext(
  supabase: SupabaseClient,
  accountId: string,
  phone: string | null,
): Promise<MessageContext> {
  if (!phone) return EMPTY_MESSAGE_CONTEXT;
  const normalized = normalizeUsPhone(phone) ?? phone;

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, phone, email, address, notes')
    .eq('account_id', accountId);

  // Matched on the NORMALIZED number, not the stored string: the book holds
  // "(248) 555-0117" and a webhook delivers "+12485550117", and comparing those
  // as text finds nobody.
  const client =
    (clientRows ?? []).find((row) => {
      const rowPhone = row.phone ? normalizeUsPhone(row.phone) ?? row.phone : null;
      return rowPhone === normalized;
    }) ?? null;

  if (!client) return EMPTY_MESSAGE_CONTEXT;

  // The job worth showing is the one they are most likely texting about: the
  // next scheduled one, or failing that the most recent. An archived job is
  // never it.
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, ref, scope, status, scheduled_for, scheduled_time, address, quoted_amount, created_at')
    .eq('account_id', accountId)
    .eq('client_id', client.id)
    .neq('status', 'archived')
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .limit(10);

  const jobs = jobRows ?? [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const upcoming = jobs
    .filter((job) => job.scheduled_for && (job.scheduled_for as string) >= todayKey)
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
  const chosen = upcoming[0] ?? jobs[0] ?? null;

  let invoice: MessageInvoice | null = null;
  if (jobs.length) {
    const { data: invoiceRows } = await supabase
      .from('invoices')
      .select('id, job_id, ref, status, total, created_at')
      .eq('account_id', accountId)
      .in('job_id', jobs.map((job) => job.id as string))
      .order('created_at', { ascending: false })
      .limit(1);
    const row = (invoiceRows ?? [])[0];
    if (row) {
      invoice = {
        id: row.id as string,
        jobId: row.job_id as string,
        ref: row.ref as string,
        status: row.status as string,
        total: Number(row.total) || 0,
        createdAt: row.created_at as string,
      };
    }
  }

  return {
    client: {
      id: client.id as string,
      name: client.name as string,
      phone: (client.phone as string) ?? null,
      email: (client.email as string) ?? null,
      address: (client.address as string) ?? null,
      notes: (client.notes as string) ?? null,
    },
    job: chosen
      ? {
          id: chosen.id as string,
          ref: chosen.ref as string,
          // The scope is what the job IS; the ref is only how it is filed.
          title: ((chosen.scope as string) ?? '').trim() || (chosen.ref as string),
          status: chosen.status as string,
          scheduledFor: (chosen.scheduled_for as string) ?? null,
          scheduledTime: (chosen.scheduled_time as string) ?? null,
          address: (chosen.address as string) ?? null,
          quotedAmount: Number(chosen.quoted_amount) || 0,
        }
      : null,
    invoice,
  };
}

/** "Tuesday, August 3" — the divider between one day's texts and the next. */
export function dayDivider(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Cluster consecutive messages from the same side into runs, the way a phone
 * does.
 *
 * Six replies sent in the same minute are one turn in the conversation, not six.
 * Stamping every one of them with a time and a "Sent" turned a thread into a
 * receipt printout — the run carries the time once, at the end, and only its
 * last bubble gets a tail.
 *
 * A gap long enough to be a separate thought starts a new run even on the same
 * side, so "on my way" at 8am and "running late" at 11am don't merge into one
 * block stamped 11am.
 */
export function groupRuns<T extends { created_at: string; direction: string }>(
  messages: T[],
  gapMinutes = 5,
): { direction: string; items: T[] }[] {
  const runs: { direction: string; items: T[] }[] = [];
  for (const message of messages) {
    const current = runs[runs.length - 1];
    const previous = current?.items[current.items.length - 1];
    const withinGap =
      previous != null &&
      Math.abs(new Date(message.created_at).getTime() - new Date(previous.created_at).getTime()) <= gapMinutes * 60_000;
    if (current && current.direction === message.direction && withinGap) current.items.push(message);
    else runs.push({ direction: message.direction, items: [message] });
  }
  return runs;
}

/**
 * What a conversation looks like in the LIST, which is not what it says.
 *
 * The inbox preview is one clipped line, and outbound texts spend most of that
 * line on two things that are identical in every thread: a tracking link, and
 * the compliance tail every automated message has to carry. A column of
 * "https://letsgetquoted.com/p/8f2a… Reply STOP to opt out." rows tells you
 * nothing about which customer needs you.
 *
 * DISPLAY ONLY. This never touches what was sent, what is stored, or what the
 * thread renders — open the conversation and the message is verbatim, link and
 * opt-out line included. Both are legally and practically load-bearing; this
 * only declines to spend the preview on them.
 */
const OPT_OUT_TAIL = /\s*Reply\s+STOP\s+to\s+opt\s*out\.?\s*$/i;
const URL_PATTERN = /https?:\/\/\S+/g;

export function conversationPreview(body: string | null | undefined): string {
  let text = (body ?? '').trim();
  if (!text) return '';
  // Only from the END. "Reply STOP to opt out" in the middle of a sentence is
  // someone quoting it back at you, which is a thread you want to notice.
  text = text.replace(OPT_OUT_TAIL, '');
  text = text.replace(URL_PATTERN, (match) => {
    try {
      // The host is the recognizable part — "your quote" links and "pay this"
      // links differ by a path segment nobody reads at this size.
      return `${new URL(match).host.replace(/^www\./, '')}/…`;
    } catch {
      return 'link';
    }
  });
  return text.replace(/\s+/g, ' ').trim();
}

/** "MW" — the initials on a thread avatar; falls back to the first character. */
export function initialsFor(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Group consecutive messages by calendar day, preserving order. */
export function groupByDay<T extends { created_at: string }>(messages: T[]): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const message of messages) {
    const key = new Date(message.created_at).toISOString().slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(message);
    else out.push({ key, label: dayDivider(message.created_at), items: [message] });
  }
  return out;
}
