import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

export const GET = publicApiRoute(
  async (_req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Subscription ID is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const { data: sub, error } = await ctx.admin
      .from('webhook_subscriptions')
      .select('id, target_url, event_types, secret_preview, status, disabled_reason, consecutive_failures, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .maybeSingle();

    if (error || !sub) {
      return NextResponse.json(
        { error: { code: 'not_found', message: `Webhook subscription '${id}' not found.` }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: sub.id,
      target_url: sub.target_url,
      event_types: sub.event_types,
      secret_preview: sub.secret_preview,
      status: sub.status,
      disabled_reason: sub.disabled_reason,
      consecutive_failures: sub.consecutive_failures,
      created_at: new Date(sub.created_at).toISOString(),
      updated_at: new Date(sub.updated_at).toISOString(),
    });
  },
  { requiredScope: 'webhooks.manage' }
);

export const DELETE = publicApiRoute(
  async (_req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Subscription ID is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const { error } = await ctx.admin
      .from('webhook_subscriptions')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  },
  { requiredScope: 'webhooks.manage' }
);
