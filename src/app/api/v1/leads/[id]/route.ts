import { NextResponse } from 'next/server';
import { publicApiRoute } from '@/lib/public-api/api-wrapper';
import { getLead, getLeadTriage, type Lead } from '@/lib/leads';
import {
  toPublicLeadDto,
  parseUpdateLeadInput,
} from '@/lib/public-api/lead-dto';

export const GET = publicApiRoute(
  async (_req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Lead ID parameter is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const lead = await getLead(ctx.admin, ctx.accountId, id);
    if (!lead) {
      return NextResponse.json(
        { error: { code: 'not_found', message: `Lead with ID '${id}' was not found.` }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    return NextResponse.json(toPublicLeadDto(lead));
  },
  { requiredScope: 'leads.read' }
);

export const PATCH = publicApiRoute(
  async (req, ctx, routeSegment) => {
    const { id } = (await routeSegment?.params) ?? {};
    if (!id) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Lead ID parameter is required.' }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    const existingLead = await getLead(ctx.admin, ctx.accountId, id);
    if (!existingLead) {
      return NextResponse.json(
        { error: { code: 'not_found', message: `Lead with ID '${id}' was not found.` }, request_id: ctx.requestId },
        { status: 404 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: 'Request body must be valid JSON.' }, request_id: ctx.requestId },
        { status: 400 }
      );
    }

    const { patch, errors } = parseUpdateLeadInput(body);
    if (errors && errors.length > 0) {
      return NextResponse.json(
        {
          error: { code: 'invalid_request', message: 'Validation failed for update.', details: errors },
          request_id: ctx.requestId,
        },
        { status: 400 }
      );
    }

    const existingTriage = getLeadTriage(existingLead);
    const updatedTriage = patch.triage
      ? { ...existingTriage, ...patch.triage }
      : existingTriage;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.phone !== undefined) updatePayload.phone = patch.phone;
    if (patch.email !== undefined) updatePayload.email = patch.email;
    if (patch.address !== undefined) updatePayload.address = patch.address;
    if (patch.projectType !== undefined) updatePayload.project_type = patch.projectType;
    if (patch.message !== undefined) updatePayload.message = patch.message;
    if (patch.estimatedHours !== undefined) updatePayload.estimated_hours = patch.estimatedHours;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.triage !== undefined) updatePayload.triage = updatedTriage;

    const { data: updatedLead, error: updateError } = await ctx.admin
      .from('leads')
      .update(updatePayload)
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updatedLead) {
      throw updateError ?? new Error('Failed to update lead');
    }

    return NextResponse.json(toPublicLeadDto(updatedLead as Lead));
  },
  { requiredScope: 'leads.write' }
);
