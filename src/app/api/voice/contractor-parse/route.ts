import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getLead } from '@/lib/leads';
import { getJob, parseQuoteItems } from '@/lib/jobs';
import { parseContractorVoicePrompt, type ContractorVoiceContext } from '@/lib/contractor-voice-ai';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await getCurrentMembership(user.id);
  const accountId = membership.accountId;
  if (!accountId) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) {
    return NextResponse.json({ error: 'Voice transcript is required' }, { status: 400 });
  }

  const targetType = (typeof body.targetType === 'string' && ['lead', 'job', 'auto'].includes(body.targetType))
    ? (body.targetType as 'lead' | 'job' | 'auto')
    : 'auto';

  const targetId = typeof body.targetId === 'string' && UUID.test(body.targetId) ? body.targetId : null;

  const context: ContractorVoiceContext = {
    accountId,
    targetType,
  };

  // If a specific lead ID was passed, load existing lead for delta awareness
  if (targetType === 'lead' && targetId) {
    try {
      const lead = await getLead(supabase, accountId, targetId);
      if (lead) {
        context.existingLead = {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
          projectType: lead.project_type,
          message: lead.message,
          status: lead.status,
        };
      }
    } catch {
      // Non-blocking fallback if lead lookup fails
    }
  }

  // If a specific job ID was passed, load existing job for delta awareness
  if (targetType === 'job' && targetId) {
    try {
      const job = await getJob(supabase, accountId, targetId);
      if (job) {
        context.existingJob = {
          id: job.id,
          ref: job.ref,
          clientName: job.client_name,
          address: job.address,
          scope: job.scope,
          status: job.status,
          scheduledFor: job.scheduled_for,
          scheduledTime: job.scheduled_time,
          quoteItems: parseQuoteItems(job.quote_items),
        };
      }
    } catch {
      // Non-blocking fallback if job lookup fails
    }
  }

  try {
    const result = await parseContractorVoicePrompt(transcript, context);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('Contractor voice AI parse failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not parse voice note.' },
      { status: 500 },
    );
  }
}
