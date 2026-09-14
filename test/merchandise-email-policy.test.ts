import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchandiseOrder } from '@/lib/merchandise/types';
import { sendCustomerMerchandiseReceipt, sendStaffMerchandiseAlert } from '@/lib/merchandise/merchandise-emails';

const mocks = vi.hoisted(() => ({ send: vi.fn(), from: vi.fn(), eq: vi.fn(), lookup: vi.fn() }));
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: mocks.send } })) }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));
const order: MerchandiseOrder = {
  id: 'order-1', accountId: 'workspace-a', orderNumber: '1001', status: 'paid', items: [],
  subtotal: 10, shippingCost: 0, taxAmount: 0, totalAmount: 10,
  shippingAddress: { fullName: 'Customer', streetAddress: '1 Main St', city: 'Boston', state: 'MA', postalCode: '02101', country: 'US', phone: '5555550100', email: 'customer@example.com' },
  createdAt: '2026-09-14', updatedAt: '2026-09-14',
};
const receipt = () => sendCustomerMerchandiseReceipt({ order, customerEmail: 'CUSTOMER@example.com', customerName: 'Customer', shippingAddress: order.shippingAddress });

describe('merchandise delivery policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test';
    const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq, in: mocks.lookup };
    mocks.from.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.lookup.mockResolvedValue({ data: [], error: null });
    mocks.send.mockResolvedValue({ data: { id: 'accepted' }, error: null });
  });
  it('checks the exact customer in the order workspace and tags the accepted receipt', async () => {
    expect(await receipt()).toBe(true);
    expect(mocks.eq).toHaveBeenCalledWith('account_id', 'workspace-a');
    expect(mocks.lookup).toHaveBeenCalledWith('email', ['customer@example.com']);
    expect(mocks.send.mock.calls[0][0].tags).toContainEqual({ name: 'account_id', value: 'workspace-a' });
  });
  it.each(['hard_bounce', 'complaint', 'provider_suppressed'])('does not submit a receipt with %s', async reason => {
    mocks.lookup.mockResolvedValue({ data: [{ reason }], error: null });
    expect(await receipt()).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('allows a receipt after a marketing opt-out', async () => {
    mocks.lookup.mockResolvedValue({ data: [{ reason: 'one_click_unsubscribe' }], error: null });
    expect(await receipt()).toBe(true);
  });
  it('refuses an unavailable suppression lookup', async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await receipt()).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'rejected' } }, { data: null, error: null }])('does not report provider rejection or missing acceptance as success', async result => {
    mocks.send.mockResolvedValue(result);
    expect(await receipt()).toBe(false);
    expect(await sendStaffMerchandiseAlert({ order })).toBe(false);
  });
  it('keeps platform staff alerts outside the customer workspace scope', async () => {
    expect(await sendStaffMerchandiseAlert({ order })).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls[0][0].tags).toBeUndefined();
  });
});
