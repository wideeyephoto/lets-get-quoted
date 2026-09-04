import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPortalToken,
  hashPortalToken,
  portalExpiry,
  summarisePortal,
  type PortalDocument,
  type PortalIdentifier,
  type PortalJob,
  type PortalMessage,
  type PortalPlan,
  type PortalQuote,
  type PortalView,
} from '@/lib/client-portal';
import { listClientWarranties } from '@/lib/warranties-data';
import { toClientWarranties, type ClientWarranty } from '@/lib/warranties';
import { CONTRACTOR_BRAND_COLUMNS, shapeContractorBrand, type ContractorBrand } from '@/lib/contractor-brand';
import { invoicePayState, paymentsForInvoice, type InvoicePayment } from '@/lib/invoice-pay';
import { parseQuoteItems } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { APP_ORIGIN } from '@/lib/app-origin';
import { getMemberBenefitsSummary, type MemberBenefitsSummary, DEFAULT_BENEFITS } from '@/lib/membership-tiers';
import { listPropertyPassports } from '@/lib/property-passport-data';
import type { PropertyPassport } from '@/lib/property-passport';
import { runSmsInboxVisibleQuery } from '@/lib/sms-inbox-visibility';

/**
 * Find the one client this email belongs to.
 *
 * `.limit(1)` and not `.maybeSingle()` alone: a customer list assembled from
 * imports, web forms and typed entry can hold the same address twice, and
 * maybeSingle THROWS on a second row — which turned a duplicate in the
 * contractor's own data into "no such customer" for somebody trying to see
 * their own jobs.
 */
async function findClientByEmail(admin: SupabaseClient, accountId: string, email: string) {
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq('account_id', accountId)
    .eq('email', email)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * The same, by mobile number.
 *
 * TWO PASSES, because the column is not uniformly formatted. New rows go in as
 * E.164 through normalizeUsPhone (see lib/clients), but rows that arrived by CSV
 * import were stored exactly as the contractor's spreadsheet had them —
 * "(248) 555-0117", "248.555.0117", "1-248-555-0117". An exact match finds the
 * first kind; the fallback compares the last ten digits, which is the part that
 * identifies a US line no matter how it was typed.
 *
 * Both passes are scoped to one account, so the loose match can only ever reach
 * this contractor's own customers.
 */
async function findClientByPhone(admin: SupabaseClient, accountId: string, e164: string) {
  const exact = await admin
    .from('clients')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', e164)
    .limit(1)
    .maybeSingle();
  if (exact.data) return exact.data;

  const last10 = e164.replace(/\D/g, '').slice(-10);
  if (last10.length !== 10) return null;
  const { data } = await admin
    .from('clients')
    .select('id, phone')
    .eq('account_id', accountId)
    .not('phone', 'is', null)
    .limit(500);
  const match = (data ?? []).find((row) => String(row.phone ?? '').replace(/\D/g, '').slice(-10) === last10);
  return match ?? null;
}

/**
 * Mint a portal link for whoever owns this email or mobile number, if anybody
 * does.
 *
 * Returns the token ONLY when there's a match — but the caller must send the
 * same acknowledgement either way. A page that says "no account found" tells a
 * stranger which of their neighbours used this contractor.
 *
 * Any previously issued link for the same client is revoked. A homeowner who
 * asks for a new link has usually lost the old one, and leaving a forgotten link
 * live in an old inbox is the failure mode nobody notices.
 */
export async function issuePortalLink(
  admin: SupabaseClient,
  accountId: string,
  identifier: PortalIdentifier,
): Promise<{ token: string; clientId: string } | null> {
  const client = identifier.kind === 'email'
    ? await findClientByEmail(admin, accountId, identifier.value)
    : await findClientByPhone(admin, accountId, identifier.value);
  if (!client) return null;
  const needle = identifier.value;

  await admin
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', client.id)
    .is('revoked_at', null);

  const token = createPortalToken();
  const { error } = await admin.from('client_portal_access').insert({
    account_id: accountId,
    client_id: client.id as string,
    token_hash: hashPortalToken(token),
    sent_to: needle,
    expires_at: portalExpiry(),
  });
  if (error) {
    console.error('Portal link issue failed:', error.message);
    return null;
  }
  return { token, clientId: client.id as string };
}

/** One bill, as a customer needs to read it: what it was for, and what is left. */
export type PortalInvoice = {
  id: string;
  ref: string;
  status: string;
  statusLabel: string;
  jobScope: string | null;
  total: number;
  paid: number;
  due: number;
  /** True only when there is something to pay AND the page can take it. */
  payable: boolean;
  processing: boolean;
  createdAt: string;
};

/** A receipt. Only settled money — a failed attempt is not a payment history. */
export type PortalPayment = {
  id: string;
  label: string;
  amount: number;
  paidAt: string | null;
  refunded: boolean;
};

export type PortalPayload = PortalView & {
  warranties: ClientWarranty[];
  brand: ContractorBrand;
  invoices: PortalInvoice[];
  payments: PortalPayment[];
  quotes: PortalQuote[];
  plans: PortalPlan[];
  documents: PortalDocument[];
  messages: PortalMessage[];
  membership?: MemberBenefitsSummary | null;
  propertyPassports: PropertyPassport[];
  /** Across every open invoice — the one number a customer opens this to find. */
  outstanding: number;
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  new_lead: 'Ready for Review',
  in_progress: 'Approved & Scheduled',
  complete: 'Completed',
  archived: 'Archived',
};

const PLAN_FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  'semi-annual': 'Every 6 months',
  annual: 'Annual',
};

