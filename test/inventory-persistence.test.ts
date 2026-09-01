import { describe, expect, it, vi } from 'vitest';
import {
  loadInventoryData,
  saveTool,
  deleteTool,
  saveVehicle,
  deleteVehicle,
  saveStockItem,
  deleteStockItem,
  adjustStockQuantity,
  transferStock,
  saveMaintenanceRecord,
  saveLocation,
  deleteLocation,
} from '@/lib/inventory-db';

describe('Inventory Persistence & Multi-Location Operations', () => {
  const accountId = 'acc-test-123';

  it('loads inventory payload and auto-seeds when tables are empty', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'inventory_locations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'loc-1', name: 'Main Shop', type: 'warehouse', is_active: true }],
              }),
            }),
          };
        }
        if (table === 'inventory_tools') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'tool-1', name: 'ProPress Tool', category: 'Pipe', brand: 'RIDGID', asset_tag: 'TAG-1', status: 'available' }],
              }),
            }),
          };
        }
        if (table === 'inventory_vehicles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'veh-1', name: 'Van #1', make: 'Ford', model: 'Transit', year: 2023, license_plate: 'TX-1', current_mileage: 25000, status: 'active' }],
              }),
            }),
          };
        }
        if (table === 'inventory_stock_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'stock-1', name: 'Copper Elbow', sku: 'COP-1', category: 'Fittings', quantity_on_hand: 10, min_threshold: 5, unit: 'ea', unit_cost: 4.5, preferred_supplier: 'Ferguson', reorder_qty: 20, location_name: 'Main Shop' }],
              }),
            }),
          };
        }
        if (table === 'inventory_stock_transfers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'tr-1', item_id: 'stock-1', item_name: 'Copper Elbow', from_location: 'Main Shop', to_location: 'Van #1', quantity: 5 } }),
              }),
            }),
          };
        }
        if (table === 'inventory_maintenance_records') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [] }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'maint-1', asset_type: 'vehicle', asset_id: 'veh-1', asset_name: 'Van #1', service_type: 'Oil Change', cost: 120, performed_by: 'Shop', performed_at: '2026-08-01' }],
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [] }),
        };
      }),
    } as never;

    const payload = await loadInventoryData(mockSupabase, accountId);
    expect(payload.locations).toHaveLength(1);
    expect(payload.tools).toHaveLength(1);
    expect(payload.vehicles).toHaveLength(1);
    expect(payload.stock).toHaveLength(1);
    expect(payload.maintenance).toHaveLength(1);
  });

  it('inserts and updates tool records', async () => {
    const mockTool = {
      id: 'tool-new-1',
      account_id: accountId,
      name: 'DeWalt Rotary Hammer',
      brand: 'DeWalt',
      category: 'Hammer',
      asset_tag: 'TAG-HAM-1',
      status: 'available',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTool, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { ...mockTool, status: 'checked_out' }, error: null }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    } as never;

    const created = await saveTool(mockSupabase, accountId, {
      name: 'DeWalt Rotary Hammer',
      brand: 'DeWalt',
      category: 'Hammer',
      assetTag: 'TAG-HAM-1',
    });
    expect(created.id).toBe('tool-new-1');
    expect(created.status).toBe('available');

    await deleteTool(mockSupabase, accountId, 'tool-new-1');
  });

  it('adjusts stock quantity on hand', async () => {
    const mockStock = {
      id: 'stock-100',
      account_id: accountId,
      name: '3/4" Ball Valve',
      sku: 'BV-75',
      category: 'Valves',
      quantity_on_hand: 8,
      min_threshold: 4,
      unit: 'ea',
      unit_cost: 15.0,
      preferred_supplier: 'SupplyHouse',
      reorder_qty: 10,
      location_name: 'Van #1',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockStock, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...mockStock, quantity_on_hand: 12 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const adjusted = await adjustStockQuantity(mockSupabase, accountId, 'stock-100', 4);
    expect(adjusted.quantityOnHand).toBe(12);
  });

  it('transfers stock between locations safely', async () => {
    const sourceStock = {
      id: 'stock-source',
      account_id: accountId,
      name: 'R-410A Tank',
      sku: 'REF-410A',
      category: 'Refrigerant',
      quantity_on_hand: 5,
      min_threshold: 2,
      unit: 'cyl',
      unit_cost: 180,
      location_name: 'Main Shop',
    };

    const destStock = {
      id: 'stock-dest',
      account_id: accountId,
      name: 'R-410A Tank',
      sku: 'REF-410A',
      category: 'Refrigerant',
      quantity_on_hand: 1,
      min_threshold: 1,
      unit: 'cyl',
      unit_cost: 180,
      location_name: 'Van #1',
    };

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'inventory_stock_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn((col: string, val: string) => {
                if (col === 'id') {
                  return {
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: sourceStock, error: null }),
                    }),
                  };
                }
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: destStock, error: null }),
                    }),
                  }),
                };
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...sourceStock, quantity_on_hand: 3 },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'inventory_stock_transfers') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'tr-99',
                    account_id: accountId,
                    item_id: 'stock-source',
                    item_name: 'R-410A Tank',
                    from_location: 'Main Shop',
                    to_location: 'Van #1',
                    quantity: 2,
                    created_at: '2026-09-01T12:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as never;

    const result = await transferStock(mockSupabase, accountId, {
      stockId: 'stock-source',
      fromLocation: 'Main Shop',
      toLocation: 'Van #1',
      quantity: 2,
      performedBy: 'Warehouse Manager',
      notes: 'Morning restock',
    });

    expect(result.sourceStock.quantityOnHand).toBe(3);
    expect(result.transfer.fromLocation).toBe('Main Shop');
    expect(result.transfer.toLocation).toBe('Van #1');
    expect(result.transfer.quantity).toBe(2);
  });

  it('saves maintenance record and updates vehicle service metadata', async () => {
    const mockMaint = {
      id: 'maint-55',
      account_id: accountId,
      asset_type: 'vehicle',
      asset_id: 'veh-1',
      asset_name: 'Transit Van 1',
      service_type: 'Synthetic Oil Change',
      cost: 135.0,
      performed_by: 'QuickLube Pro',
      performed_at: '2026-09-01',
      mileage_at_service: 32000,
    };

    const updateVehicleMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'inventory_maintenance_records') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockMaint, error: null }),
              }),
            }),
          };
        }
        if (table === 'inventory_vehicles') {
          return {
            update: updateVehicleMock,
          };
        }
        return {};
      }),
    } as never;

    const saved = await saveMaintenanceRecord(mockSupabase, accountId, {
      assetType: 'vehicle',
      assetId: 'veh-1',
      assetName: 'Transit Van 1',
      serviceType: 'Synthetic Oil Change',
      cost: 135.0,
      performedBy: 'QuickLube Pro',
      performedAt: '2026-09-01',
      mileageAtService: 32000,
    });

    expect(saved.id).toBe('maint-55');
    expect(saved.cost).toBe(135.0);
    expect(updateVehicleMock).toHaveBeenCalled();
  });
});
