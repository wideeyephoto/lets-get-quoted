import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';

export type SearchEntitySection = 'jobs' | 'clients' | 'addresses' | 'crew' | 'leads' | 'actions';

export type SearchBadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'purple' | 'danger';

export type SearchResultBadge = {
  label: string;
  tone?: SearchBadgeTone;
};

export type SearchResultItem = {
  id: string;
  section: SearchEntitySection;
  title: string;
  subtitle: string | null;
  badge: SearchResultBadge | null;
  href: string;
  iconName?: string;
  extraInfo?: string | null;
};

export type WorkspaceSearchResults = {
  query: string;
  totalMatches: number;
  sections: {
    jobs: SearchResultItem[];
    clients: SearchResultItem[];
    addresses: SearchResultItem[];
    crew: SearchResultItem[];
    leads: SearchResultItem[];
    actions: SearchResultItem[];
  };
  unavailable: SearchEntitySection[];
};

type SearchBranch<T = SearchResultItem> = {
  rows: T[];
  available: boolean;
};

function formatMoney(amount: number | null | undefined): string {
  const num = Number(amount) || 0;
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const JOB_STATUS_LABEL: Record<string, { label: string; tone: SearchBadgeTone }> = {
  new_lead: { label: 'New Lead', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'warning' },
  complete: { label: 'Complete', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const LEAD_STATUS_LABEL: Record<string, { label: string; tone: SearchBadgeTone }> = {
  new: { label: 'New Lead', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'purple' },
  quoted: { label: 'Quoted', tone: 'warning' },
  won: { label: 'Won', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};

export const QUICK_ACTIONS: SearchResultItem[] = [
  {
    id: 'action-new-job',
    section: 'actions',
    title: 'New Job',
    subtitle: 'Create a new job estimate, quote or scheduled work',
    badge: { label: 'Action', tone: 'purple' },
    href: '/dashboard/jobs?new=1#new-job',
    iconName: 'job',
  },
  {
    id: 'action-new-lead',
    section: 'actions',
    title: 'New Lead',
    subtitle: 'Log a new inquiry, missed call or website lead',
    badge: { label: 'Action', tone: 'purple' },
    href: '/dashboard/leads?add=1#add-lead',
    iconName: 'lead',
  },
  {
    id: 'action-new-client',
    section: 'actions',
    title: 'New Client',
    subtitle: 'Add a customer profile and contact record',
    badge: { label: 'Action', tone: 'purple' },
    href: '/dashboard/clients?add=1',
    iconName: 'client',
  },
  {
    id: 'action-new-crew',
    section: 'actions',
    title: 'New Team Member',
    subtitle: 'Add a crew member or subcontractor',
    badge: { label: 'Action', tone: 'purple' },
    href: '/dashboard/crew?tab=people&add=1',
    iconName: 'crew',
  },
  {
    id: 'action-plan-day',
    section: 'actions',
    title: 'Plan My Day',
    subtitle: 'Optimize route stops and day schedule',
    badge: { label: 'Routing', tone: 'info' },
    href: '/dashboard/schedule/plan',
    iconName: 'plan',
  },
  {
    id: 'action-messages',
    section: 'actions',
    title: 'Messages & SMS Inbox',
    subtitle: 'View two-way customer texts and chats',
    badge: { label: 'Inbox', tone: 'info' },
    href: '/dashboard/messages',
    iconName: 'message',
  },
  {
    id: 'action-text-to-job',
    section: 'actions',
    title: 'Text-to-Job & Voice Field Intake',
    subtitle: 'Dictate quotes, change orders & punch lists from the truck via SMS/voice',
    badge: { label: 'AI Field Ingest', tone: 'success' },
    href: '/dashboard/text-to-job',
    iconName: 'job',
  },
  {
    id: 'action-online-booking',
    section: 'actions',
    title: 'Online Booking Settings',
    subtitle: 'Manage website booking slots and arrival windows',
    badge: { label: 'Website', tone: 'neutral' },
    href: '/dashboard/schedule/booking',
    iconName: 'booking',
  },
  {
    id: 'action-account-settings',
    section: 'actions',
    title: 'Account & Company Settings',
    subtitle: 'Manage payments, team permissions, and profile',
    badge: { label: 'Settings', tone: 'neutral' },
    href: '/dashboard/settings',
    iconName: 'settings',
  },
  {
    id: 'action-payments',
    section: 'actions',
    title: 'Payments & Revenue',
    subtitle: 'Collected payments, customer invoices, Stripe payouts & dispute defense',
    badge: { label: 'Finance', tone: 'success' },
    href: '/dashboard/payments',
    iconName: 'payments',
    extraInfo: 'billing invoices stripe payout money collections credit card transactions',
  },
  {
    id: 'action-financial-reports',
    section: 'actions',
    title: 'Financial Reports',
    subtitle: 'Profit & loss statements, Schedule C worksheets & 1099 contractor prep',
    badge: { label: 'Reports', tone: 'purple' },
    href: '/dashboard/reports',
    iconName: 'reports',
    extraInfo: 'p&l profit loss schedule c taxes 1099 accounting bookkeeper cpa figures',
  },
  {
    id: 'action-cash-flow',
    section: 'actions',
    title: 'Cash Flow Forecast',
    subtitle: 'Upcoming deposits, payroll dates, supplier bills & cash buffer projection',
    badge: { label: 'Forecast', tone: 'success' },
    href: '/dashboard/cash-flow',
    iconName: 'cash-flow',
    extraInfo: 'liquidity runway working capital buffer future balance forecast burns',
  },
  {
    id: 'action-expenses',
    section: 'actions',
    title: 'Expenses & Receipts',
    subtitle: 'Material receipts, subcontractor bills, truck fuel & job cost ledger',
    badge: { label: 'Expenses', tone: 'warning' },
    href: '/dashboard/expenses',
    iconName: 'expenses',
    extraInfo: 'spending costs materials receipts purchases hardware store suppliers bills',
  },
  {
    id: 'action-recurring',
    section: 'actions',
    title: 'Recurring Jobs & Maintenance',
    subtitle: 'Repeating service contracts, recurring visits & auto-billing plans',
    badge: { label: 'Recurring', tone: 'info' },
    href: '/dashboard/recurring',
    iconName: 'recurring',
    extraInfo: 'subscriptions repeat maintenance seasonal recurring contracts plans',
  },
  {
    id: 'action-price-book',
    section: 'actions',
    title: 'Price Book & Services Catalog',
    subtitle: 'Standard labor rates, material items, flat-rate tiers & markup rules',
    badge: { label: 'Catalog', tone: 'neutral' },
    href: '/dashboard/services',
    iconName: 'services',
    extraInfo: 'pricebook services labor parts tiers flat rate pricing catalog items costs',
  },
  {
    id: 'action-merchandise',
    section: 'actions',
    title: 'Cards & Stationery Studio',
    subtitle: 'Custom business cards, magnetic door hangers, invoices & merchandise',
    badge: { label: 'Studio', tone: 'purple' },
    href: '/dashboard/merchandise',
    iconName: 'merchandise',
    extraInfo: 'print business cards stationery pads merch marketing materials branding store',
  },
  {
    id: 'action-crew-payroll',
    section: 'actions',
    title: 'Timecards & Crew Payroll',
    subtitle: 'Logged field hours, overtime calculation, pay approval & payroll export',
    badge: { label: 'Payroll', tone: 'info' },
    href: '/dashboard/crew?tab=timecards',
    iconName: 'crew',
    extraInfo: 'payroll hours pay timecards gusto adp quickbooks paychex wages overtime shifts',
  },
  {
    id: 'action-inventory',
    section: 'actions',
    title: 'Inventory & Fleet Equipment',
    subtitle: 'Truck tools, warehouse inventory, equipment checkouts & fleet tracking',
    badge: { label: 'Fleet', tone: 'neutral' },
    href: '/dashboard/inventory',
    iconName: 'inventory',
    extraInfo: 'tools equipment fleet trucks warehouse supplies stock parts bins',
  },
  {
    id: 'action-claims',
    section: 'actions',
    title: 'Insurance Claims & Scopes',
    subtitle: 'Adjuster scopes, supplement negotiations, depreciation & Xactimate items',
    badge: { label: 'Insurance', tone: 'warning' },
    href: '/dashboard/claims',
    iconName: 'claims',
    extraInfo: 'insurance claims adjuster scopes supplement depreciation storms roof restoration',
  },
  {
    id: 'action-automations',
    section: 'actions',
    title: 'Automations & Instant Triggers',
    subtitle: 'Automated appointment reminders, quote follow-ups & review requests',
    badge: { label: 'Automate', tone: 'purple' },
    href: '/dashboard/automations',
    iconName: 'automations',
    extraInfo: 'auto followups review triggers automated texts sms drip reminders bots',
  },
  {
    id: 'action-marketing',
    section: 'actions',
    title: 'Marketing & Campaigns',
    subtitle: 'Broadcast campaigns, lead generation, paid ad manager & tracking',
    badge: { label: 'Growth', tone: 'purple' },
    href: '/dashboard/marketing',
    iconName: 'marketing',
    extraInfo: 'ad campaigns google ads meta facebook broadcast marketing lead gen promo',
  },
  {
    id: 'action-reviews',
    section: 'actions',
    title: 'Reviews & Reputation',
    subtitle: 'Customer ratings, private feedback, Google review collection & alerts',
    badge: { label: 'Reputation', tone: 'warning' },
    href: '/dashboard/reviews',
    iconName: 'reviews',
    extraInfo: 'google reviews ratings feedback star rating testimonials customer sentiment',
  },
  {
    id: 'action-schedule-dispatch',
    section: 'actions',
    title: 'Live Crew Dispatch Map',
    subtitle: 'Real-time GPS tracking, active job assignments & crew arrival status',
    badge: { label: 'Dispatch', tone: 'info' },
    href: '/dashboard/schedule/dispatch',
    iconName: 'plan',
    extraInfo: 'gps map dispatch live crew location tracking route arrival live calendar',
  },
  {
    id: 'action-schedule-intake',
    section: 'actions',
    title: 'Intake Channels & Booking Hub',
    subtitle: 'Manage Online Booking, Quick Stops, Text-to-Job & AI Receptionist',
    badge: { label: 'Intake', tone: 'info' },
    href: '/dashboard/schedule/intake',
    iconName: 'booking',
    extraInfo: 'online booking quick stops intake channels calendar booking switches receptionist',
  },
  {
    id: 'action-help',
    section: 'actions',
    title: 'Help Center & Knowledge Base',
    subtitle: 'Browse guides, documentation, setup tutorials or ask support',
    badge: { label: 'Support', tone: 'neutral' },
    href: '/dashboard/help',
    iconName: 'help',
    extraInfo: 'support help documentation guides user manual ticket contact question answers',
  },
];

function dedupeById<T extends { id: string }>(groups: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/**
 * Searches Jobs within the authenticated workspace.
 * Matches on: ref #, client name, phone, email, address, and scope of work.
 */
async function searchWorkspaceJobs(
  supabase: SupabaseClient,
  accountId: string,
  term: string,
  limit: number,
): Promise<SearchBranch> {
  try {
    const isRefOrNum = /^\d+$/.test(term);
    const phoneDigits = term.replace(/\D/g, '');

    const queries = [
      supabase.from('jobs').select('id, ref, client_name, client_phone, client_email, address, scope, status, quoted_amount, scheduled_for')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('client_name', `%${term}%`)
        .limit(limit),
      supabase.from('jobs').select('id, ref, client_name, client_phone, client_email, address, scope, status, quoted_amount, scheduled_for')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('address', `%${term}%`)
        .limit(limit),
      supabase.from('jobs').select('id, ref, client_name, client_phone, client_email, address, scope, status, quoted_amount, scheduled_for')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('scope', `%${term}%`)
        .limit(limit),
    ];

    if (isRefOrNum) {
      queries.push(
        supabase.from('jobs').select('id, ref, client_name, client_phone, client_email, address, scope, status, quoted_amount, scheduled_for')
          .eq('account_id', accountId)
          .is('test_marker', null)
          .ilike('ref', `%${term}%`)
          .limit(limit),
      );
    }

    if (phoneDigits.length >= 3) {
      queries.push(
        supabase.from('jobs').select('id, ref, client_name, client_phone, client_email, address, scope, status, quoted_amount, scheduled_for')
          .eq('account_id', accountId)
          .is('test_marker', null)
          .ilike('client_phone', `%${phoneDigits}%`)
          .limit(limit),
      );
    }

    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) throw res.error;
    }

    type JobRow = {
      id: string;
      ref: string;
      client_name: string;
      client_phone: string | null;
      client_email: string | null;
      address: string | null;
      scope: string | null;
      status: string;
      quoted_amount: number | null;
      scheduled_for: string | null;
    };

    const deduped = dedupeById<JobRow>(results.map((r) => (r.data ?? []) as JobRow[])).slice(0, limit);

    const rows: SearchResultItem[] = deduped.map((j) => {
      const statusMeta = JOB_STATUS_LABEL[j.status] ?? { label: j.status, tone: 'neutral' as SearchBadgeTone };
      const subParts = [
        j.client_name ? `Client: ${j.client_name}` : null,
        j.address ? j.address : null,
        j.quoted_amount ? formatMoney(j.quoted_amount) : null,
        j.scheduled_for ? `Date: ${j.scheduled_for}` : null,
      ].filter(Boolean);

      const title = j.ref ? `Job #${j.ref}${j.scope ? ` · ${j.scope}` : ''}` : j.scope || `Job for ${j.client_name || 'Customer'}`;

      return {
        id: j.id,
        section: 'jobs',
        title,
        subtitle: subParts.join(' • ') || null,
        badge: statusMeta,
        href: `/dashboard/jobs/${j.id}`,
        iconName: 'job',
        extraInfo: j.address || null,
      };
    });

    return { rows, available: true };
  } catch (error) {
    console.error('searchWorkspaceJobs failed:', error);
    return { rows: [], available: false };
  }
}

/**
 * Searches Clients in workspace.
 * Matches on: name, phone, email, address, notes.
 */
async function searchWorkspaceClients(
  supabase: SupabaseClient,
  accountId: string,
  term: string,
  limit: number,
): Promise<SearchBranch> {
  try {
    const phoneDigits = term.replace(/\D/g, '');
    const queries = [
      supabase.from('clients').select('id, name, phone, email, address, notes')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('name', `%${term}%`)
        .limit(limit),
      supabase.from('clients').select('id, name, phone, email, address, notes')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('email', `%${term}%`)
        .limit(limit),
      supabase.from('clients').select('id, name, phone, email, address, notes')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('address', `%${term}%`)
        .limit(limit),
    ];

    if (phoneDigits.length >= 3) {
      queries.push(
        supabase.from('clients').select('id, name, phone, email, address, notes')
          .eq('account_id', accountId)
          .is('test_marker', null)
          .ilike('phone', `%${phoneDigits}%`)
          .limit(limit),
      );
    }

    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) throw res.error;
    }

    type ClientRow = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      notes: string | null;
    };

    const deduped = dedupeById<ClientRow>(results.map((r) => (r.data ?? []) as ClientRow[])).slice(0, limit);

    const rows: SearchResultItem[] = deduped.map((c) => {
      const parts = [
        c.phone ? normalizeUsPhone(c.phone) || c.phone : null,
        c.email ? c.email : null,
        c.address ? c.address : null,
      ].filter(Boolean);

      return {
        id: c.id,
        section: 'clients',
        title: c.name || 'Unnamed Client',
        subtitle: parts.join(' • ') || null,
        badge: { label: 'Client', tone: 'neutral' },
        href: `/dashboard/clients/${c.id}`,
        iconName: 'client',
        extraInfo: c.address || null,
      };
    });

    return { rows, available: true };
  } catch (error) {
    console.error('searchWorkspaceClients failed:', error);
    return { rows: [], available: false };
  }
}

