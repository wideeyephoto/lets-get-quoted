import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { loadVoiceWorkspaceQueue } from '@/lib/voice/call-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.read');

    const url = new URL(request.url);
    const dateRangeParam = url.searchParams.get('dateRange') as 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | null;

    const queue = await loadVoiceWorkspaceQueue(supabase, accountId, {
      dateRange: dateRangeParam || 'all',
    });

    const headers = [
      'Call ID',
      'Started At',
      'Caller Phone',
      'Duration (sec)',
      'Billed (min)',
      'Outcome',
      'Disposition',
      'Urgency',
      'Lead ID',
      'Summary',
    ];

    const rows = (queue.items || []).map((item) => [
      escapeCsvCell(item.id),
      escapeCsvCell(item.startedAt),
      escapeCsvCell(item.callerNumber),
      escapeCsvCell(item.aiSeconds),
      escapeCsvCell(item.billedMinutes),
      escapeCsvCell(item.outcome),
      escapeCsvCell(item.workflow.disposition),
      escapeCsvCell(item.workflow.urgency),
      escapeCsvCell(item.leadId),
      escapeCsvCell(item.summary),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const filename = `voice_calls_export_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Voice export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
