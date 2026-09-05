import { describe, expect, it, vi } from 'vitest';
import { measuredRoom } from './fixtures/room-scan';
import { parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/services', () => ({ listServices: async () => [] }));
vi.mock('@/lib/workspace-trade', () => ({ getAuthoritativeTrade: async () => 'flooring' }));
vi.mock('@/lib/property-intel', () => ({ summarizePropertyIntelligence: () => null }));
import { loadDraftContext, buildDraftInstructions } from '@/lib/quote-draft-ai';

describe('saved scan reaches quote generation', () => {
  it.each([true, false])('builds quote context from saved geometry (hasScan=%s)', async hasScan => {
    const scan = parseCustomScanJson(JSON.stringify(measuredRoom));
    const db = { from: () => {
      let columns = '';
      const q = { select: (value: string) => { columns = value; return q; }, eq: () => q, is: () => q,
        neq: () => q, gt: () => q, order: () => q, limit: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: columns.includes('room_spatial_scan')
          ? { room_spatial_scan: hasScan ? scan : null, lead_id: null }
          : { id: 'job', scope: 'Replace flooring in this room', address: null, photo_paths: [], lead_id: null } }) };
      return q;
    } } as unknown as SupabaseClient;
    const context = await loadDraftContext(db, 'account', 'job');
    expect(context).not.toBeNull();
    if (hasScan) {
      expect(context?.roomSpatialScan).toMatchObject({ floorAreaSqFt: 120, baseboardLinearFt: 41 });
      const prompt = buildDraftInstructions(context!);
      expect(prompt).toContain('Floor Area: 120 sq ft');
      expect(prompt).toContain('Baseboard Perimeter Trim: 41 lin ft');
      expect(prompt).toContain('one room only');
    } else {
      expect(context?.roomSpatialScan).toBeNull();
      expect(buildDraftInstructions(context!)).not.toContain('Floor Area: 120 sq ft');
    }
  });
});
