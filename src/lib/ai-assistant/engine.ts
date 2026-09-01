import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { getJob, listCosts, computeMargin, parseQuoteItems } from '@/lib/jobs';
import { listJobTasks } from '@/lib/job-tasks';
import { ASSISTANT_TOOLS_DECLARATION, executeAssistantTool, type ToolExecutionContext } from './tools';
import type { ActionCard, ActiveRecordContext, AssistantContext, AssistantMessage, AssistantToolCall } from './types';
import { getCompanion } from './companions';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Automatically resolves and pre-hydrates active record data from URL path or provided context
 */
export async function hydrateActiveRecordContext(
  currentPath: string | undefined,
  providedRecord: ActiveRecordContext | undefined,
  toolCtx: ToolExecutionContext,
): Promise<ActiveRecordContext | undefined> {
  if (providedRecord && providedRecord.details) {
    return providedRecord;
  }

  const path = currentPath || '';
  const { supabase, accountId } = toolCtx;

  // Match /dashboard/jobs/[id]
  const jobMatch = /\/dashboard\/jobs\/([0-9a-fA-F-]{36})/.exec(path);
  if (jobMatch) {
    const jobId = jobMatch[1];
    try {
      const [job, tasks, costs] = await Promise.all([
        getJob(supabase, accountId, jobId),
        listJobTasks(supabase, accountId, jobId),
        listCosts(supabase, accountId, jobId),
      ]);

      if (job) {
        const margin = computeMargin(job, costs);
        return {
          type: 'job',
          id: job.id,
          ref: job.ref,
          title: `Job ${job.ref} - ${job.client_name}`,
          details: {
            ref: job.ref,
            clientName: job.client_name,
            clientPhone: job.client_phone,
            clientEmail: job.client_email,
            address: job.address,
            scope: job.scope,
            status: job.status,
            quotedAmount: job.quoted_amount,
            quoteItems: parseQuoteItems(job.quote_items),
            scheduledFor: job.scheduled_for,
            scheduledTime: job.scheduled_time,
            estimatedHours: job.estimated_hours,
            totalCost: margin.totalCost,
            profit: margin.profit,
            marginPct: Math.round(margin.margin * 100),
            loggedCostsCount: costs.length,
            tasks: tasks.map((t) => ({ id: t.id, title: t.title, done: t.done })),
          },
        };
      }
    } catch (e) {
      console.error('Error pre-hydrating job context:', e);
    }
  }

  // Match /dashboard/clients/[id]
  const clientMatch = /\/dashboard\/clients\/([0-9a-fA-F-]{36})/.exec(path);
  if (clientMatch) {
    const clientId = clientMatch[1];
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', clientId)
        .maybeSingle();

      if (client) {
        const { data: clientJobs } = await supabase
          .from('jobs')
          .select('id, ref, scope, status, quoted_amount, scheduled_for')
          .eq('account_id', accountId)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(5);

        return {
          type: 'client',
          id: client.id,
          title: `Client: ${client.name}`,
          details: {
            name: client.name,
            phone: client.phone,
            email: client.email,
            address: client.address,
            notes: client.notes,
            recentJobs: clientJobs ?? [],
          },
        };
      }
    } catch (e) {
      console.error('Error pre-hydrating client context:', e);
    }
  }

  return providedRecord;
}

