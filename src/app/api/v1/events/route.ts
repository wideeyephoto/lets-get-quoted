import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

export const GET = publicApiRoute(
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
    const eventType = searchParams.get('event_type')?.trim();

    let query = ctx.admin
      .from('integration_events')
      .select('id, event_type, aggregate_type, aggregate_id, payload, occurred_at')
      .eq('account_id', ctx.accountId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;
    if (error) throw error;

    const formattedEvents = (data ?? []).map((row) => ({
      id: row.id,
      event: row.event_type,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      occurred_at: new Date(row.occurred_at).toISOString(),
      data: row.payload,
    }));

    return NextResponse.json({
      data: formattedEvents,
    });
  },
  { requiredScope: 'leads.read' }
);
