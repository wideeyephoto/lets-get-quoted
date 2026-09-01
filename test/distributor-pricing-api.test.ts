import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { GET as getProcurement, POST as postProcurement } from '../src/app/api/supplies/procurement/route';
import { GET as getPOById, PATCH as patchPOById } from '../src/app/api/supplies/procurement/[poId]/route';
import { POST as postPricing } from '../src/app/api/supplies/pricing/route';

describe('Supplies Procurement & Pricing API Routes', () => {
  const mockAccountId = 'acc-supplies-test-111';
  const mockUserId = 'usr-supplies-test-222';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read', 'jobs.write']));
  });

  describe('GET /api/supplies/procurement', () => {
    it('returns catalog items when type=catalog with trade filter', async () => {
      const request = new Request('http://localhost:3000/api/supplies/procurement?type=catalog&trade=roofing');
      const response = await getProcurement(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.itemsCount).toBeGreaterThan(0);
      expect(json.catalog.every((item: any) => item.trade === 'roofing')).toBe(true);
    });

    it('returns filtered catalog items when search query is passed', async () => {
      const request = new Request('http://localhost:3000/api/supplies/procurement?type=catalog&q=timberline');
      const response = await getProcurement(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.catalog.some((item: any) => item.sku.includes('GAF-HDZ'))).toBe(true);
    });

    it('returns list of purchase orders for active account', async () => {
      const request = new Request('http://localhost:3000/api/supplies/procurement');
      const response = await getProcurement(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.orders)).toBe(true);
    });
  });

  describe('POST /api/supplies/procurement', () => {
    it('validates required fields', async () => {
      const request = new Request('http://localhost:3000/api/supplies/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobRef: 'JOB-101',
          // missing jobAddress, distributorKey, trade, squaresOrUnits
        }),
      });

      const response = await postProcurement(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Missing required fields');
    });

    it('creates and dispatches a live purchase order to ABC Supply', async () => {
      const request = new Request('http://localhost:3000/api/supplies/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobRef: 'JOB-9924',
          jobAddress: '1204 South Congress Ave, Austin, TX 78704',
          contractorName: 'Apex Roofing Austin LLC',
          distributorKey: 'abc_supply',
          trade: 'roofing',
          squaresOrUnits: 26,
          deliveryMethod: 'jobsite_rooftop_drop',
          contractorTier: 'gold',
        }),
      });

      const response = await postProcurement(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.poNumber).toMatch(/^PO-ABC-/);
      expect(json.order.status).toBe('acknowledged');
      expect(json.supplierResponse.success).toBe(true);
      expect(json.supplierResponse.distributorConfirmationNumber).toBeDefined();

      // Test retrieving the PO by ID
      const getReq = new Request(`http://localhost:3000/api/supplies/procurement/${json.order.id}`);
      const getResp = await getPOById(getReq, { params: Promise.resolve({ poId: json.order.id }) });
      const getJson = await getResp.json();

      expect(getResp.status).toBe(200);
      expect(getJson.order.poNumber).toBe(json.poNumber);

      // Test updating the status
      const patchReq = new Request(`http://localhost:3000/api/supplies/procurement/${json.order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'out_for_delivery',
          trackingNumber: 'TRK-BOOM-8812',
          carrierName: 'ABC Supply Austin North Dedicated Boom #04',
        }),
      });
      const patchResp = await patchPOById(patchReq, { params: Promise.resolve({ poId: json.order.id }) });
      const patchJson = await patchResp.json();

      expect(patchResp.status).toBe(200);
      expect(patchJson.order.status).toBe('out_for_delivery');
      expect(patchJson.order.trackingNumber).toBe('TRK-BOOM-8812');
    });
  });

  describe('POST /api/supplies/pricing', () => {
    it('calculates BOM pricing for a specified trade and units', async () => {
      const request = new Request('http://localhost:3000/api/supplies/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade: 'roofing',
          squaresOrUnits: 25,
          distributorKey: 'abc_supply',
          contractorTier: 'silver',
        }),
      });

      const response = await postPricing(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.bom.trade).toBe('roofing');
      expect(json.bom.items.length).toBeGreaterThan(0);
      expect(json.bom.totals.totalWholesaleCost).toBeGreaterThan(2000);
    });

    it('performs cross-distributor quote comparison when compareAll is true', async () => {
      const request = new Request('http://localhost:3000/api/supplies/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade: 'roofing',
          squaresOrUnits: 30,
          compareAll: true,
          contractorTier: 'platinum',
          deliveryMethod: 'jobsite_ground_drop',
        }),
      });

      const response = await postPricing(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.comparison.comparisons.length).toBeGreaterThanOrEqual(3);
      expect(json.comparison.bestPriceSupplier).toBeDefined();
    });
  });
});
