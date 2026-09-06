import { GoogleGenAI, type Content, type Part } from '@google/genai';
import { CREW_TOOLS_DECLARATION, executeCrewTool, type CrewToolExecutionContext } from './crew-tools';
import type { AssistantMessage, AssistantMessageFile, AssistantMessageImage, AssistantToolCall } from './types';
import { getCompanion, type CompanionId } from './companions';

export interface CrewAssistantContext {
  userId: string;
  accountId: string;
  businessName: string;
  crewName: string;
  crewRole?: string | null;
  companionId?: CompanionId;
  activeJobId?: string;
  activeJobRef?: string;
}

export interface CrewAssistantRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    file?: AssistantMessageFile;
    image?: AssistantMessageImage;
    imageUrl?: string;
  }>;
  activeJobId?: string;
  activeJobRef?: string;
  companionId?: CompanionId;
  file?: AssistantMessageFile;
  image?: AssistantMessageImage;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function buildCrewSystemInstruction(ctx: CrewAssistantContext): string {
  const today = new Date().toISOString().slice(0, 10);
  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const companion = getCompanion(ctx.companionId || 'sparky');

  let activeJobPrompt = '';
  if (ctx.activeJobId || ctx.activeJobRef) {
    activeJobPrompt = `\n- CURRENTLY VIEWED JOB: ID ${ctx.activeJobId || 'unknown'}${ctx.activeJobRef ? ` (Ref: #${ctx.activeJobRef})` : ''}. When the user asks "this job", "current job", or asks about lockbox/tasks without specifying a job, use this ID.`;
  }

  return `You are ${companion.name}, an AI field copilot for mobile crew members working for "${ctx.businessName}".
Your role is: ${companion.role}.
Persona & Tone: Friendly, energetic, direct, and supportive like a trusted jobsite sidekick. Talk like a capable teammate on site or in the work truck. Keep answers punchy, concise, and quick to read on a mobile phone in direct sunlight. Use emojis sparingly for quick visual scanning (e.g. 📍 for addresses, 🔑 for gate/lockbox codes, ⏱️ for time, ✅ for tasks).

Crew Member: ${ctx.crewName || 'Crew Member'}${ctx.crewRole ? ` (${ctx.crewRole})` : ''}
Current Date: ${today}
Current Time: ${currentTime}${activeJobPrompt}

CORE CAPABILITIES & TOOLS:
1. Schedule & Route: Look up assigned jobs for today, tomorrow, or upcoming using \`get_my_route_and_schedule\`.
2. Jobsite Access & Details: Look up site address, navigation directions, customer phone, gate/lockbox codes, parking notes, and scope using \`get_job_access_and_details\`.
3. Time Clock & Hours: Check clock-in status, current shift duration, and total hours worked using \`get_timecard_and_hours\`.
4. Clock In / Out: Execute quick clock-in to assigned jobs or clock-out when finishing a shift using \`clock_in_or_out\`.
5. Notes & Checklist: Record field notes, site updates, gate codes, or add punch list checklist items using \`add_job_note_or_task\`.

STRICT BOUNDARIES & SAFETY RULES:
- PRIVACY & SECURITY: You are operating in the field crew environment. You MUST NOT disclose business finances, profit margins, job quotes/pricing, customer billing totals, company invoices, or other workers' wages. If asked about quotes, margins, or owner billing, politely clarify that billing and financial margins are managed by the office/owner.
- ONLY ASSIGNED JOBS: The crew member can only see and interact with jobs dispatched or assigned to them.
- MOBILE FRIENDLINESS: The tech is likely holding a phone on a ladder or in a van. Do NOT write walls of text. Be direct, structured, bulleted, and give them the key info (address, gate code, checklist, next step) immediately.`;
}

export async function runCrewAssistantConversation(
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    file?: AssistantMessageFile;
    image?: AssistantMessageImage;
    imageUrl?: string;
  }>,
  ctx: CrewAssistantContext,
  toolCtx: CrewToolExecutionContext,
): Promise<{
  message: AssistantMessage;
}> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const companion = getCompanion(ctx.companionId || 'sparky');

  if (!apiKey) {
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Hey ${ctx.crewName || 'there'}! I'm ${companion.name}, your field copilot. The AI engine is currently in setup mode. Once your team configures the AI key, I'll be able to pull your route, gate codes, and log your notes right here!`,
        createdAt: new Date().toISOString(),
      },
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildCrewSystemInstruction(ctx);

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

  const executedToolCalls: AssistantToolCall[] = [];

  try {
    const initialResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: CREW_TOOLS_DECLARATION }],
        temperature: 0.2,
      },
    });

    const functionCalls = initialResponse.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
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

      const functionResponseParts: Part[] = [];
      for (const fc of functionCalls) {
        const toolName = fc.name ?? '';
        if (!toolName) continue;
        const toolArgs = (fc.args ?? {}) as Record<string, unknown>;
        const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        try {
          const result = await executeCrewTool(toolName, toolArgs, toolCtx);
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

      formattedContents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      const finalResponse = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: formattedContents,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const finalReply = finalResponse.text || 'Got it done for you.';

      return {
        message: {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: finalReply,
          toolCalls: executedToolCalls,
          createdAt: new Date().toISOString(),
        },
      };
    }

    const directReply = initialResponse.text || "Hey! I'm on standby. How can I help on the job today?";

    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: directReply,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    console.error('Crew AI Assistant Error:', err);
    return {
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `I ran into an issue processing that: ${getErrorMessage(err, 'Unknown error')}. Please try again.`,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
