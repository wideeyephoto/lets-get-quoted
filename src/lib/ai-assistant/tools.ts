import type { SupabaseClient } from '@supabase/supabase-js';
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  createCost,
  createJob,
  getJob,
  listCosts,
  listJobs,
  computeMargin,
  formatMoney,
  parseQuoteItems,
  saveQuoteItems,
  type CostType,
  type JobStatus,
  type QuoteItem,
} from '@/lib/jobs';
import { createJobTask, listJobTasks } from '@/lib/job-tasks';
import { outstandingInvoices } from '@/lib/dashboard-money';
import {
  costConfidence,
  DEFAULT_MIN_MARGIN_PCT,
  marginVerdict,
  normalizeCostSource,
} from '@/lib/cost-truth';
import { evaluateAndTriggerMarginAlert } from '@/lib/margin-alerts';
import type { ActionCard, ActiveRecordContext } from './types';

export interface ToolExecutionContext {
  supabase: SupabaseClient;
  accountId: string;
  userId: string;
  role: 'owner' | 'crew' | 'office' | null;
  activeRecord?: ActiveRecordContext;
}

export interface ToolExecutionResult {
  data: unknown;
  actionCard?: ActionCard;
}

type AssistantFunctionDeclaration = Omit<FunctionDeclaration, 'parameters'> & {
  parameters: NonNullable<FunctionDeclaration['parameters']>;
};

/**
 * Tool definitions formatted for Google GenAI / Gemini Function Calling
 */
