import { NextResponse } from 'next/server';
import { requireOfficeContext } from '@/lib/auth';
import { loadVoiceWorkspaceQueue } from '@/lib/voice/call-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Defend against CSV formula injection (Excel/Calc/Sheets command execution)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireOfficeContext('leads.read');

    const url = new URL(request.url);
    const dateRangeParam = (url.searchParams.get('dateRange') as 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month') || 'all';
    const tabParam = (url.searchParams.get('tab') as 'all' | 'unreviewed' | 'needs_callback' | 'urgent' | 'transferred' | 'completed') || 'all';
    const queryParam = url.searchParams.get('q') || undefined;
    const dispositionParam = (url.searchParams.get('disposition') as any) || 'all';
    const outcomeParam = (url.searchParams.get('outcome') as any) || 'all';
    const selectedIdsParam = url.searchParams.get('ids');

    const queue = await loadVoiceWorkspaceQueue(supabase, accountId, {
      dateRange: dateRangeParam,
      tab: tabParam,
      query: queryParam,
      disposition: dispositionParam,
      outcome: outcomeParam,
      limit: 1000,
    });

    let itemsToExport = queue.items || [];
    if (selectedIdsParam) {
      const idSet = new Set(selectedIdsParam.split(',').map((s) => s.trim()));
      itemsToExport = itemsToExport.filter((item) => idSet.has(item.id));
    }

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

    const rows = itemsToExport.map((item) => [
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

    const lines: string[] = [];
    if (queue.items.length >= 1000 && queue.counters.totalCount > 1000) {
      lines.push(`# Warning: Export capped at 1000 rows. Total matching calls in range: ${queue.counters.totalCount}. Refine date or filter criteria to download complete subset.`);
    }
    lines.push(headers.join(','));
    for (const r of rows) {
      lines.push(r.join(','));
    }

    const csvContent = lines.join('\r\n');
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
