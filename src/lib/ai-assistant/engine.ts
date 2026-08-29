import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { getJob, parseQuoteItems } from '@/lib/jobs';
import { listJobTasks } from '@/lib/job-tasks';
import { ASSISTANT_TOOLS_DECLARATION, executeAssistantTool, type ToolExecutionContext } from './tools';
import type { ActionCard, ActiveRecordContext, AssistantContext, AssistantMessage, AssistantToolCall } from './types';

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
      const [job, tasks] = await Promise.all([
        getJob(supabase, accountId, jobId),
        listJobTasks(supabase, accountId, jobId),
      ]);

      if (job) {
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

  return `You are Sparky (⚡), the witty, sharp, and highly capable in-app AI contractor sidekick for the contractor platform "Let's Get Quoted".
You are assisting an authenticated contractor / business operator inside their live dashboard.
Introduce yourself as Sparky if asked.

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
3. "add_job_task": Add punch list / checklist tasks to the active job.
4. "get_active_record_details": Query deep details about the active record.
5. "create_quote_or_job": Create new quotes/jobs from scratch with client contact info, scope, and pricing.
6. "search_clients": Look up customer contact details and past job history.
7. "search_jobs_and_quotes": Find jobs/quotes by client name, ref, or status.
8. "get_unpaid_invoices_and_payments": Check outstanding amounts owed and overdue invoices.
9. "get_schedule": Look up scheduled work for today, tomorrow, or upcoming windows.
10. "get_business_summary": Provide high-level stats (active jobs, pending quotes, uncollected cash).
11. "navigate_to": Direct the user to specific pages (jobs, schedule, clients, settings, cash flow, sites, automations, sms).

Guidelines:
- Be concise, professional, friendly, and action-oriented. Contractors want quick execution and direct feedback.
- When creating or modifying quotes, confirm the updated figures (e.g. new total price, newly added item, updated date).
- Always execute appropriate tools to retrieve or mutate live workspace database records.`;
}

export async function runAssistantConversation(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
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
    // Fallback if no Gemini key is set: return a helpful configuration response
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I'm Sparky, your contractor AI sidekick! To enable live natural-language actions (like creating quotes, checking unpaid invoices, and looking up clients), please configure \`GEMINI_API_KEY\` in your \`.env.local\` file.`,
        createdAt: new Date().toISOString(),
      },
      actionCards: [
        {
          type: 'navigation',
          title: 'Configure Sparky (AI Assistant)',
          description: 'Add GEMINI_API_KEY to your environment variables to enable live agentic tools.',
          linkUrl: '/dashboard/settings',
          linkLabel: 'Open Settings',
        },
      ],
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction(enrichedCtx);

  // Format messages into Google GenAI contents format
  const formattedContents: Content[] = [];

  for (const msg of messages) {
    formattedContents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
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
