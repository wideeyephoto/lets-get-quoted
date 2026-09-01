import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeAngiLead,
  verifyAngiSignature,
  normalizeThumbtackLead,
  verifyThumbtackSignature,
  normalizeGenericMarketplaceLead,
} from '@/lib/marketplace-router/marketplace-adapters';
import { routeMarketplaceLead } from '@/lib/marketplace-router/routing-engine';
import type { MarketplaceInboundLead } from '@/lib/marketplace-router/types';

export const runtime = 'nodejs';

type RouteProps = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: NextRequest, { params }: RouteProps) {
  const { provider: rawProvider } = await params;
  const provider = (rawProvider || '').toLowerCase().trim();

  let rawBodyText = '';
  try {
    rawBodyText = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const url = new URL(request.url);
  const explicitAccountId = url.searchParams.get('accountId') || request.headers.get('x-account-id');
  const signatureHeader =
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('x-angi-signature') ||
    request.headers.get('x-thumbtack-signature') ||
    request.headers.get('x-signature');
  const tokenHeader = request.headers.get('authorization') || request.headers.get('x-api-key') || request.headers.get('x-token');

  let inboundLead: MarketplaceInboundLead;

  // 1. Provider-Specific Parsing & Signature Validation
  if (provider === 'angi' || provider === 'homeadvisor') {
    const isVerified = verifyAngiSignature({
      rawBody: rawBodyText,
      signatureHeader,
      tokenHeader,
    });

    if (process.env.ANGI_WEBHOOK_SECRET && !isVerified) {
      return NextResponse.json({ error: 'Unauthorized Angi webhook signature' }, { status: 401 });
    }

    inboundLead = normalizeAngiLead(body, isVerified);
  } else if (provider === 'thumbtack') {
    const isVerified = verifyThumbtackSignature({
      rawBody: rawBodyText,
      signatureHeader,
      tokenHeader,
    });

    if (process.env.THUMBTACK_WEBHOOK_SECRET && !isVerified) {
      return NextResponse.json({ error: 'Unauthorized Thumbtack webhook signature' }, { status: 401 });
    }

    inboundLead = normalizeThumbtackLead(body, isVerified);
  } else if (provider === 'nextdoor') {
    inboundLead = normalizeGenericMarketplaceLead(body, 'nextdoor', true);
  } else {
    // Generic / Custom Marketplace
    inboundLead = normalizeGenericMarketplaceLead(body, 'marketplace_custom', true);
  }

  // 2. Route Through Marketplace Routing Engine
  const result = await routeMarketplaceLead(inboundLead, {
    explicitAccountId,
  });

  const statusCode = result.success ? (result.disposition === 'duplicate' ? 200 : 201) : 400;

  return NextResponse.json(
    {
      ok: result.success,
      disposition: result.disposition,
      leadId: result.leadId,
      accountId: result.accountId,
      speedToLeadDispatched: result.speedToLeadDispatched,
      message: result.message,
      ...(result.error ? { error: result.error } : {}),
    },
    { status: statusCode }
  );
}