/**
 * Searches Crew & Team members in workspace.
 * Matches on: name, phone, email, role_label, pay_type.
 */
async function searchWorkspaceCrew(
  supabase: SupabaseClient,
  accountId: string,
  term: string,
  limit: number,
): Promise<SearchBranch> {
  try {
    const phoneDigits = term.replace(/\D/g, '');
    const queries = [
      supabase.from('crew').select('id, name, phone, email, role_label, active, pay_type')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .ilike('name', `%${term}%`)
        .limit(limit),
      supabase.from('crew').select('id, name, phone, email, role_label, active, pay_type')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .ilike('role_label', `%${term}%`)
        .limit(limit),
    ];

    if (phoneDigits.length >= 3) {
      queries.push(
        supabase.from('crew').select('id, name, phone, email, role_label, active, pay_type')
          .eq('account_id', accountId)
          .is('deleted_at', null)
          .ilike('phone', `%${phoneDigits}%`)
          .limit(limit),
      );
    }

    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) throw res.error;
    }

    type CrewRow = {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      role_label: string | null;
      active: boolean;
      pay_type: string | null;
    };

    const deduped = dedupeById<CrewRow>(results.map((r) => (r.data ?? []) as CrewRow[])).slice(0, limit);

    const rows: SearchResultItem[] = deduped.map((m) => {
      const parts = [
        m.role_label || 'Team Member',
        m.phone ? normalizeUsPhone(m.phone) || m.phone : null,
        m.email ? m.email : null,
      ].filter(Boolean);

      return {
        id: m.id,
        section: 'crew',
        title: m.name,
        subtitle: parts.join(' • ') || null,
        badge: { label: m.active ? 'Active' : 'Inactive', tone: m.active ? 'success' : 'neutral' },
        href: `/dashboard/crew?tab=people&highlight=${m.id}`,
        iconName: 'crew',
      };
    });

    return { rows, available: true };
  } catch (error) {
    console.error('searchWorkspaceCrew failed:', error);
    return { rows: [], available: false };
  }
}