export const ASSISTANT_TOOLS_DECLARATION: AssistantFunctionDeclaration[] = [
  {
    name: 'modify_active_job',
    description: 'Updates properties on the active job (or a specified job ID), such as changing status, scheduled date/time, estimated hours, or description.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'Job ID to update (optional; defaults to the currently viewed job)',
        },
        status: {
          type: Type.STRING,
          description: 'New status: "new_lead", "in_progress", "complete", or "archived"',
        },
        scheduledFor: {
          type: Type.STRING,
          description: 'Scheduled start date in YYYY-MM-DD format',
        },
        scheduledTime: {
          type: Type.STRING,
          description: 'Scheduled time in HH:MM 24h format (e.g. "09:00")',
        },
        estimatedHours: {
          type: Type.NUMBER,
          description: 'Updated estimated hours to complete the job',
        },
        scope: {
          type: Type.STRING,
          description: 'Updated scope / description of work',
        },
      },
    },
  },
  {
    name: 'add_quote_line_item',
    description: 'Adds an itemized line item (base work or recommended add-on upsell) to the active quote or specified job, recalculating the quoted total.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'Job ID (optional; defaults to the active job on screen)',
        },
        label: {
          type: Type.STRING,
          description: 'Description of the quote item or add-on',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Price of the line item in dollars',
        },
        kind: {
          type: Type.STRING,
          description: 'Item kind: "base" (included in main quote) or "addon" (optional upsell)',
        },
        recommended: {
          type: Type.BOOLEAN,
          description: 'Flag add-on as recommended (true/false)',
        },
      },
      required: ['label', 'amount'],
    },
  },
  {
    name: 'add_job_task',
    description: 'Adds a punch list / checklist task to the active job or a specified job for the crew/contractor to complete.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'Job ID (optional; defaults to the active job)',
        },
        title: {
          type: Type.STRING,
          description: 'Checklist task description (e.g. "Pick up lumber from depot", "Clean up job site")',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_active_record_details',
    description: 'Gets deep live details about the record currently viewed on screen (job, client, etc.), including existing items, schedule, and tasks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: 'Record type: "job" or "client"',
        },
        id: {
          type: Type.STRING,
          description: 'Record ID (optional; defaults to the currently viewed record)',
        },
      },
    },
  },
  {
    name: 'create_quote_or_job',
    description: 'Creates a new quote or job in the contractor workspace for a client with scope, price, and optional schedule.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        clientName: {
          type: Type.STRING,
          description: 'Full name of the client/homeowner',
        },
        clientPhone: {
          type: Type.STRING,
          description: 'Client phone number (e.g. 555-123-4567)',
        },
        clientEmail: {
          type: Type.STRING,
          description: 'Client email address',
        },
        address: {
          type: Type.STRING,
          description: 'Job site address',
        },
        scope: {
          type: Type.STRING,
          description: 'Detailed description or scope of the work to be done',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Total quoted amount in dollars (e.g. 1500 for $1,500.00)',
        },
        items: {
          type: Type.ARRAY,
          description: 'Optional itemized line items for the quote',
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: 'Line item description' },
              amount: { type: Type.NUMBER, description: 'Line item price in dollars' },
              kind: { type: Type.STRING, description: 'Item kind: "base" or "addon"' },
            },
            required: ['label', 'amount'],
          },
        },
        scheduledFor: {
          type: Type.STRING,
          description: 'Scheduled start date in YYYY-MM-DD format (if scheduled)',
        },
        scheduledTime: {
          type: Type.STRING,
          description: 'Scheduled time in HH:MM 24h format (e.g. "09:00")',
        },
        estimatedHours: {
          type: Type.NUMBER,
          description: 'Estimated hours to complete the job',
        },
      },
      required: ['clientName', 'scope'],
    },
  },
  {
    name: 'search_clients',
    description: 'Searches clients by name, phone number, email address, or street address.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search keyword (name, phone, email, or address)',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_jobs_and_quotes',
    description: 'Searches jobs and quotes by status, client name, job ref (e.g. J-1002), or keywords.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search text (e.g. client name, reference code, address, or keyword)',
        },
        status: {
          type: Type.STRING,
          description: 'Filter by job status: "new_lead" (pending quote), "in_progress", "complete", or "archived"',
        },
        limit: {
          type: Type.INTEGER,
          description: 'Maximum results to return (default: 10)',
        },
      },
    },
  },
  {
    name: 'get_unpaid_invoices_and_payments',
    description: 'Retrieves all outstanding and unpaid invoices, payment requests, and amounts owed by clients.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description: 'Maximum number of unpaid invoices to return (default: 15)',
        },
      },
    },
  },
  {
    name: 'get_schedule',
    description: 'Retrieves the scheduled jobs and appointments for a specific date, date range, or upcoming week.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: {
          type: Type.STRING,
          description: 'Specific date in YYYY-MM-DD format',
        },
        startDate: {
          type: Type.STRING,
          description: 'Start of date range in YYYY-MM-DD format',
        },
        endDate: {
          type: Type.STRING,
          description: 'End of date range in YYYY-MM-DD format',
        },
        daysAhead: {
          type: Type.INTEGER,
          description: 'Number of upcoming days to check if start/end dates are not provided (default: 7)',
        },
      },
    },
  },
  {
    name: 'get_business_summary',
    description: 'Retrieves high-level performance metrics: active jobs count, quotes awaiting approval, outstanding owed revenue, and total clients.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'log_job_expense',
    description: 'Logs a material, subcontractor, labor, or other job expense against the active job or a specified job ID, updating job margin and triggering margin health checks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'Job ID (optional; defaults to the active job currently viewed on screen)',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Cost amount in dollars (e.g. 145.50 for $145.50)',
        },
        description: {
          type: Type.STRING,
          description: 'Description of the expense or purchased supplies (e.g. "Home Depot: 2x4s and deck screws", "Dump fee")',
        },
        type: {
          type: Type.STRING,
          description: 'Expense category: "material" (default), "sub" (subcontractor), "labor", or "other"',
        },
        supplier: {
          type: Type.STRING,
          description: 'Store, vendor or subcontractor name (e.g. "Home Depot", "ABC Supply", "Ferguson")',
        },
        costSource: {
          type: Type.STRING,
          description: 'Provenance of figure: "receipt" (default), "supplier_invoice", "price_book", or "estimated"',
        },
      },
      required: ['amount', 'description'],
    },
  },
  {
    name: 'get_job_cost_analysis',
    description: 'Retrieves complete financial intelligence for the active job or specified job ID: quoted revenue, itemized cost breakdown, loaded labor wages + burden, profit margin %, cost confidence evidence %, duplicate warnings, and margin floor health.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        jobId: {
          type: Type.STRING,
          description: 'Job ID to analyze (optional; defaults to the active job on screen)',
        },
      },
    },
  },
  {
    name: 'navigate_to',
    description: 'Provides direct in-app navigation link to a specific section or settings page in the dashboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: {
          type: Type.STRING,
          description: 'Target section: "dashboard", "jobs", "schedule", "clients", "invoices", "cash_flow", "expenses", "settings", "sites", "automations", "leads", "reviews", "crew", "marketing", "ads", "google_ads", or "sms_settings"',
        },
        description: {
          type: Type.STRING,
          description: 'Reason for directing the user to this page',
        },
      },
      required: ['destination'],
    },
  },
];

/**
 * Server-side tool execution router
 */
