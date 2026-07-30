import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMargin, formatJobTime, formatMoney, getJob, listCosts, type Job } from './jobs';
import { listPayments } from './payments';
import { listInvoices, selectPrimaryInvoice } from './invoices';
import { createLinkedFeedItems, listJobFeed, sortJobFeed } from './job-feed';
import { listJobTasks, taskProgress } from './job-tasks';
import { listCrew, listCrewIdsForJob } from './crew';
import { createJobPhotoLinks } from './job-photo-storage';
import {
  FEED_KIND_ICON,
  FEED_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  formatFeedTime,
  getFeedDisplayBody,
  getFeedDisplayTitle,
} from './job-detail-labels';

// One job's detail, shaped for the pipeline's Focus pane.
//
// Everything here is a pre-formatted display value. The pane is served over an
// HTTP route, so the DTO deliberately carries NO raw columns — no
// stripe_payment_intent, no stripe_checkout_session, no account_id, no
// job_feed.meta jsonb, no sms consent timestamps. Same discipline as
// JobViewItem: ship the label, not the record.

export const FOCUS_FEED_LIMIT = 12;
export const FOCUS_PHOTO_LIMIT = 8;

export type FocusFeedItem = {
  id: string;
  kind: string;
  kindLabel: string;
  icon: string;
  title: string;
  body: string | null;
  at: string;
};

export type FocusTask = { id: string; title: string; done: boolean };

export type JobDetailDto = {
  id: string;
  ref: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  scope: string | null;
  status: Job['status'];
  createdAtLabel: string;
  scheduledLabel: string | null;
  estimatedHours: number | null;

  money: {
    quotedLabel: string;
    materialsLabel: string;
    laborLabel: string;
    overheadLabel: string;
    totalCostLabel: string;
    profitLabel: string;
    marginPct: number;
    marginLabel: string;
    outstandingLabel: string;
    paidLabel: string;
  };

  invoice: { ref: string; statusLabel: string; totalLabel: string } | null;
  paymentStatusLabel: string | null;

  crew: Array<{ id: string; name: string; roleLabel: string }>;
  tasks: { items: FocusTask[]; done: number; total: number; pct: number };
  feed: FocusFeedItem[];
  photos: Array<{ path: string; url: string }>;
  photoCount: number;
  costCount: number;
};

function formatCreated(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatScheduled(dateKey: string | null, time: string | null): string | null {
  if (!dateKey) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return null;
  // Built from parts, not Date.parse — a date-only string is parsed as UTC and
  // shows the previous day west of Greenwich.
  const label = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const clock = formatJobTime(time);
  return clock ? `${label} · ${clock}` : label;
}

/**
 * Load everything the Focus pane shows for one job.
 *
 * Two round trips rather than the fifteen sequential awaits the full job page
 * does: the first fetches the job, the second fans out everything that needs
 * its id. Caps are applied server-side so a chatty job can't ship a 400-event
 * feed to a phone.
 */
export async function loadJobDetail(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<JobDetailDto | null> {
  const job = await getJob(supabase, accountId, jobId);
  if (!job) return null;

  const [costs, payments, invoices, rawFeed, tasks, crewIds, crew] = await Promise.all([
    listCosts(supabase, accountId, job.id),
    listPayments(supabase, accountId, job.id),
    listInvoices(supabase, accountId, job.id),
    listJobFeed(supabase, accountId, job.id),
    listJobTasks(supabase, accountId, job.id),
    listCrewIdsForJob(supabase, accountId, job.id),
    listCrew(supabase, accountId, { activeOnly: true }),
  ]);

  const margin = computeMargin(job, costs);
  const invoice = selectPrimaryInvoice(invoices);

  // Same arithmetic as the full job page: an invoice can be raised for more
  // than the quote, so the larger of the two is what's actually owed.
  const paidTotal = invoice
    ? payments
        .filter((p) => p.invoice_id === invoice.id && p.status === 'paid')
        .reduce((sum, p) => sum + Number(p.amount), 0)
    : payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0);
  const displayTotal = invoice
    ? Math.max(Number(invoice.total), Number(job.quoted_amount))
    : Number(job.quoted_amount);
  const outstanding = Math.max(0, displayTotal - paidTotal);

  // Merged the same way the job page merges it, then capped — the merge adds
  // items, so slicing before it would drop real events.
  const feed = sortJobFeed(createLinkedFeedItems(rawFeed, payments, invoices, accountId, job.id))
    .slice(0, FOCUS_FEED_LIMIT)
    .map((event) => ({
      id: event.id,
      kind: event.kind,
      kindLabel: FEED_KIND_LABEL[event.kind] ?? 'Update',
      icon: FEED_KIND_ICON[event.kind] ?? 'i',
      title: getFeedDisplayTitle(event),
      body: getFeedDisplayBody(event),
      at: formatFeedTime(event.created_at),
    }));

  const photoPaths = job.photo_paths || [];
  const photos = (await createJobPhotoLinks(accountId, photoPaths)).slice(0, FOCUS_PHOTO_LIMIT);

  const crewById = new Map(crew.map((member) => [member.id, member]));
  const stats = taskProgress(tasks);
  const latestPayment = payments[0] ?? null;

  return {
    id: job.id,
    ref: job.ref,
    clientName: job.client_name,
    clientPhone: job.client_phone ?? null,
    clientEmail: job.client_email ?? null,
    address: job.address ?? null,
    scope: job.scope ?? null,
    status: job.status,
    createdAtLabel: formatCreated(job.created_at),
    scheduledLabel: formatScheduled(job.scheduled_for ?? null, job.scheduled_time ?? null),
    estimatedHours: job.estimated_hours ?? null,

    money: {
      quotedLabel: formatMoney(margin.revenue),
      materialsLabel: formatMoney(margin.materialsCost),
      laborLabel: formatMoney(margin.laborCost),
      overheadLabel: formatMoney(margin.otherCost),
      totalCostLabel: formatMoney(margin.totalCost),
      profitLabel: formatMoney(margin.profit),
      marginPct: Math.round(margin.margin * 100),
      // A job with nothing logged against it computes to 100%, which reads as
      // a real margin rather than as an absence of data.
      marginLabel: costs.length === 0 ? 'No costs yet' : `${Math.round(margin.margin * 100)}%`,
      outstandingLabel: formatMoney(outstanding),
      paidLabel: formatMoney(paidTotal),
    },

    invoice: invoice
      ? {
          ref: invoice.ref,
          statusLabel: INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status,
          totalLabel: formatMoney(Number(invoice.total)),
        }
      : null,
    paymentStatusLabel: latestPayment ? PAYMENT_STATUS_LABEL[latestPayment.status] ?? null : null,

    crew: crewIds
      .map((id) => crewById.get(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => ({ id: m.id, name: m.name, roleLabel: m.role_label })),

    tasks: {
      items: tasks.slice(0, 8).map((t) => ({ id: t.id, title: t.title, done: t.done })),
      done: stats.done,
      total: stats.total,
      pct: stats.pct,
    },

    feed,
    photos,
    photoCount: photoPaths.length,
    costCount: costs.length,
  };
}