function buildSystemInstruction(ctx: AssistantContext): string {
  const today = new Date().toISOString().slice(0, 10);
  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  let activeRecordPrompt = '';
  if (ctx.activeRecord && ctx.activeRecord.details) {
    const rec = ctx.activeRecord;
    activeRecordPrompt = `
*** ACTIVE SCREEN RECORD (${rec.type.toUpperCase()}) ***
Target ID: ${rec.id}
Title: ${rec.title || rec.ref || 'Active Record'}
Details: ${JSON.stringify(rec.details, null, 2)}

CONTEXTUAL INSTRUCTIONS FOR ACTIVE RECORD:
- The contractor is CURRENTLY viewing this record on their screen.
- If the contractor says "this job", "this quote", "this client", "add a line item", "reschedule it", "mark complete", "add a task", or gives any relative commands without specifying a job, operate DIRECTLY on this active record (ID: ${rec.id}) using "modify_active_job", "add_quote_line_item", or "add_job_task".
- Do NOT ask the user for a job reference or ID when this active record is present.
`;
  }

  const companion = getCompanion(ctx.companionId, ctx.companionTrade);

  return `You are ${companion.name} (${companion.badgeLabel}), ${companion.tagline} for the contractor platform "Let's Get Quoted".
You are assisting an authenticated contractor / business operator inside their live dashboard.
Introduce yourself as ${companion.name} if asked.
Role & Tone: ${companion.role}. ${companion.species ? `Persona Species/Vibe: ${companion.species}.` : ''}

Current Workspace Context:
- Business Name: "${ctx.businessName || 'Contractor Workspace'}"
- User Role: "${ctx.role || 'owner'}"
- Current Date (UTC): ${today}
- Current Local Time: ${currentTime}
- Active Dashboard Screen: "${ctx.currentPath || '/dashboard'}"
${activeRecordPrompt}

Your Capabilities & Tools:
1. "modify_active_job": Update status, scheduled date/time, estimated hours, or description on the active job.
2. "add_quote_line_item": Add base work or add-on upsell line items to the active quote and recalculate totals.
3. "log_job_expense": Log material, subcontractor, labor, or supply expenses against jobs, updating profit margins.
4. "get_job_cost_analysis": Retrieve deep financial intelligence, cost breakdown, labor wages + burden, profit margin %, and duplicate warnings for a job.
5. "add_job_task": Add punch list / checklist tasks to the active job.
6. "get_active_record_details": Query deep details about the active record.
7. "create_quote_or_job": Create new quotes/jobs from scratch with client contact info, scope, and pricing.
8. "search_clients": Look up customer contact details and past job history.
9. "search_jobs_and_quotes": Find jobs/quotes by client name, ref, or status.
10. "get_unpaid_invoices_and_payments": Check outstanding amounts owed and overdue invoices.
11. "get_schedule": Look up scheduled work for today, tomorrow, or upcoming windows.
12. "get_business_summary": Provide high-level stats (active jobs, pending quotes, uncollected cash).
13. "navigate_to": Direct the user to specific pages (jobs, schedule, clients, expenses, settings, cash flow, sites, automations, sms).

Guidelines:
- You have full multimodal vision and document processing capabilities.
- When the contractor attaches an image (receipts, supplier invoices, equipment rating plates, site damage, punch list items, sketches) or a document/file (PDF scopes of work, adjuster reports, estimates, spreadsheets, rate sheets), thoroughly inspect both visual and textual contents.
- Extract line items, prices, supplier names, equipment specifications, dimensions, tasks, or customer details, and execute or recommend suitable tools (e.g. "log_job_expense" for receipts/invoices, "add_quote_line_item" for quote items, "add_job_task" for punch lists, or "create_quote_or_job" for new scopes).
- Be concise, professional, friendly, and action-oriented. Contractors want quick execution and direct feedback.
- When creating or modifying quotes or logging expenses, confirm the updated figures (e.g. logged amount, new total costs, updated profit margin %).
- Always execute appropriate tools to retrieve or mutate live workspace database records.`;
}

