import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCardQuoteAction, saveCardProofAction, createCardCheckoutSessionAction } from '@/app/dashboard/merchandise/actions';
import type { ShippingAddress } from '@/lib/merchandise/types';
import type { CardDesignDocument } from '@/lib/merchandise/card-renderer';
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
const f = vi.hoisted(() => ({ row: null as any, insertError: null as any, claimError: null as any, saveError: null as any, sessionId: null as string | null, approved: true, inserts: [] as any[], rpc: vi.fn(), remove: vi.fn(), createSession: vi.fn(), retrieveSession: vi.fn(), createCustomer: vi.fn(), storage: vi.fn(), auth: vi.fn() }));
const admin = { storage: { from: () => ({ remove: f.remove }) }, rpc: f.rpc, from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'merchandise_order_quotes' ? f.row : { id: 'proof', is_approved: f.approved, preflight_passed: true }, error: null }),
    insert: async (row: any) => { f.inserts.push({ table, row }); if (table === 'merchandise_order_quotes') f.row = row; return { error: f.insertError }; } }; return q;
} };
vi.mock('@/lib/auth', () => ({ requireOfficeContext: (...args: any[]) => f.auth(...args), createAdminClient: () => admin }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ customers: { create: f.createCustomer }, checkout: { sessions: { create: f.createSession, retrieve: f.retrieveSession } } }), toCents: (n: number) => Math.round(n*100) }));
vi.mock('@/lib/merchandise/printful-client', () => ({ calculatePrintfulShippingRates: vi.fn().mockResolvedValue({ ok: true, rates: [{ id: 'STANDARD', currency: 'USD', rate: 9.75 }] }) }));
vi.mock('@/lib/merchandise/card-proof-storage', () => ({ CARD_ARTWORK_BUCKET: 'merchandise-artwork', storeCardArtwork: (...args: any[]) => f.storage(...args) }));
const address: ShippingAddress = { fullName: 'Alice Example', companyName: 'Example Plumbing', streetAddress: '100 Main Street', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US', phone: '5125550100', email: 'alice@example.com' };
const document: CardDesignDocument = { version: 1, templateId: 'clean', content: { businessName: 'Example Plumbing', phone: '5125550100' }, colors: { accentColor: '#0284c7' }, qr: { destinationUrl: 'https://example.com/quote' } };
beforeEach(() => {
  vi.clearAllMocks(); f.row = null; f.insertError = null; f.claimError = null; f.saveError = null; f.sessionId = null; f.approved = true; f.inserts = [];
  f.auth.mockResolvedValue({ accountId: 'account', userId: 'approver' });
  f.storage.mockResolvedValue({ front: { key: 'front.png', hash: 'front' }, back: { key: 'back.png', hash: 'back' } });
  f.createCustomer.mockResolvedValue({ id: 'cus_card' });
  f.createSession.mockResolvedValue({ id: 'cs_card', url: 'https://checkout.stripe.com/c/pay/card' });
  f.retrieveSession.mockResolvedValue({ id: 'cs_card', status: 'open', url: 'https://checkout.stripe.com/c/pay/card' });
  f.rpc.mockImplementation(async name => name === 'claim_card_checkout' ? { data: f.claimError ? null : { order_id: 'order', operation_key: 'operation', session_id: f.sessionId }, error: f.claimError } : { data: !f.saveError, error: f.saveError });
});
async function quote() { const r = await createCardQuoteAction({ proofId: 'proof', cardCount: 100, shippingAddress: address }); if (!r.ok || !r.quote) throw new Error(r.error); return r.quote; }
async function checkout(saved: Awaited<ReturnType<typeof quote>>, shippingAddress = address) { return createCardCheckoutSessionAction({ quote: saved, proofId: 'proof', approvalHash: 'approved', shippingAddress }); }
describe('Server card quotes and checkout', () => {
  it('persists a UUID quote with provider shipping', async () => { const saved = await quote(); expect(saved.id).toMatch(/^[a-f0-9-]{36}$/); expect(saved.shippingCostCents).toBe(975); expect(f.row.selected_shipping_rate_id).toBe('STANDARD'); });
  it('rejects invalid quantities, delivery, and unapproved proofs', async () => {
    expect((await createCardQuoteAction({ proofId: 'proof', cardCount: 7, shippingAddress: address })).ok).toBe(false);
    expect((await createCardQuoteAction({ proofId: 'proof', cardCount: 100, shippingAddress: { ...address, postalCode: '' } })).ok).toBe(false);
    f.approved = false; expect((await createCardQuoteAction({ proofId: 'proof', cardCount: 100, shippingAddress: address })).ok).toBe(false); expect(f.inserts).toHaveLength(0);
  });
  it('fails when quote or proof persistence fails and cleans up artwork', async () => {
    f.insertError = { message: 'DB unavailable' }; expect((await createCardQuoteAction({ proofId: 'proof', cardCount: 100, shippingAddress: address })).ok).toBe(false);
    expect((await saveCardProofAction({ document })).ok).toBe(false); expect(f.remove).toHaveBeenCalledWith(['front.png', 'back.png']);
  });
  it('saves canonical artwork and the approving user', async () => {
    const r = await saveCardProofAction({ document, frontSvg: '<svg>tampered</svg>' }); expect(r.ok).toBe(true); expect(r.proofId).toMatch(/^[a-f0-9-]{36}$/);
    expect(f.storage.mock.calls[0][3]).not.toContain('tampered'); expect(f.inserts.find(x => x.table === 'merchandise_card_proofs').row.approved_by_user_id).toBe('approver');
  });
  it('ignores browser prices and fixes the tax delivery address', async () => {
    const saved = await quote(); expect((await checkout({ ...saved, subtotalCents: 1, totalCents: 1 })).ok).toBe(true);
    expect(f.createSession.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(saved.subtotalCents);
    expect(f.createCustomer.mock.calls[0][0].shipping.address).toMatchObject({ line1: address.streetAddress, postal_code: address.postalCode });
    expect(f.createSession.mock.calls[0][1]).toEqual({ idempotencyKey: `card-checkout:${saved.id}` });
  });
  it('rejects changed delivery, invalid expiry and unsaved quotes', async () => {
    const saved = await quote(); expect((await checkout(saved, { ...address, postalCode: '90210' })).ok).toBe(false);
    f.row.expires_at = 'invalid'; expect((await checkout(saved)).ok).toBe(false); f.row = null; expect((await checkout(saved)).ok).toBe(false); expect(f.createSession).not.toHaveBeenCalled();
  });
  it('reuses a real provider URL for duplicate requests', async () => {
    const saved = await quote(); f.sessionId = 'cs_card'; expect((await checkout(saved)).checkoutUrl).toBe('https://checkout.stripe.com/c/pay/card'); expect(f.retrieveSession).toHaveBeenCalledWith('cs_card'); expect(f.createSession).not.toHaveBeenCalled();
  });
  it('does not expose a session when its durable link fails', async () => { const saved = await quote(); f.saveError = { message: 'write failed' }; const r = await checkout(saved); expect(r.ok).toBe(false); expect(r.checkoutUrl).toBeUndefined(); });
  it('stops at authorization and occupied leases', async () => {
    f.auth.mockRejectedValueOnce(new Error('Not authorized')); expect((await saveCardProofAction({ document })).ok).toBe(false);
    const saved = await quote(); f.claimError = { message: 'Checkout is being prepared' }; expect((await checkout(saved)).ok).toBe(false); expect(f.createSession).not.toHaveBeenCalled();
  });
});
