import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';

export const GET = publicApiRoute(async (_req, ctx) => {
  const { data: account, error } = await ctx.admin
    .from('accounts')
    .select('id, business_name, created_at')
    .eq('id', ctx.accountId)
    .single();

  if (error || !account) {
    return NextResponse.json(
      {
        error: { code: 'not_found', message: 'Associated workspace account not found.' },
        request_id: ctx.requestId,
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    workspace_id: account.id,
    business_name: account.business_name || 'Let\'s Get Quoted Workspace',
    token_name: ctx.tokenName,
    token_id: ctx.credentialId,
    scopes: Array.from(ctx.scopes),
    created_at: account.created_at,
  });
});
