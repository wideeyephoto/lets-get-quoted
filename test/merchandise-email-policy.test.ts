import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MerchandiseOrder } from '@/lib/merchandise/types';
import { sendCustomerMerchandiseReceipt, sendStaffMerchandiseAlert } from '@/lib/merchandise/merchandise-emails';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));

const order: MerchandiseOrder = {
  id: 'order-1', accountId: 'workspace-a', orderNumber: '1001', status: 'paid', items: [],
  subtotal: 10, shippingCost: 0, taxAmount: 0, totalAmount: 10,
  shippingAddress: { fullName: 'Customer', streetAddress: '1 Main St', city: 'Boston', state: 'MA', postalCode: '02101', country: 'US', phone: '5555550100', email: 'customer@example.com' },
  createdAt: '2026-09-14', updatedAt: '2026-09-14',
};

const receipt = () => sendCustomerMerchandiseReceipt({ order, customerEmail: 'CUSTOMER@example.com', customerName: 'Customer', shippingAddress: order.shippingAddress });

describe('merchandise delivery policy (now via durable events)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test';
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('queues a merchandise_receipt event into platform_event_notices for the customer', async () => {
    expect(await receipt()).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('platform_event_notices');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'workspace-a',
      event_family: 'merchandise_receipt',
      source_id: 'order-1',
    }));
  });

  it('queues a merchandise_alert event into platform_event_notices for staff', async () => {
    expect(await sendStaffMerchandiseAlert({ order })).toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('platform_event_notices');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'workspace-a',
      event_family: 'merchandise_alert',
      source_id: 'order-1-alert',
    }));
  });

  it('returns false if insertion fails', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'db error' } });
    expect(await receipt()).toBe(false);
    expect(await sendStaffMerchandiseAlert({ order })).toBe(false);
  });
});
