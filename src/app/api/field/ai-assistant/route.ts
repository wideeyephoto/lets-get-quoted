import { NextResponse } from 'next/server';
import { loadCrewContext } from '@/lib/crew-auth';
import { runCrewAssistantConversation, type CrewAssistantContext, type CrewAssistantRequestBody } from '@/lib/ai-assistant/crew-engine';
import type { CrewToolExecutionContext } from '@/lib/ai-assistant/crew-tools';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const crewCtxResult = await loadCrewContext();
    if (!crewCtxResult.ok) {
      return NextResponse.json(
        { ok: false, error: crewCtxResult.reason },
        { status: 401 },
      );
    }

    const { supabase, userId, accountId, crew, businessName } = crewCtxResult.context;

    const body = (await req.json()) as CrewAssistantRequestBody;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json({ ok: false, error: 'Messages array is required' }, { status: 400 });
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      if (!lastMsg.file && body?.file) lastMsg.file = body.file;
      if (!lastMsg.image && body?.image) lastMsg.image = body.image;
    }

    const ctx: CrewAssistantContext = {
      userId,
      accountId,
      businessName,
      crewName: crew.name,
      crewRole: crew.role_label,
      companionId: body.companionId || 'sparky',
      activeJobId: body.activeJobId,
      activeJobRef: body.activeJobRef,
    };


    const toolCtx: CrewToolExecutionContext = {
      supabase,
      accountId,
      crew,
      businessName,
      activeJobId: body.activeJobId,
    };

    const result = await runCrewAssistantConversation(messages, ctx, toolCtx);

    return NextResponse.json({
      ok: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Crew AI Assistant API error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
