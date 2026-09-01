import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

export const GET = publicApiRoute(
  async (req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Subscription ID is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));

    const { data: deliveries, error } = await ctx.admin
      .from('webhook_deliveries')
      .select('id, event_id, status, attempt_count, max_attempts, next_attempt_at, delivered_at, last_error, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .eq('subscription_id', id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      data: (deliveries ?? []).map((row) => ({
        id: row.id,
        event_id: row.event_id,
        status: row.status,
        attempt_count: row.attempt_count,
        max_attempts: row.max_attempts,
        next_attempt_at: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : null,
        delivered_at: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
        last_error: row.last_error,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: new Date(row.updated_at).toISOString(),
      })),
    });
  },
  { requiredScope: 'webhooks.manage' }
);