/**
 * Searches Leads / Inquiries in workspace.
 * Matches on: name, phone, email, address/location, project_type, message.
 */
async function searchWorkspaceLeads(
  supabase: SupabaseClient,
  accountId: string,
  term: string,
  limit: number,
): Promise<SearchBranch> {
  try {
    const phoneDigits = term.replace(/\D/g, '');
    const queries = [
      supabase.from('leads').select('id, name, phone, email, address, project_type, message, status, created_at')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('name', `%${term}%`)
        .limit(limit),
      supabase.from('leads').select('id, name, phone, email, address, project_type, message, status, created_at')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('address', `%${term}%`)
        .limit(limit),
      supabase.from('leads').select('id, name, phone, email, address, project_type, message, status, created_at')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('project_type', `%${term}%`)
        .limit(limit),
      supabase.from('leads').select('id, name, phone, email, address, project_type, message, status, created_at')
        .eq('account_id', accountId)
        .is('test_marker', null)
        .ilike('message', `%${term}%`)
        .limit(limit),
    ];

    if (phoneDigits.length >= 3) {
      queries.push(
        supabase.from('leads').select('id, name, phone, email, address, project_type, message, status, created_at')
          .eq('account_id', accountId)
          .is('test_marker', null)
          .ilike('phone', `%${phoneDigits}%`)
          .limit(limit),
      );
    }

    const results = await Promise.all(queries);
    for (const res of results) {
      if (res.error) throw res.error;
    }

    type LeadRow = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      project_type: string | null;
      message: string | null;
      status: string;
      created_at: string;
    };

    const deduped = dedupeById<LeadRow>(results.map((r) => (r.data ?? []) as LeadRow[])).slice(0, limit);

    const rows: SearchResultItem[] = deduped.map((l) => {
      const statusMeta = LEAD_STATUS_LABEL[l.status] ?? { label: l.status || 'Lead', tone: 'info' as SearchBadgeTone };
      const parts = [
        l.project_type || 'Inquiry',
        l.phone ? normalizeUsPhone(l.phone) || l.phone : null,
        l.address ? l.address : null,
      ].filter(Boolean);

      return {
        id: l.id,
        section: 'leads',
        title: l.name || 'New Lead',
        subtitle: parts.join(' • ') || null,
        badge: statusMeta,
        href: `/dashboard/leads/${l.id}`,
        iconName: 'lead',
        extraInfo: l.address || null,
      };
    });

    return { rows, available: true };
  } catch (error) {
    console.error('searchWorkspaceLeads failed:', error);
    return { rows: [], available: false };
  }
}

