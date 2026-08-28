import { NextResponse } from 'next/server';
import { requireDashboardShellContext } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { runAssistantConversation } from '@/lib/ai-assistant/engine';
import type { AssistantContext, AssistantRequestBody } from '@/lib/ai-assistant/types';
import type { ToolExecutionContext } from '@/lib/ai-assistant/tools';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { supabase, userId, accountId, role, capabilities } = await requireDashboardShellContext();

    const body = (await req.json()) as AssistantRequestBody;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json({ ok: false, error: 'Messages array is required' }, { status: 400 });
    }

    const businessName = await loadBusinessName(supabase, accountId);

    const ctx: AssistantContext = {
      userId,
      accountId,
      role,
      businessName,
      currentPath: body.currentPath,
      activeRecord: body.activeRecord,
      capabilities: Array.from(capabilities),
    };

    const toolCtx: ToolExecutionContext = {
      supabase,
      accountId,
      userId,
      role,
      activeRecord: body.activeRecord,
    };

    const result = await runAssistantConversation(messages, ctx, toolCtx);

    return NextResponse.json({
      ok: true,
      message: result.message,
      actionCards: result.actionCards,
    });
  } catch (error) {
    console.error('AI Assistant API route failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 },
    );
  }
}