/**
 * Everything a homeowner sees about their own history with one contractor.
 *
 * Scoped to a single client of a single account throughout. Every query filters
 * on both, so a token can only ever open the door it was cut for.
 */
export async function loadPortal(admin: SupabaseClient, accountId: string, clientId: string): Promise<PortalPayload | null> {
  const [{ data: client }, { data: account }, { data: site }] = await Promise.all([
    admin.from('clients').select('name, phone, email').eq('account_id', accountId).eq('id', clientId).maybeSingle(),
    admin.from('accounts').select('business_name, deposit_percent').eq('id', accountId).maybeSingle(),
    admin.from('sites').select(CONTRACTOR_BRAND_COLUMNS).eq('account_id', accountId).maybeSingle(),
  ]);
  if (!client) return null;
  const brand = shapeContractorBrand(account, site);
  const clientPhone = client.phone ? String(client.phone).trim() : null;

  // NO `completed_at` in this select. There is no such column on `jobs` — asking
  // for it made PostgREST fail the WHOLE query with 42703, and the error was
  // being destructured away, so `jobRows` came back null and every customer who
  // ever opened their portal was told "Nothing here yet". The one thing the page
  // exists to show, missing, silently, for everybody.
  //
  // Errors are read here now rather than dropped, for exactly that reason.
  const { data: jobRows, error: jobError } = await admin
    .from('jobs')
    .select('id, ref, scope, status, scheduled_for, address, quoted_amount, deposit_gate, quote_items, photo_paths, created_at')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .limit(100);
  if (jobError) console.error('Portal job history failed:', jobError.message);

  const rawJobs = jobRows ?? [];
  const jobIds = rawJobs.map((row) => row.id as string);

  // When the work was finished. Completion is a status, not a timestamp, so the
  // moment lives on the feed event the "job complete" action writes. Read rather
  // than guessed: `scheduled_for` is when it was BOOKED, and printing that as
  // "finished on" would put a confidently wrong date in front of a customer.
  const completedAt = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: doneRows } = await admin
      .from('job_feed')
      .select('job_id, created_at')
      .eq('account_id', accountId)
      .eq('kind', 'job_completed')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false });
    // Descending, first write wins: a job completed, reopened and completed
    // again shows the LATEST completion, which is the one that still stands.
    for (const row of doneRows ?? []) {
      const jobId = row.job_id as string;
      if (!completedAt.has(jobId)) completedAt.set(jobId, row.created_at as string);
    }
  }

  const jobs: PortalJob[] = rawJobs.map((row) => ({
    id: row.id as string,
    ref: (row.ref as string | null) ?? null,
    scope: (row.scope as string | null) ?? null,
    status: (row.status as string) ?? 'new_lead',
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    completedAt: completedAt.get(row.id as string) ?? null,
    address: (row.address as string | null) ?? null,
    quotedAmount: Number(row.quoted_amount) || 0,
  }));

  const defaultDepositPercent = Number(account?.deposit_percent) || 25;
  const quotes: PortalQuote[] = rawJobs.map((row) => {
    const items = parseQuoteItems(row.quote_items);
    const amount = Number(row.quoted_amount) || 0;
    const hasAddons = items.some((it) => it.kind === 'addon');
    const hasSubscriptions = items.some((it) => it.kind === 'subscription');
    const approved = (row.status as string) !== 'new_lead';
    const depositGate = (row.deposit_gate as string | null) ?? null;
    const depositPercent = depositGate ? defaultDepositPercent : null;
    const depositAmount = depositPercent ? Math.round(amount * (depositPercent / 100) * 100) / 100 : null;

    return {
      id: row.id as string,
      jobId: row.id as string,
      ref: (row.ref as string) || 'Quote',
      scope: (row.scope as string | null) ?? null,
      status: (row.status as string) ?? 'new_lead',
      statusLabel: QUOTE_STATUS_LABEL[row.status as string] ?? (row.status as string),
      quotedAmount: amount,
      depositGate,
      depositPercent,
      depositAmount,
      items,
      hasAddons,
      hasSubscriptions,
      approved,
      address: (row.address as string | null) ?? null,
      scheduledFor: (row.scheduled_for as string | null) ?? null,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
    };
  });

  const rawWarranties = await listClientWarranties(admin, accountId, clientId);
  const warranties = toClientWarranties(rawWarranties);

  // Bills and receipts. Scoped to this customer's own jobs — the job ids are the
  // ones already loaded above, so a token cannot reach an invoice belonging to
  // anybody else even if a job_id were somehow wrong.
  const [{ data: invoiceRows }, { data: paymentRows }] = jobIds.length
    ? await Promise.all([
        admin
          .from('invoices')
          .select('id, ref, status, total, discount_percent, tax_rate, job_id, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          // A draft is the contractor's working copy, not a bill anybody has been
          // sent. It must never appear here.
          .in('status', ['sent', 'signed', 'paid', 'void'])
          .order('created_at', { ascending: false }),
        admin
          .from('payments')
          // async_payment_pending_at feeds invoicePayState below: without it a
          // bank transfer in flight is indistinguishable from an abandoned
          // checkout, and the portal would list an invoice as needing payment
          // that /invoice/[id] -- which does load it -- says is already clearing.
          .select('id, label, amount, status, invoice_id, refunded_amount, paid_at, kind, async_payment_pending_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .order('paid_at', { ascending: false, nullsFirst: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const allPayments = (paymentRows ?? []) as (InvoicePayment & {
    label: string | null;
    paid_at: string | null;
    kind: string;
  })[];
  const scopeByJob = new Map(jobs.map((job) => [job.id, job.scope] as const));
  const refByJob = new Map(jobs.map((job) => [job.id, job.ref] as const));

  const invoices: PortalInvoice[] = (invoiceRows ?? []).map((row) => {
    const total = Number(row.total) || 0;
    const state = invoicePayState({ status: row.status as string }, total, paymentsForInvoice(allPayments, row.id as string));
    return {
      id: row.id as string,
      ref: (row.ref as string) ?? '',
      status: row.status as string,
      statusLabel: INVOICE_STATUS_LABEL[row.status as string] ?? (row.status as string),
      jobScope: scopeByJob.get(row.job_id as string) ?? null,
      total,
      paid: state.paid,
      due: state.due,
      payable: state.state === 'payable',
      processing: state.state === 'processing',
      createdAt: row.created_at as string,
    };
  });

  const payments: PortalPayment[] = allPayments
    .filter((payment) => payment.status === 'paid')
    .map((payment) => ({
      id: payment.id,
      label: payment.label?.trim() || 'Payment',
      amount: Number(payment.amount) || 0,
      paidAt: payment.paid_at,
      refunded: (Number(payment.refunded_amount) || 0) > 0,
    }));

  // Service & Maintenance Plans: recurring_plans and payment_plans
  const [{ data: recurringPlanRows, error: recPlanError }, { data: paymentPlanRows }, propertyPassports] = await Promise.all([
    admin
      .from('recurring_plans')
      .select('id, title, scope, amount, frequency, next_run_date, active, auto_charge, prepaid, card_brand, card_last4, remaining_cycles, membership_tier_id, membership_tier_name, tier_level, tier_benefits, member_number, created_at')
      .eq('account_id', accountId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    jobIds.length
      ? admin
          .from('payment_plans')
          .select('id, job_id, total_cents, deposit_cents, installment_count, frequency, first_installment_date, status, card_brand, card_last4, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    listPropertyPassports(admin, accountId, clientId),
  ]);
  if (recPlanError) console.error('Portal recurring plan query failed:', recPlanError.message);

  let membershipSummary: MemberBenefitsSummary | null = null;
  const activeTierPlan = (recurringPlanRows ?? []).find((r) => r.active && (r.membership_tier_name || r.membership_tier_id));
  if (activeTierPlan) {
    const tierName = (activeTierPlan.membership_tier_name as string) || activeTierPlan.title || 'VIP Care Club';
    const tierLevel = (Number(activeTierPlan.tier_level) || 2) as 1 | 2 | 3 | 4;
    const tierBenefits = (activeTierPlan.tier_benefits as Record<string, unknown>) || DEFAULT_BENEFITS;
    membershipSummary = getMemberBenefitsSummary(
      {
        name: tierName,
        tierLevel,
        badgeColor: tierLevel >= 3 ? '#eab308' : '#38bdf8',
        benefits: {
          ...DEFAULT_BENEFITS,
          ...tierBenefits,
        },
      },
      true,
      0,
    );
  }

  const plans: PortalPlan[] = [];
  for (const r of recurringPlanRows ?? []) {
    const cardSummary = r.card_brand && r.card_last4 ? `${r.card_brand} ending in ${r.card_last4}` : null;
    plans.push({
      id: r.id as string,
      title: (r.title as string) || 'Recurring Maintenance Plan',
      scope: (r.scope as string | null) ?? null,
      kind: 'recurring_service',
      status: r.active ? 'active' : 'paused',
      statusLabel: r.active ? 'Active' : 'Paused',
      amount: Number(r.amount) || 0,
      frequency: (r.frequency as string) || 'monthly',
      frequencyLabel: PLAN_FREQUENCY_LABEL[r.frequency as string] || (r.frequency as string),
      nextRunDate: (r.next_run_date as string | null) ?? null,
      autoCharge: Boolean(r.auto_charge),
      prepaid: Boolean(r.prepaid),
      cardBrand: (r.card_brand as string | null) ?? null,
      cardLast4: (r.card_last4 as string | null) ?? null,
      paymentMethodSummary: cardSummary,
      remainingCycles: r.remaining_cycles !== null && r.remaining_cycles !== undefined ? Number(r.remaining_cycles) : null,
      totalCycles: null,
      createdAt: (r.created_at as string) ?? new Date().toISOString(),
    });
  }

  for (const p of paymentPlanRows ?? []) {
    const cardSummary = p.card_brand && p.card_last4 ? `${p.card_brand} ending in ${p.card_last4}` : null;
    const planTotal = (Number(p.total_cents) || 0) / 100;
    const statusStr = (p.status as string) || 'active';
    const statusLabel = statusStr === 'paid_off' ? 'Paid Off' : statusStr === 'active' ? 'Active' : 'Pending';
    plans.push({
      id: p.id as string,
      title: `Payment Plan · ${refByJob.get(p.job_id as string) || 'Job'}`,
      scope: scopeByJob.get(p.job_id as string) ?? null,
      kind: 'payment_plan',
      status: statusStr === 'paid_off' ? 'completed' : statusStr === 'canceled' ? 'canceled' : 'active',
      statusLabel,
      amount: planTotal,
      frequency: (p.frequency as string) || 'monthly',
      frequencyLabel: PLAN_FREQUENCY_LABEL[p.frequency as string] || (p.frequency as string),
      nextRunDate: (p.first_installment_date as string | null) ?? null,
      autoCharge: true,
      cardBrand: (p.card_brand as string | null) ?? null,
      cardLast4: (p.card_last4 as string | null) ?? null,
      paymentMethodSummary: cardSummary,
      remainingCycles: null,
      totalCycles: Number(p.installment_count) || null,
      createdAt: (p.created_at as string) ?? new Date().toISOString(),
    });
  }

  // Conversation & Messaging History
  const messages: PortalMessage[] = [];
  const [{ data: smsRows }, { data: feedRows }] = await Promise.all([
    clientPhone
      ? runSmsInboxVisibleQuery((includeVisibilityFilter) => {
          let query = admin
            .from('sms_messages')
            .select('id, direction, body, media_urls, created_at')
            .eq('account_id', accountId)
            .eq('phone_number', clientPhone);
          if (includeVisibilityFilter) query = query.eq('inbox_visible', true);
          return query.order('created_at', { ascending: false }).limit(50);
        })
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? admin
          .from('job_feed')
          .select('id, kind, title, body, author, visibility, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .in('visibility', ['client', 'client_financial'])
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of smsRows ?? []) {
    const isClient = row.direction === 'inbound';
    messages.push({
      id: row.id as string,
      direction: (row.direction as 'inbound' | 'outbound') ?? 'outbound',
      sender: isClient ? 'You' : brand.businessName,
      body: (row.body as string) || '',
      channel: 'sms',
      mediaUrls: (row.media_urls as string[] | null) ?? undefined,
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
    });
  }

  for (const row of feedRows ?? []) {
    const isClientAuthor = (row.author as string | null) === 'Client';
    messages.push({
      id: row.id as string,
      direction: isClientAuthor ? 'inbound' : 'outbound',
      sender: isClientAuthor ? 'You' : `${brand.businessName} Update`,
      body: row.title ? `${row.title}${row.body ? `: ${row.body}` : ''}` : (row.body as string) || '',
      channel: isClientAuthor ? 'portal_note' : 'update',
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
    });
  }

  // Sort messages descending (newest first)
  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Documents & Media Vault Aggregation
  const documents: PortalDocument[] = [];

  // Invoices as documents
  for (const inv of invoices) {
    documents.push({
      id: `inv-${inv.id}`,
      title: `Invoice ${inv.ref}`,
      kind: 'invoice',
      kindLabel: 'Invoice',
      jobId: null,
      jobRef: inv.ref,
      jobScope: inv.jobScope,
      url: `/invoice/${inv.id}`,
      badge: inv.statusLabel,
      createdAt: inv.createdAt,
    });
  }

  // Receipts as documents
  for (const pay of payments) {
    documents.push({
      id: `pay-${pay.id}`,
      title: `Receipt: ${pay.label}`,
      kind: 'receipt',
      kindLabel: 'Payment Receipt',
      jobId: null,
      jobRef: null,
      jobScope: null,
      url: null,
      badge: pay.refunded ? 'Refunded' : 'Paid in Full',
      createdAt: pay.paidAt ?? new Date().toISOString(),
    });
  }

  // Warranties as documents
  for (const w of rawWarranties) {
    documents.push({
      id: `war-${w.id}`,
      title: `Warranty Certificate: ${w.title}`,
      kind: 'warranty',
      kindLabel: 'Warranty Certificate',
      jobId: w.jobId,
      jobRef: refByJob.get(w.jobId) ?? null,
      jobScope: scopeByJob.get(w.jobId) ?? null,
      url: null,
      badge: w.endsOn ? `Expires ${w.endsOn}` : 'Lifetime Coverage',
      createdAt: w.startsOn,
    });

    for (let i = 0; i < (w.documentPaths ?? []).length; i++) {
      const path = w.documentPaths![i];
      documents.push({
        id: `war-doc-${w.id}-${i}`,
        title: `${w.title} Documentation #${i + 1}`,
        kind: 'warranty',
        kindLabel: 'Warranty Spec Sheet',
        jobId: w.jobId,
        jobRef: refByJob.get(w.jobId) ?? null,
        jobScope: scopeByJob.get(w.jobId) ?? null,
        url: path,
        previewUrl: path,
        createdAt: w.startsOn,
      });
    }
  }

  // Milestone photos & project photos
  const [{ data: milestonePhotoRows }, { data: changeOrderRows }] = jobIds.length
    ? await Promise.all([
        admin
          .from('milestone_photos')
          .select('id, job_id, path, phase, caption, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .order('created_at', { ascending: false }),
        admin
          .from('change_orders')
          .select('id, job_id, title, status, amount, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  for (const photo of milestonePhotoRows ?? []) {
    documents.push({
      id: `proof-${photo.id}`,
      title: photo.caption ? `${photo.phase === 'before' ? 'Before Photo' : 'After Photo'}: ${photo.caption}` : `${photo.phase === 'before' ? 'Before' : 'After'} Work Proof`,
      kind: 'proof',
      kindLabel: photo.phase === 'before' ? 'Before Photo' : 'After Photo',
      jobId: photo.job_id as string,
      jobRef: refByJob.get(photo.job_id as string) ?? null,
      jobScope: scopeByJob.get(photo.job_id as string) ?? null,
      url: photo.path as string,
      previewUrl: photo.path as string,
      badge: photo.phase === 'before' ? 'Pre-Work' : 'Completed',
      createdAt: (photo.created_at as string) ?? new Date().toISOString(),
    });
  }

  for (const row of rawJobs) {
    const paths = Array.isArray(row.photo_paths) ? (row.photo_paths as string[]) : [];
    for (let i = 0; i < paths.length; i++) {
      documents.push({
        id: `job-photo-${row.id}-${i}`,
        title: `Job Photo #${i + 1} · ${row.ref ?? 'Project'}`,
        kind: 'photo',
        kindLabel: 'Job Photo',
        jobId: row.id as string,
        jobRef: (row.ref as string | null) ?? null,
        jobScope: (row.scope as string | null) ?? null,
        url: paths[i],
        previewUrl: paths[i],
        createdAt: (row.created_at as string) ?? new Date().toISOString(),
      });
    }
  }

  for (const co of changeOrderRows ?? []) {
    documents.push({
      id: `co-${co.id}`,
      title: `Change Order: ${co.title}`,
      kind: 'change_order',
      kindLabel: 'Change Order',
      jobId: co.job_id as string,
      jobRef: refByJob.get(co.job_id as string) ?? null,
      jobScope: scopeByJob.get(co.job_id as string) ?? null,
      url: null,
      badge: (co.status as string) === 'approved' ? 'Approved' : (co.status as string) === 'declined' ? 'Declined' : 'Pending',
      createdAt: (co.created_at as string) ?? new Date().toISOString(),
    });
  }

  // Sort documents descending (newest first)
  documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    ...summarisePortal({
      businessName: brand.businessName,
      clientName: (client.name as string) ?? 'there',
      jobs,
      quotes,
      plans,
      documents,
      messages,
    }),
    warranties,
    brand,
    invoices,
    payments,
    quotes,
    plans,
    documents,
    messages,
    membership: membershipSummary,
    propertyPassports: propertyPassports ?? [],
    outstanding: Math.round(invoices.reduce((sum, invoice) => sum + invoice.due, 0) * 100) / 100,
  };
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  sent: 'Awaiting payment',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Cancelled',
};

/**
 * Submit a customer message or question directly from the magic link portal.
 * Records in job feed and inbound SMS thread, and alerts the contractor.
 */
export async function submitPortalMessage(
  admin: SupabaseClient,
  input: {
    accountId: string;
    clientId: string;
    body: string;
    jobId?: string | null;
  },
): Promise<{ ok: boolean; message?: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, message: 'Please enter a message.' };

  const [{ data: client }, { data: account }, { data: site }] = await Promise.all([
    admin.from('clients').select('name, phone, email').eq('account_id', input.accountId).eq('id', input.clientId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', input.accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', input.accountId).maybeSingle(),
  ]);

  const clientName = (client?.name as string) || 'Customer';
  const businessName = (site?.company_name as string) || (account?.business_name as string) || 'Contractor';

  // If a job ID is provided, record to job_feed
  if (input.jobId) {
    try {
      await createJobFeedEvent(admin, input.accountId, input.jobId, {
        kind: 'note',
        title: `Portal note from ${clientName}`,
        body,
        visibility: 'client',
        author: 'Client',
      });
    } catch (err) {
      console.error('Failed to write job feed event from portal message:', err);
    }
  }

  // If client phone exists, log inbound SMS message
  if (client?.phone) {
    try {
      await admin.from('sms_messages').insert({
        account_id: input.accountId,
        phone_number: client.phone,
        direction: 'inbound',
        body,
      });
    } catch (err) {
      console.error('Failed to log inbound message from portal:', err);
    }
  }

  // Notify contractor via alert email
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, input.accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        accountId: input.accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject: `New portal message from ${clientName}`,
        heading: `Message from ${clientName}`,
        bodyLines: [
          `"${body}"`,
          ...(client?.phone ? [`Phone: ${client.phone}`] : []),
          ...(client?.email ? [`Email: ${client.email}`] : []),
        ],
        ctaLabel: 'Open Messages',
        ctaUrl: `${APP_ORIGIN}/dashboard/messages`,
        tone: 'info',
      });
    }
  } catch (err) {
    console.error('Failed to send contractor alert for portal message:', err);
  }

  return { ok: true };
}

/** Owner-facing: links this client currently holds, so they can be revoked. */
export async function listPortalLinks(supabase: SupabaseClient, accountId: string, clientId: string) {
  const { data, error } = await supabase
    .from('client_portal_access')
    .select('id, sent_to, expires_at, revoked_at, last_used_at, created_at')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return error ? [] : data ?? [];
}

export async function revokePortalLinks(supabase: SupabaseClient, accountId: string, clientId: string): Promise<void> {
  await supabase
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .is('revoked_at', null);
}