/**
 * Extracts distinct address search items from matching jobs and clients.
 */
function extractDistinctAddresses(
  jobs: SearchResultItem[],
  clients: SearchResultItem[],
  leads: SearchResultItem[],
  term: string,
  limit: number,
): SearchResultItem[] {
  const lowerTerm = term.toLowerCase();
  const addressMap = new Map<string, { address: string; relatedTitle: string; targetHref: string }>();

  const pool = [
    ...jobs.map((j) => ({ address: j.extraInfo, title: j.title, href: j.href })),
    ...clients.map((c) => ({ address: c.extraInfo, title: `Client: ${c.title}`, href: c.href })),
    ...leads.map((l) => ({ address: l.extraInfo, title: `Lead: ${l.title}`, href: l.href })),
  ];

  for (const item of pool) {
    if (!item.address) continue;
    const cleanAddr = item.address.trim();
    if (!cleanAddr) continue;

    // Check if the address matches the term
    if (cleanAddr.toLowerCase().includes(lowerTerm)) {
      if (!addressMap.has(cleanAddr)) {
        addressMap.set(cleanAddr, {
          address: cleanAddr,
          relatedTitle: item.title,
          targetHref: item.href,
        });
      }
    }
  }

  const out: SearchResultItem[] = [];
  let idx = 0;
  for (const [addr, meta] of addressMap.entries()) {
    if (out.length >= limit) break;
    out.push({
      id: `addr-${idx++}`,
      section: 'addresses',
      title: addr,
      subtitle: `Matched with ${meta.relatedTitle}`,
      badge: { label: 'Location', tone: 'info' },
      href: meta.targetHref,
      iconName: 'location',
    });
  }

  return out;
}