export async function executeAssistantTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const { supabase, accountId, activeRecord } = ctx;

  switch (toolName) {
    case 'modify_active_job': {
      const targetJobId = (args.jobId as string) || (activeRecord?.type === 'job' ? activeRecord.id : null);
      if (!targetJobId) {
        throw new Error('No active job specified or detected on the current screen.');
      }

      const existingJob = await getJob(supabase, accountId, targetJobId);
      if (!existingJob) {
        throw new Error(`Job not found for ID ${targetJobId}`);
      }

      const patch: Record<string, unknown> = {};
      if (args.status) patch.status = args.status as JobStatus;
      if (args.scheduledFor !== undefined) patch.scheduled_for = args.scheduledFor ? String(args.scheduledFor) : null;
      if (args.scheduledTime !== undefined) patch.scheduled_time = args.scheduledTime ? String(args.scheduledTime) : null;
      if (args.estimatedHours !== undefined) patch.estimated_hours = typeof args.estimatedHours === 'number' ? args.estimatedHours : null;
      if (args.scope !== undefined) patch.scope = String(args.scope);

      const { data: updated, error } = await supabase
        .from('jobs')
        .update(patch)
        .eq('account_id', accountId)
        .eq('id', targetJobId)
        .select('*')
        .single();

      if (error || !updated) {
        throw error ?? new Error('Failed to update job');
      }

      const linkUrl = `/dashboard/jobs/${targetJobId}`;
      const actionCard: ActionCard = {
        type: 'job_updated',
        title: `Updated Job ${updated.ref}`,
        description: `${updated.client_name} • Status: ${updated.status}${updated.scheduled_for ? ` • Scheduled: ${updated.scheduled_for}` : ''}`,
        linkUrl,
        linkLabel: 'Refresh Job Page',
        badge: updated.status,
        data: { job: updated },
      };

      return {
        data: {
          jobId: updated.id,
          ref: updated.ref,
          status: updated.status,
          scheduledFor: updated.scheduled_for,
          scope: updated.scope,
        },
        actionCard,
      };
    }

    case 'add_quote_line_item': {
      const targetJobId = (args.jobId as string) || (activeRecord?.type === 'job' ? activeRecord.id : null);
      if (!targetJobId) {
        throw new Error('No active job specified or detected on screen.');
      }

      const existingJob = await getJob(supabase, accountId, targetJobId);
      if (!existingJob) {
        throw new Error(`Job not found for ID ${targetJobId}`);
      }

      const currentItems = parseQuoteItems(existingJob.quote_items);
      const label = String(args.label ?? 'Item').trim();
      const amount = Number(args.amount) || 0;
      const kind = args.kind === 'addon' ? 'addon' : 'base';
      const recommended = args.recommended === true;

      const newItem: QuoteItem = {
        id: `qi-${Date.now()}-${currentItems.length + 1}`,
        label,
        amount,
        kind,
        selected: true,
        recommended,
      };

      const updatedItems = [...currentItems, newItem];
      const savedJob = await saveQuoteItems(supabase, accountId, targetJobId, updatedItems);

      const linkUrl = `/dashboard/jobs/${targetJobId}`;
      const actionCard: ActionCard = {
        type: 'quote_item_added',
        title: `Added "${label}" ($${amount.toLocaleString()}) to ${savedJob.ref}`,
        description: `New quoted total: $${Number(savedJob.quoted_amount).toLocaleString()} (${updatedItems.length} items)`,
        linkUrl,
        linkLabel: 'View Updated Quote',
        badge: `+$${amount.toLocaleString()}`,
        data: { job: savedJob, newItem },
      };

      return {
        data: {
          jobId: savedJob.id,
          ref: savedJob.ref,
          addedItem: newItem,
          totalQuoteAmount: savedJob.quoted_amount,
          itemCount: updatedItems.length,
        },
        actionCard,
      };
    }

    case 'add_job_task': {
      const targetJobId = (args.jobId as string) || (activeRecord?.type === 'job' ? activeRecord.id : null);
      if (!targetJobId) {
        throw new Error('No active job specified or detected on screen.');
      }

      const title = String(args.title ?? '').trim();
      if (!title) throw new Error('Task title is required.');

      const task = await createJobTask(supabase, accountId, targetJobId, title);
      const linkUrl = `/dashboard/jobs/${targetJobId}`;

      const actionCard: ActionCard = {
        type: 'task_created',
        title: `Added Checklist Task`,
        description: `"${task.title}" added to job punch list`,
        linkUrl,
        linkLabel: 'View Punch List',
        badge: 'Task Added',
        data: { task },
      };

      return {
        data: {
          taskId: task.id,
          jobId: task.job_id,
          title: task.title,
          done: task.done,
        },
        actionCard,
      };
    }

    case 'get_active_record_details': {
      const recType = (args.type as string) || activeRecord?.type || 'job';
      const recId = (args.id as string) || activeRecord?.id;

      if (!recId) {
        return {
          data: { note: 'No active record ID on screen.' },
        };
      }

      if (recType === 'job') {
        const [job, tasks] = await Promise.all([
          getJob(supabase, accountId, recId),
          listJobTasks(supabase, accountId, recId),
        ]);

        if (!job) throw new Error(`Job ${recId} not found.`);

        return {
          data: {
            type: 'job',
            id: job.id,
            ref: job.ref,
            clientName: job.client_name,
            clientPhone: job.client_phone,
            clientEmail: job.client_email,
            address: job.address,
            scope: job.scope,
            status: job.status,
            quotedAmount: job.quoted_amount,
            quoteItems: job.quote_items,
            scheduledFor: job.scheduled_for,
            scheduledTime: job.scheduled_time,
            tasks,
          },
        };
      } else if (recType === 'client') {
        const { data: client } = await supabase
          .from('clients')
          .select('*')
          .eq('account_id', accountId)
          .eq('id', recId)
          .maybeSingle();

        if (!client) throw new Error(`Client ${recId} not found.`);

        const { data: clientJobs } = await supabase
          .from('jobs')
          .select('id, ref, scope, status, quoted_amount, scheduled_for')
          .eq('account_id', accountId)
          .eq('client_id', recId);

        return {
          data: {
            type: 'client',
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            address: client.address,
            notes: client.notes,
            jobs: clientJobs ?? [],
          },
        };
      }

      return { data: { note: `Unknown record type: ${recType}` } };
    }

    case 'create_quote_or_job': {
      const clientName = String(args.clientName ?? '').trim();
      const clientPhone = args.clientPhone ? String(args.clientPhone).trim() : undefined;
      const clientEmail = args.clientEmail ? String(args.clientEmail).trim() : undefined;
      const address = args.address ? String(args.address).trim() : undefined;
      const scope = String(args.scope ?? '').trim();
      const amount = typeof args.amount === 'number' ? args.amount : 0;
      const scheduledFor = args.scheduledFor ? String(args.scheduledFor).trim() : undefined;
      const scheduledTime = args.scheduledTime ? String(args.scheduledTime).trim() : undefined;
      const estimatedHours = typeof args.estimatedHours === 'number' ? args.estimatedHours : undefined;

      const rawItems = Array.isArray(args.items) ? args.items : [];
      const quoteItems: QuoteItem[] = rawItems.map((item, idx) => ({
        id: `qi-${idx + 1}`,
        label: String((item as { label?: string }).label ?? 'Item'),
        amount: Number((item as { amount?: number }).amount ?? 0),
        kind: (item as { kind?: string }).kind === 'addon' ? 'addon' : 'base',
        selected: true,
        recommended: false,
      }));

      // Create base job row
      const initialJob = await createJob(supabase, accountId, {
        clientName,
        clientPhone,
        clientEmail,
        address,
        scope,
        quotedAmount: amount,
        scheduledFor,
        scheduledTime,
        estimatedHours,
        status: scheduledFor ? 'in_progress' : 'new_lead',
      });

      let finalJob = initialJob;
      if (quoteItems.length > 0) {
        finalJob = await saveQuoteItems(supabase, accountId, initialJob.id, quoteItems);
      }

      const linkUrl = `/dashboard/jobs/${finalJob.id}`;
      const actionCard: ActionCard = {
        type: 'quote_created',
        title: `Created Quote & Job ${finalJob.ref}`,
        description: `${finalJob.client_name} • $${Number(finalJob.quoted_amount).toLocaleString()}${finalJob.scheduled_for ? ` • Scheduled ${finalJob.scheduled_for}` : ''}`,
        linkUrl,
        linkLabel: 'Open Job Details',
        badge: finalJob.status === 'new_lead' ? 'Quote Draft' : 'Scheduled',
        data: {
          jobId: finalJob.id,
          ref: finalJob.ref,
          clientName: finalJob.client_name,
          amount: finalJob.quoted_amount,
          status: finalJob.status,
        },
      };

      return {
        data: {
          jobId: finalJob.id,
          ref: finalJob.ref,
          clientName: finalJob.client_name,
          quotedAmount: finalJob.quoted_amount,
          status: finalJob.status,
          linkUrl,
        },
        actionCard,
      };
    }

    case 'search_clients': {
      const query = String(args.query ?? '').trim();
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));

      let dbQuery = supabase
        .from('clients')
        .select('id, name, phone, email, address, notes, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (query) {
        dbQuery = dbQuery.or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%,address.ilike.%${query}%`);
      }

      const { data: clients, error } = await dbQuery;
      if (error) throw error;

      const results = clients ?? [];
      const actionCard: ActionCard = {
        type: 'client_list',
        title: `Found ${results.length} Client${results.length === 1 ? '' : 's'}`,
        description: results.slice(0, 3).map((c) => c.name).join(', ') + (results.length > 3 ? '...' : ''),
        linkUrl: '/dashboard/clients',
        linkLabel: 'View All Clients',
        badge: `${results.length} results`,
        data: { clients: results },
      };

      return {
        data: {
          count: results.length,
          clients: results.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            address: c.address,
            linkUrl: `/dashboard/clients/${c.id}`,
          })),
        },
        actionCard,
      };
    }

    case 'search_jobs_and_quotes': {
      const query = args.query ? String(args.query).trim() : '';
      const status = args.status ? (String(args.status).trim() as JobStatus) : undefined;
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));

      let dbQuery = supabase
        .from('jobs')
        .select('id, ref, client_name, client_phone, address, scope, status, quoted_amount, scheduled_for, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) {
        dbQuery = dbQuery.eq('status', status);
      }

      if (query) {
        dbQuery = dbQuery.or(`client_name.ilike.%${query}%,ref.ilike.%${query}%,address.ilike.%${query}%,scope.ilike.%${query}%`);
      }

      const { data: jobs, error } = await dbQuery;
      if (error) throw error;

      const results = jobs ?? [];
      const actionCard: ActionCard = {
        type: 'job_list',
        title: `${results.length} Job${results.length === 1 ? '' : 's'} Found`,
        description: results.slice(0, 3).map((j) => `${j.ref} (${j.client_name})`).join(', ') + (results.length > 3 ? '...' : ''),
        linkUrl: '/dashboard/jobs',
        linkLabel: 'View Jobs Pipeline',
        badge: status || 'all jobs',
        data: { jobs: results },
      };

      return {
        data: {
          count: results.length,
          jobs: results.map((j) => ({
            id: j.id,
            ref: j.ref,
            clientName: j.client_name,
            status: j.status,
            quotedAmount: j.quoted_amount,
            scheduledFor: j.scheduled_for,
            linkUrl: `/dashboard/jobs/${j.id}`,
          })),
        },
        actionCard,
      };
    }

    case 'get_unpaid_invoices_and_payments': {
      const limit = Math.min(25, Math.max(1, Number(args.limit) || 15));

      const [{ data: invoices }, { data: payments }, { data: jobs }] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, job_id, ref, status, total, created_at')
          .eq('account_id', accountId)
          .in('status', ['sent', 'signed'])
          .order('created_at', { ascending: false })
          .limit(limit * 2),
        supabase
          .from('payments')
          .select('id, invoice_id, job_id, amount, refunded_amount, status, paid_at')
          .eq('account_id', accountId),
        supabase
          .from('jobs')
          .select('id, ref, client_name, client_phone')
          .eq('account_id', accountId),
      ]);

      const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));
      const collectedByInvoice = new Map<string, number>();

      for (const p of payments ?? []) {
        if (p.status === 'paid' && p.invoice_id) {
          const net = Math.max(0, Number(p.amount) - Number(p.refunded_amount || 0));
          collectedByInvoice.set(p.invoice_id, (collectedByInvoice.get(p.invoice_id) ?? 0) + net);
        }
      }

      const unpaidList: Array<{
        invoiceId: string;
        invoiceRef: string;
        jobRef: string;
        clientName: string;
        total: number;
        collected: number;
        balanceOwed: number;
        status: string;
        linkUrl: string;
      }> = [];

      let totalOutstanding = 0;

      for (const inv of invoices ?? []) {
        const total = Number(inv.total) || 0;
        const collected = collectedByInvoice.get(inv.id) ?? 0;
        const balance = Math.max(0, Math.round((total - collected) * 100) / 100);

        if (balance > 0.01) {
          totalOutstanding += balance;
          const job = jobMap.get(inv.job_id);
          unpaidList.push({
            invoiceId: inv.id,
            invoiceRef: inv.ref,
            jobRef: job?.ref ?? 'Job',
            clientName: job?.client_name ?? 'Unknown Client',
            total,
            collected,
            balanceOwed: balance,
            status: inv.status,
            linkUrl: `/dashboard/jobs/${inv.job_id}`,
          });
        }
      }

      const formattedTotal = `$${Math.round(totalOutstanding).toLocaleString()}`;
      const actionCard: ActionCard = {
        type: 'unpaid_invoices',
        title: `${unpaidList.length} Unpaid Invoices (${formattedTotal})`,
        description: unpaidList.slice(0, 3).map((u) => `${u.clientName}: $${u.balanceOwed.toLocaleString()}`).join(' • '),
        linkUrl: '/dashboard/cash-flow',
        linkLabel: 'Open Cash Flow',
        badge: formattedTotal,
        data: { unpaid: unpaidList, totalOutstanding },
      };

      return {
        data: {
          totalOutstanding,
          count: unpaidList.length,
          unpaidInvoices: unpaidList.slice(0, limit),
        },
        actionCard,
      };
    }

    case 'get_schedule': {
      let startDateStr: string;
      let endDateStr: string;

      const today = new Date().toISOString().slice(0, 10);

      if (args.date) {
        startDateStr = String(args.date).trim();
        endDateStr = String(args.date).trim();
      } else if (args.startDate) {
        startDateStr = String(args.startDate).trim();
        endDateStr = args.endDate ? String(args.endDate).trim() : startDateStr;
      } else {
        startDateStr = today;
        const daysAhead = Number(args.daysAhead) || 7;
        const endDateObj = new Date();
        endDateObj.setDate(endDateObj.getDate() + daysAhead);
        endDateStr = endDateObj.toISOString().slice(0, 10);
      }

      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, ref, client_name, client_phone, address, scope, status, scheduled_for, scheduled_time, estimated_hours')
        .eq('account_id', accountId)
        .gte('scheduled_for', startDateStr)
        .lte('scheduled_for', endDateStr)
        .order('scheduled_for', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false });

      if (error) throw error;

      const schedule = (jobs ?? []).map((j) => ({
        id: j.id,
        ref: j.ref,
        clientName: j.client_name,
        clientPhone: j.client_phone,
        address: j.address,
        scope: j.scope,
        date: j.scheduled_for,
        time: j.scheduled_time,
        estimatedHours: j.estimated_hours,
        status: j.status,
        linkUrl: `/dashboard/jobs/${j.id}`,
      }));

      const actionCard: ActionCard = {
        type: 'schedule',
        title: `Schedule (${startDateStr === endDateStr ? startDateStr : `${startDateStr} to ${endDateStr}`})`,
        description: schedule.length === 0 ? 'No jobs scheduled in this window' : `${schedule.length} job${schedule.length === 1 ? '' : 's'} scheduled`,
        linkUrl: '/dashboard/schedule',
        linkLabel: 'Open Calendar Schedule',
        badge: `${schedule.length} job${schedule.length === 1 ? '' : 's'}`,
        data: { schedule },
      };

      return {
        data: {
          startDate: startDateStr,
          endDate: endDateStr,
          totalJobs: schedule.length,
          schedule,
        },
        actionCard,
      };
    }

    case 'get_business_summary': {
      const [jobs, { count: clientCount }, { data: invoices }, { data: payments }] = await Promise.all([
        listJobs(supabase, accountId),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
        supabase.from('invoices').select('id, total, status, job_id').eq('account_id', accountId),
        supabase.from('payments').select('amount, refunded_amount, status, paid_at, invoice_id').eq('account_id', accountId),
      ]);

      const activeJobs = jobs.filter((j) => j.status === 'in_progress');
      const pendingQuotes = jobs.filter((j) => j.status === 'new_lead' && Number(j.quoted_amount) > 0);
      const pendingQuoteTotal = pendingQuotes.reduce((sum, j) => sum + Number(j.quoted_amount), 0);
      const unpaid = outstandingInvoices(invoices ?? [], payments ?? []);

      const actionCard: ActionCard = {
        type: 'business_summary',
        title: 'Business Performance Summary',
        description: `${activeJobs.length} active jobs • $${Math.round(pendingQuoteTotal).toLocaleString()} in pending quotes • $${Math.round(unpaid.total).toLocaleString()} unpaid`,
        linkUrl: '/dashboard',
        linkLabel: 'Go to Dashboard',
        data: {
          activeJobsCount: activeJobs.length,
          pendingQuotesCount: pendingQuotes.length,
          pendingQuoteTotal,
          unpaidTotal: unpaid.total,
          clientCount: clientCount ?? 0,
        },
      };

      return {
        data: {
          activeJobsCount: activeJobs.length,
          pendingQuotesCount: pendingQuotes.length,
          pendingQuotesTotalValue: pendingQuoteTotal,
          unpaidInvoicesCount: unpaid.count,
          unpaidInvoicesTotalValue: unpaid.total,
          totalClients: clientCount ?? 0,
        },
        actionCard,
      };
    }

    case 'log_job_expense': {
      const targetJobId = (args.jobId as string) || (activeRecord?.type === 'job' ? activeRecord.id : null);
      if (!targetJobId) {
        throw new Error('No target job specified or detected on screen. Specify a job ref or open the job first.');
      }

      const existingJob = await getJob(supabase, accountId, targetJobId);
      if (!existingJob) {
        throw new Error(`Job not found for ID ${targetJobId}`);
      }

      const description = String(args.description ?? 'Job expense').trim();
      const amount = Number(args.amount) || 0;
      if (amount <= 0) {
        throw new Error('Expense amount must be greater than $0.00.');
      }

      const rawType = String(args.type ?? 'material').toLowerCase();
      const costType: CostType = (['material', 'labor', 'sub', 'other'].includes(rawType) ? rawType : 'material') as CostType;
      const supplier = args.supplier ? String(args.supplier).trim() : null;
      const costSource = normalizeCostSource(args.costSource ?? 'receipt');

      const costInput = costType === 'labor'
        ? {
            type: 'labor' as const,
            description,
            hours: Number(args.hours) || 1,
            rate: amount,
            supplier,
            source: costSource,
          }
        : {
            type: costType as Exclude<CostType, 'labor'>,
            description,
            amount,
            supplier,
            source: costSource,
          };

      const createdCost = await createCost(supabase, accountId, targetJobId, costInput);

      // Trigger proactive margin alert if newly logged cost pushes margin below threshold
      const alertResult = await evaluateAndTriggerMarginAlert(supabase, accountId, targetJobId, createdCost);

      const allCosts = await listCosts(supabase, accountId, targetJobId);
      const margin = computeMargin(existingJob, allCosts);
      const marginPct = Math.round(margin.margin * 100);

      const linkUrl = `/dashboard/jobs/${targetJobId}?open=costs`;
      const actionCard: ActionCard = {
        type: 'expense_logged',
        title: `Logged $${amount.toFixed(2)} (${createdCost.category}) on ${existingJob.ref}`,
        description: `"${description}"${supplier ? ` from ${supplier}` : ''} • Updated Margin: ${marginPct}% (Profit: ${formatMoney(margin.profit)})`,
        linkUrl,
        linkLabel: 'View Job Costs',
        badge: `-$${amount.toFixed(2)}`,
        data: {
          cost: createdCost,
          margin,
          alertTriggered: alertResult.triggered,
        },
      };

      return {
        data: {
          costId: createdCost.id,
          jobId: existingJob.id,
          jobRef: existingJob.ref,
          clientName: existingJob.client_name,
          category: createdCost.category,
          amount,
          supplier,
          source: createdCost.cost_source,
          updatedTotalCost: margin.totalCost,
          updatedProfit: margin.profit,
          updatedMarginPct: marginPct,
          marginAlertTriggered: alertResult.triggered,
          marginAlertMessage: alertResult.message,
        },
        actionCard,
      };
    }

    case 'get_job_cost_analysis': {
      const targetJobId = (args.jobId as string) || (activeRecord?.type === 'job' ? activeRecord.id : null);
      if (!targetJobId) {
        throw new Error('No active job specified or detected on screen. Specify a job ID or open a job to analyze.');
      }

      const [existingJob, allCosts, { data: account }] = await Promise.all([
        getJob(supabase, accountId, targetJobId),
        listCosts(supabase, accountId, targetJobId),
        supabase.from('accounts').select('min_margin_pct').eq('id', accountId).maybeSingle(),
      ]);

      if (!existingJob) {
        throw new Error(`Job not found for ID ${targetJobId}`);
      }

      const minMarginPct = Number(account?.min_margin_pct) || DEFAULT_MIN_MARGIN_PCT;
      const margin = computeMargin(existingJob, allCosts);
      const marginPct = Math.round(margin.margin * 100);

      const confidence = costConfidence(
        allCosts.map((c) => ({
          amount: Number(c.amount) || 0,
          burdenAmount: Number(c.burden_amount) || 0,
          source: c.cost_source,
        })),
      );

      const verdict = marginVerdict({
        revenue: margin.revenue,
        totalCost: margin.totalCost,
        minMarginPct,
        evidencedPct: confidence.evidencedPct,
      });

      const materialsTotal = allCosts
        .filter((c) => c.type === 'material' || c.type === 'receipt')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const laborWagesTotal = allCosts
        .filter((c) => c.type === 'labor')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const laborBurdenTotal = allCosts
        .filter((c) => c.type === 'labor')
        .reduce((sum, c) => sum + Number(c.burden_amount || 0), 0);
      const subsTotal = allCosts
        .filter((c) => c.type === 'sub')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);
      const otherTotal = allCosts
        .filter((c) => c.type === 'other')
        .reduce((sum, c) => sum + Number(c.amount || 0), 0);

      const linkUrl = `/dashboard/jobs/${targetJobId}?open=costs`;
      const badgeText = verdict.losing
        ? 'Loss Alert'
        : verdict.below
        ? `Below ${minMarginPct}% Floor`
        : `${marginPct}% Healthy Margin`;

      const actionCard: ActionCard = {
        type: 'cost_analysis',
        title: `Cost & Margin Analysis: ${existingJob.ref}`,
        description: `Revenue: ${formatMoney(margin.revenue)} • Total Costs: ${formatMoney(margin.totalCost)} • Net Profit: ${formatMoney(margin.profit)} (${marginPct}% margin)`,
        linkUrl,
        linkLabel: 'Inspect Cost Breakdown',
        badge: badgeText,
        data: {
          margin,
          confidence,
          verdict,
          costsCount: allCosts.length,
        },
      };

      return {
        data: {
          jobId: existingJob.id,
          jobRef: existingJob.ref,
          clientName: existingJob.client_name,
          quotedRevenue: margin.revenue,
          totalCosts: margin.totalCost,
          netProfit: margin.profit,
          marginPct,
          targetMarginFloorPct: minMarginPct,
          marginStatus: verdict.losing ? 'operating_loss' : verdict.below ? 'below_floor' : 'healthy',
          verdictMessage: verdict.message,
          costBreakdown: {
            materials: Math.round(materialsTotal * 100) / 100,
            laborWages: Math.round(laborWagesTotal * 100) / 100,
            laborBurden: Math.round(laborBurdenTotal * 100) / 100,
            laborTotal: Math.round((laborWagesTotal + laborBurdenTotal) * 100) / 100,
            subcontractors: Math.round(subsTotal * 100) / 100,
            other: Math.round(otherTotal * 100) / 100,
          },
          costConfidence: {
            evidencedTotal: confidence.evidenced,
            estimatedTotal: confidence.estimated,
            evidenceRatioPct: Math.round(confidence.evidencedPct * 100),
          },
          itemizedCostsCount: allCosts.length,
        },
        actionCard,
      };
    }

    case 'navigate_to': {
      const destination = String(args.destination ?? 'dashboard').toLowerCase();
      const description = args.description ? String(args.description) : undefined;

      const pathMap: Record<string, { path: string; label: string }> = {
        dashboard: { path: '/dashboard', label: 'Dashboard' },
        jobs: { path: '/dashboard/jobs', label: 'Jobs & Quotes' },
        schedule: { path: '/dashboard/schedule', label: 'Calendar Schedule' },
        clients: { path: '/dashboard/clients', label: 'Clients Directory' },
        invoices: { path: '/dashboard/cash-flow', label: 'Invoices & Payments' },
        cash_flow: { path: '/dashboard/cash-flow', label: 'Cash Flow & Forecast' },
        expenses: { path: '/dashboard/expenses', label: 'All Expenses Ledger' },
        settings: { path: '/dashboard/settings', label: 'Business Settings' },
        sites: { path: '/dashboard/sites', label: 'Website Builder' },
        automations: { path: '/dashboard/automations', label: 'SMS & Email Automations' },
        leads: { path: '/dashboard/leads', label: 'Incoming Leads' },
        reviews: { path: '/dashboard/reviews', label: 'Customer Reviews' },
        crew: { path: '/dashboard/crew', label: 'Crew & Labor' },
        marketing: { path: '/dashboard/marketing', label: 'Marketing & Campaigns' },
        ads: { path: '/dashboard/marketing/ads', label: 'Google Ads Autopilot & Managed Campaigns' },
        google_ads: { path: '/dashboard/marketing/ads', label: 'Google Ads Autopilot & Managed Campaigns' },
        google_lsa: { path: '/dashboard/marketing/ads', label: 'Google Guaranteed (LSA) & Ads Hub' },
        ad_billing: { path: '/dashboard/marketing/ads', label: 'Ad Wallet & Campaign Budget' },
        sms_settings: { path: '/dashboard/messages/dedicated-number', label: 'SMS Dedicated Number Settings' },
      };

      const matched = pathMap[destination] ?? { path: '/dashboard', label: 'Dashboard' };
      const actionCard: ActionCard = {
        type: 'navigation',
        title: `Navigate to ${matched.label}`,
        description: description ?? `Jump directly to ${matched.label}`,
        linkUrl: matched.path,
        linkLabel: `Open ${matched.label}`,
        badge: 'Shortcut',
      };

      return {
        data: {
          destination: matched.label,
          path: matched.path,
        },
        actionCard,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
