import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { runVoiceQualityAudit } from '@/lib/ai-operator/voice-auditor';
import { flushOperatorWrites } from '@/lib/ai-operator/audit';

// This endpoint runs on a schedule (e.g. hourly) via Vercel Cron or Cloud Scheduler
export async function GET(request: Request) {
  // Simple auth to ensure only our cron runner can invoke this
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const result = await runVoiceQualityAudit(supabase);
    await flushOperatorWrites();
    
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Voice quality audit cron failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