/**
 * Filters Quick Actions matching the search term.
 */
function filterQuickActions(term: string): SearchResultItem[] {
  if (!term) return QUICK_ACTIONS;
  const lower = term.toLowerCase();
  return QUICK_ACTIONS.filter(
    (a) =>
      a.title.toLowerCase().includes(lower) ||
      (a.subtitle && a.subtitle.toLowerCase().includes(lower)) ||
      (a.extraInfo && a.extraInfo.toLowerCase().includes(lower)) ||
      (a.badge && a.badge.label.toLowerCase().includes(lower)),
  );
}

export type WorkspaceSearchPermissions = {
  canReadJobs?: boolean;
  canReadClients?: boolean;
  canReadCrew?: boolean;
  canReadLeads?: boolean;
};

/**
 * Unified search across all workspace entities.
 */
export async function searchWorkspaceEverything(
  supabase: SupabaseClient,
  accountId: string,
  query: string,
  opts: {
    limitPerSection?: number;
    permissions?: WorkspaceSearchPermissions;
  } = {},
): Promise<WorkspaceSearchResults> {
  const term = query.trim();
  const limit = opts.limitPerSection ?? 6;
  const permissions = opts.permissions ?? {
    canReadJobs: true,
    canReadClients: true,
    canReadCrew: true,
    canReadLeads: true,
  };

  if (!term) {
    return {
      query: '',
      totalMatches: QUICK_ACTIONS.length,
      sections: {
        jobs: [],
        clients: [],
        addresses: [],
        crew: [],
        leads: [],
        actions: QUICK_ACTIONS,
      },
      unavailable: [],
    };
  }

  const emptyBranch: SearchBranch = { rows: [], available: false };

  const [jobsBranch, clientsBranch, crewBranch, leadsBranch] = await Promise.all([
    permissions.canReadJobs !== false
      ? searchWorkspaceJobs(supabase, accountId, term, limit)
      : Promise.resolve(emptyBranch),
    permissions.canReadClients !== false
      ? searchWorkspaceClients(supabase, accountId, term, limit)
      : Promise.resolve(emptyBranch),
    permissions.canReadCrew !== false
      ? searchWorkspaceCrew(supabase, accountId, term, limit)
      : Promise.resolve(emptyBranch),
    permissions.canReadLeads !== false
      ? searchWorkspaceLeads(supabase, accountId, term, limit)
      : Promise.resolve(emptyBranch),
  ]);

  const unavailable: SearchEntitySection[] = [];
  if (permissions.canReadJobs === false || !jobsBranch.available) unavailable.push('jobs');
  if (permissions.canReadClients === false || !clientsBranch.available) unavailable.push('clients');
  if (permissions.canReadCrew === false || !crewBranch.available) unavailable.push('crew');
  if (permissions.canReadLeads === false || !leadsBranch.available) unavailable.push('leads');

  const addresses = extractDistinctAddresses(jobsBranch.rows, clientsBranch.rows, leadsBranch.rows, term, limit);
  const actions = filterQuickActions(term);

  const totalMatches =
    jobsBranch.rows.length +
    clientsBranch.rows.length +
    crewBranch.rows.length +
    leadsBranch.rows.length +
    addresses.length +
    actions.length;

  return {
    query: term,
    totalMatches,
    sections: {
      jobs: jobsBranch.rows,
      clients: clientsBranch.rows,
      addresses,
      crew: crewBranch.rows,
      leads: leadsBranch.rows,
      actions,
    },
    unavailable,
  };
}
