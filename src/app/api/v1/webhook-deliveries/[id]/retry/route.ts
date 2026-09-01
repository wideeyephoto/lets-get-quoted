import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

export const POST = publicApiRoute(
  async (_req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Delivery ID is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const { data: success, error } = await ctx.admin.rpc('retry_webhook_delivery', {
      p_delivery_id: id,
      p_account_id: ctx.accountId,
    });

    if (error || success !== true) {
      return NextResponse.json(
        {
          error: {
            code: 'not_found',
            message: `Delivery '${id}' could not be requeued (it may not exist, belong to another account, or is not in a retryable state).`,
          },
          request_id: ctx.requestId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      delivery_id: id,
      status: 'pending',
    });
  },
  { requiredScope: 'webhooks.manage' }
);
