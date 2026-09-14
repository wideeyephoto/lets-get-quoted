import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processInboundSupportTicket } from '@/lib/ai-operator/support-auto-responder';

const mocks = vi.hoisted(() => ({ audit: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/ai-operator/audit', () => ({ recordOperatorAudit: mocks.audit }));
vi.mock('@/lib/ai-operator/support-copilot', () => ({ triageSupportCase: async () => ({
  identifiedTopic: 'features', urgency: 'normal', requiresFounderReview: false,
  suggestedCustomerReply: 'Here is how the feature works.',
}) }));
const ticket = { id: 'case-1', account_id: 'workspace-1', customer_email: 'Owner@example.com',
  subject: 'How does this feature work?', body: 'Please explain how this feature works for my business.' };
function database(reason: string | null = null, lookupError = false, resolution: unknown = { data: { id: ticket.id }, error: null }) {
  const update = vi.fn();
  const lookup = vi.fn().mockResolvedValue({ data: reason ? { email: 'owner@example.com', reason } : null,
    error: lookupError ? { message: 'unavailable' } : null });
  const from = vi.fn((table: string) => {
    if (table === 'platform_email_suppression') return { select: () => ({ eq: (key: string, value: string) => {
      expect([key, value]).toEqual(['email', 'owner@example.com']);
      return { maybeSingle: lookup };
    } }) };
    expect(table).toBe('support_cases');
    return { update: (values: unknown) => {
      update(values);
      return { eq: () => ({ select: () => ({ maybeSingle: async () => { if (resolution instanceof Error) throw resolution; return resolution; } }),
        then: (resolve: (value: unknown) => void) => resolve({ error: null }) }) };
    } };
  });
  return { client: { from } as unknown as SupabaseClient, update, lookup };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'synthetic'); vi.stubGlobal('fetch', mocks.fetch);
  mocks.fetch.mockResolvedValue(Response.json({ id: 'accepted-1' }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('support auto-reply submission and resolution', () => {
  it.each(['hard_bounce', 'complaint', 'provider_suppressed'])('keeps %s recipients open for staff', async reason => {
    const db = database(reason);
    const result = await processInboundSupportTicket(db.client, ticket);
    expect(result).toMatchObject({ autoResolved: false, replyDispatched: false, eligibleForAutoReply: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ suggested_reply: expect.any(String) }));
    expect(db.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }));
  });
  it.each(['unsubscribe_link', 'one_click_unsubscribe', null])('permits transactional reply with %s and records actual resolution', async reason => {
    const db = database(reason);
    const result = await processInboundSupportTicket(db.client, ticket);
    expect(result).toMatchObject({ autoResolved: true, replyDispatched: true });
    const request = mocks.fetch.mock.calls[0][1];
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.redirect).toBe('error');
    expect(JSON.parse(request.body).tags).toEqual([
      { name: 'kind', value: 'support_auto_reply' }, { name: 'delivery_scope', value: 'platform_transactional' },
    ]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });
  it.each(['lookup', 'missing-key', 'missing-recipient', 'http', 'missing-id', 'bad-json', 'timeout'])('does not resolve after %s', async failure => {
    const db = database(null, failure === 'lookup');
    if (failure === 'missing-key') vi.stubEnv('RESEND_API_KEY', '');
    if (failure === 'http') mocks.fetch.mockResolvedValue(Response.json({ id: 'not-acceptance' }, { status: 429 }));
    if (failure === 'missing-id') mocks.fetch.mockResolvedValue(Response.json({}));
    if (failure === 'bad-json') mocks.fetch.mockResolvedValue(new Response('invalid'));
    if (failure === 'timeout') mocks.fetch.mockRejectedValue(new Error('timeout'));
    const result = await processInboundSupportTicket(db.client, { ...ticket, customer_email: failure === 'missing-recipient' ? null : ticket.customer_email });
    expect(result).toMatchObject({ autoResolved: false, replyDispatched: false });
    expect(db.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }));
    expect(mocks.audit).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(mocks.fetch.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it.each([{ data: null, error: { message: 'database unavailable' } }, { data: null, error: null }, new Error('connection lost')])('retains acceptance when resolution fails or matches no ticket', async resolution => {
    const db = database(null, false, resolution);
    const result = await processInboundSupportTicket(db.client, ticket);
    expect(result).toMatchObject({ autoResolved: false, replyDispatched: true, replyProviderId: 'accepted-1' });
    expect(result.reason).toContain('Do not resend');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
  });
  it('dry run reports eligibility without reads, writes, email or success audit', async () => {
    const db = database();
    const result = await processInboundSupportTicket(db.client, ticket, { dryRun: true });
    expect(result).toMatchObject({ eligibleForAutoReply: true, autoResolved: false, replyDispatched: false });
    expect(db.lookup).not.toHaveBeenCalled(); expect(db.update).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
});