export async function runAssistantConversation(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    file?: { name: string; data: string; mimeType: string; textContent?: string; previewUrl?: string };
    image?: { data: string; mimeType: string; previewUrl?: string };
    imageUrl?: string;
  }>,
  ctx: AssistantContext,
  toolCtx: ToolExecutionContext,
): Promise<{
  message: AssistantMessage;
  actionCards: ActionCard[];
}> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // Hydrate active record context if available
  const hydratedRecord = await hydrateActiveRecordContext(ctx.currentPath, ctx.activeRecord, toolCtx);
  const enrichedCtx: AssistantContext = {
    ...ctx,
    activeRecord: hydratedRecord,
  };
  const enrichedToolCtx: ToolExecutionContext = {
    ...toolCtx,
    activeRecord: hydratedRecord,
  };

  if (!apiKey) {
    const companion = getCompanion(ctx.companionId, ctx.companionTrade);
    // Fallback if no Gemini key is set: return a helpful configuration response
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I'm ${companion.name}, your contractor AI sidekick! To enable live natural-language and file/photo actions (like analyzing receipts, PDF scopes, creating quotes, and looking up clients), please configure \`GEMINI_API_KEY\` in your \`.env.local\` file.`,
        createdAt: new Date().toISOString(),
      },
      actionCards: [
        {
          type: 'navigation',
          title: `Configure ${companion.name} (AI Assistant)`,
          description: 'Add GEMINI_API_KEY to your environment variables to enable live agentic tools.',
          linkUrl: '/dashboard/settings',
          linkLabel: 'Open Settings',
        },
      ],
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction(enrichedCtx);

  // Format messages into Google GenAI contents format (including multimodal files, PDFs, and images)
  const formattedContents: Content[] = [];

  for (const msg of messages) {
    const parts: Part[] = [];

    if (msg.content && msg.content.trim()) {
      parts.push({ text: msg.content.trim() });
    }

    if (msg.file) {
      if (msg.file.textContent) {
        parts.push({ text: `[Attached Document: ${msg.file.name}]\n${msg.file.textContent}` });
      }

      let base64Clean = msg.file.data;
      let mimeType = msg.file.mimeType || 'application/octet-stream';
      if (base64Clean.includes(';base64,')) {
        const split = base64Clean.split(';base64,');
        mimeType = split[0].replace('data:', '');
        base64Clean = split[1];
      }

      // If mimeType is supported for direct binary / multimodal parsing (images, PDFs, text)
      if (mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('text/')) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Clean,
          },
        });
      }
    }

    if (msg.image) {
      let base64Clean = msg.image.data;
      let mimeType = msg.image.mimeType || 'image/jpeg';
      if (base64Clean.includes(';base64,')) {
        const split = base64Clean.split(';base64,');
        mimeType = split[0].replace('data:', '');
        base64Clean = split[1];
      }
      parts.push({
        inlineData: {
          mimeType,
          data: base64Clean,
        },
      });
    } else if (msg.imageUrl && msg.imageUrl.startsWith('data:image/')) {
      const split = msg.imageUrl.split(';base64,');
      if (split.length === 2) {
        parts.push({
          inlineData: {
            mimeType: split[0].replace('data:', ''),
            data: split[1],
          },
        });
      }
    }

    if (parts.length === 0) {
      parts.push({ text: '...' });
    }

    formattedContents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts,
    });
  }

  const accumulatedActionCards: ActionCard[] = [];
  const executedToolCalls: AssistantToolCall[] = [];

  try {
    // 1st Turn: Call model with tool declarations
    const initialResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: ASSISTANT_TOOLS_DECLARATION }],
        temperature: 0.2,
      },
    });

    const functionCalls = initialResponse.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      // Add the model's tool-call response to conversation history (preserves thoughtSignature and full candidate parts)
      const candidateContent = initialResponse.candidates?.[0]?.content;
      if (candidateContent) {
        formattedContents.push(candidateContent);
      } else {
        formattedContents.push({
          role: 'model',
          parts: functionCalls.map((fc) => ({
            functionCall: {
              name: fc.name,
              args: fc.args,
            },
          })),
        });
      }

      // Execute each tool call
      const functionResponseParts: Part[] = [];
      for (const fc of functionCalls) {
        const toolName = fc.name ?? '';
        if (!toolName) continue;
        const toolArgs = (fc.args ?? {}) as Record<string, unknown>;
        const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        try {
          const result = await executeAssistantTool(toolName, toolArgs, enrichedToolCtx);
          if (result.actionCard) {
            accumulatedActionCards.push(result.actionCard);
          }

          executedToolCalls.push({
            id: callId,
            name: toolName,
            args: toolArgs,
            result: result.data,
            status: 'done',
          });

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { output: result.data },
              ...(fc.id ? { id: fc.id } : {}),
            },
          });
        } catch (err: unknown) {
          const errorMessage = getErrorMessage(err, 'Tool execution failed');
          executedToolCalls.push({
            id: callId,
            name: toolName,
            args: toolArgs,
            result: { error: errorMessage },
            status: 'error',
          });

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { error: errorMessage },
              ...(fc.id ? { id: fc.id } : {}),
            },
          });
        }
      }

      // Add tool results to conversation history
      formattedContents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      // 2nd Turn: Model synthesizes the final conversational response with tool results
      const finalResponse = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const finalReply = finalResponse.text || 'I have completed your request.';

      return {
        message: {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: finalReply,
          toolCalls: executedToolCalls,
          actionCards: accumulatedActionCards,
          createdAt: new Date().toISOString(),
        },
        actionCards: accumulatedActionCards,
      };
    }

    // No tool calls needed, return direct answer
    const directReply = initialResponse.text || "I'm here to help. What would you like to do?";

    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: directReply,
        createdAt: new Date().toISOString(),
      },
      actionCards: [],
    };
  } catch (err: unknown) {
    console.error('AI Assistant Error:', err);
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I encountered an error processing your request: ${getErrorMessage(err, 'Unknown error')}. Please try again.`,
        createdAt: new Date().toISOString(),
      },
      actionCards: [],
    };
  }
}
