import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';
import { createLead, type Lead, type LeadStatus } from '@/lib/leads';
import {
  toPublicLeadDto,
  parseCreateLeadInput,
  type PublicLeadDto,
} from '@/lib/public-api/lead-dto';

export const GET = publicApiRoute(
  async (req, ctx) => {
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '20', 10) || 20));
    const status = searchParams.get('status')?.trim() as LeadStatus | undefined;
    const email = searchParams.get('email')?.trim().toLowerCase();
    const phone = searchParams.get('phone')?.trim();
    const updatedSince = searchParams.get('updated_since')?.trim();
    const cursor = searchParams.get('cursor')?.trim();

    let query = ctx.admin
      .from('leads')
      .select('*')
      .eq('account_id', ctx.accountId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (status && ['new', 'contacted', 'quoted', 'won', 'lost'].includes(status)) {
      query = query.eq('status', status);
    }
    if (email) {
      query = query.eq('email', email);
    }
    if (phone) {
      query = query.eq('phone', phone);
    }
    if (updatedSince) {
      const parsedTime = Date.parse(updatedSince);
      if (Number.isFinite(parsedTime)) {
        query = query.gte('updated_at', new Date(parsedTime).toISOString());
      }
    }

    // Cursor pagination (decodes base64 string of { createdAt, id })
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as {
          createdAt: string;
          id: string;
        };
        if (decoded.createdAt && decoded.id) {
          query = query.or(
            `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`
          );
        }
      } catch {
        // Invalid cursor ignored
      }
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rawRows = (data ?? []) as Lead[];
    const hasMore = rawRows.length > limit;
    const items = hasMore ? rawRows.slice(0, limit) : rawRows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]!;
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: lastItem.created_at, id: lastItem.id })
      ).toString('base64');
    }

    const publicLeads: PublicLeadDto[] = items.map(toPublicLeadDto);

    return NextResponse.json({
      data: publicLeads,
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  },
  { requiredScope: 'leads.read' }
);

export const POST = publicApiRoute(
  async (req, ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: { code: 'invalid_request', message: 'Request body must be valid JSON.' },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const { leadInput, errors } = parseCreateLeadInput(body);
    if (errors && errors.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid_request',
            message: 'Validation failed for lead input.',
            details: errors,
          },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const createdLead = await createLead(ctx.admin, ctx.accountId, leadInput);
    const dto = toPublicLeadDto(createdLead);

    return NextResponse.json(dto, { status: 201 });
  },
  {
    requiredScope: 'leads.write',
    requireIdempotency: true,
  }
);
