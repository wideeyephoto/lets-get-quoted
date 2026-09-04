import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
  updateVehicleMileage,
  checkOutToolDb,
  checkInToolDb,
} from '@/lib/inventory-db';

describe('Inventory Persistence & Multi-Location Operations', () => {
  const accountId = 'acc-test-123';

  it('loads inventory payload and returns empty collections without auto-seeding when tables are empty', async () => {
    const insertMock = vi.fn();
    const mockSupabase = {
      from: vi.fn(() => {
        const query: any = {
          data: [],
          then: (resolve: any) => Promise.resolve({ data: [] }).then(resolve),
        };
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.order = vi.fn(() => query);
        query.limit = vi.fn(() => query);
        query.insert = insertMock;
        return query;
      }),
    } as never;

    const payload = await loadInventoryData(mockSupabase, accountId);
    expect(payload.locations).toHaveLength(0);
    expect(payload.tools).toHaveLength(0);
    expect(payload.vehicles).toHaveLength(0);
    expect(payload.stock).toHaveLength(0);
    expect(payload.transfers).toHaveLength(0);
    expect(payload.maintenance).toHaveLength(0);
    // Crucial: Must NEVER auto-seed fake records on read
    expect(insertMock).not.toHaveBeenCalled();
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

  it('checks out a tool and preserves tool name, brand, category, and assetTag without wiping records', async () => {
    const existingToolRow = {
      id: 'tool-real-1',
      account_id: accountId,
      name: 'Milwaukee M18 Fuel Sawzall',
      brand: 'Milwaukee',
      category: 'Saws',
      asset_tag: 'TAG-SAW-09',
      model_number: '2821-20',
      serial_number: 'SN-998877',
      purchase_price: 249.00,
      purchase_date: '2025-03-01',
      status: 'available',
      notes: 'Heavy duty case included<!--TAX_META:{"depreciationSchedule":"none","purchasePrice":249,"purchaseDate":"2025-03-01"}-->',
    };

    let capturedUpdatePayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('inventory_tools');
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingToolRow, error: null }),
              }),
            }),
          }),
          update: vi.fn((payload) => {
            capturedUpdatePayload = payload;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...existingToolRow, ...payload },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
        };
      }),
    } as never;

    const checkedOut = await checkOutToolDb(mockSupabase, accountId, {
      toolId: 'tool-real-1',
      crewId: 'crew-jake',
      crewName: 'Jake Martinez',
      jobId: 'job-505',
      jobLabel: '42 Main St Renovation',
      notes: 'Assigned for rough-in demolition',
    });

    expect(capturedUpdatePayload).toBeDefined();
    // Verify core asset identity is untouched by checkout update payload
    expect(capturedUpdatePayload!.status).toBe('checked_out');
    expect(capturedUpdatePayload!.assigned_crew_id).toBe('crew-jake');
    expect(capturedUpdatePayload!.assigned_crew_name).toBe('Jake Martinez');
    expect(capturedUpdatePayload!.assigned_job_id).toBe('job-505');
    expect(capturedUpdatePayload!.assigned_job_label).toBe('42 Main St Renovation');
    expect(capturedUpdatePayload!.checked_out_at).toBeDefined();
    // Name, brand, category, asset_tag MUST NOT be overwritten with empty strings
    expect(capturedUpdatePayload!.name).toBeUndefined();
    expect(capturedUpdatePayload!.brand).toBeUndefined();
    expect(capturedUpdatePayload!.asset_tag).toBeUndefined();

    // Mapped return tool retains full identity
    expect(checkedOut.name).toBe('Milwaukee M18 Fuel Sawzall');
    expect(checkedOut.brand).toBe('Milwaukee');
    expect(checkedOut.assetTag).toBe('TAG-SAW-09');
    expect(checkedOut.status).toBe('checked_out');
    expect(checkedOut.assignedCrewName).toBe('Jake Martinez');
    expect(checkedOut.notes).toBe('Assigned for rough-in demolition');
  });

  it('checks in a tool and clears custody without wiping tool identity', async () => {
    const existingToolRow = {
      id: 'tool-real-1',
      account_id: accountId,
      name: 'Milwaukee M18 Fuel Sawzall',
      brand: 'Milwaukee',
      category: 'Saws',
      asset_tag: 'TAG-SAW-09',
      status: 'checked_out',
      assigned_crew_name: 'Jake Martinez',
      notes: 'Checked out notes',
    };

    let capturedUpdatePayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('inventory_tools');
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingToolRow, error: null }),
              }),
            }),
          }),
          update: vi.fn((payload) => {
            capturedUpdatePayload = payload;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...existingToolRow, ...payload },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
        };
      }),
    } as never;

    const checkedIn = await checkInToolDb(mockSupabase, accountId, {
      toolId: 'tool-real-1',
      condition: 'available',
      notes: 'Cleaned and returned to shop',
    });

    expect(capturedUpdatePayload).toBeDefined();
    expect(capturedUpdatePayload!.status).toBe('available');
    expect(capturedUpdatePayload!.assigned_crew_id).toBeNull();
    expect(capturedUpdatePayload!.assigned_crew_name).toBeNull();
    expect(capturedUpdatePayload!.assigned_job_id).toBeNull();
    expect(capturedUpdatePayload!.checked_out_at).toBeNull();
    expect(capturedUpdatePayload!.name).toBeUndefined();

    expect(checkedIn.name).toBe('Milwaukee M18 Fuel Sawzall');
    expect(checkedIn.status).toBe('available');
    expect(checkedIn.assignedCrewName).toBeNull();
    expect(checkedIn.notes).toBe('Cleaned and returned to shop');
  });

  it('creates a new vehicle with all compliance and identity fields', async () => {
    let capturedInsertPayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('inventory_vehicles');
        return {
          insert: vi.fn((payload) => {
            capturedInsertPayload = payload;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'veh-new-uuid', ...payload },
                  error: null,
                }),
              }),
            };
          }),
        };
      }),
    } as never;

    const vehicle = await saveVehicle(mockSupabase, accountId, {
      name: 'Service Truck #4',
      make: 'Ford',
      model: 'F-350',
      year: 2025,
      licensePlate: 'K99-XYZ',
      vin: '1FT8W3BT7REC11223',
      currentMileage: 12500,
      status: 'active',
      inspectionExpiresAt: '2027-01-15',
      insuranceExpiresAt: '2027-06-30',
      notes: 'Equipped with service utility body and crane',
      depreciationSchedule: 'none',
    });

    expect(capturedInsertPayload).toBeDefined();
    expect(capturedInsertPayload!.name).toBe('Service Truck #4');
    expect(capturedInsertPayload!.make).toBe('Ford');
    expect(capturedInsertPayload!.model).toBe('F-350');
    expect(capturedInsertPayload!.year).toBe(2025);
    expect(capturedInsertPayload!.license_plate).toBe('K99-XYZ');
    expect(capturedInsertPayload!.vin).toBe('1FT8W3BT7REC11223');
    expect(capturedInsertPayload!.current_mileage).toBe(12500);
    expect(capturedInsertPayload!.inspection_expires_at).toBe('2027-01-15');
    expect(capturedInsertPayload!.insurance_expires_at).toBe('2027-06-30');
    expect(capturedInsertPayload!.status).toBe('active');

    expect(vehicle.id).toBe('veh-new-uuid');
    expect(vehicle.vin).toBe('1FT8W3BT7REC11223');
    expect(vehicle.insuranceExpiresAt).toBe('2027-06-30');
    expect(vehicle.inspectionExpiresAt).toBe('2027-01-15');
    expect(vehicle.status).toBe('active');
  });

  it('updates an existing vehicle defensively and preserves all 7 fields without nulling them', async () => {
    const existingVehicleRow = {
      id: 'd3b07384-d113-49d6-848e-5b128522e860',
      account_id: accountId,
      name: 'Heavy Duty Van 1',
      make: 'Ram',
      model: 'ProMaster',
      year: 2023,
      license_plate: 'RAM-1234',
      vin: '3C6URVBG8PE998877',
      current_mileage: 45000,
      primary_driver_id: 'crew-dave-id',
      primary_driver_name: 'Dave Cooper',
      status: 'in_shop',
      last_service_date: '2026-06-15',
      last_service_mileage: 42000,
      next_service_due_mileage: 48000,
      inspection_expires_at: '2027-03-31',
      insurance_expires_at: '2027-09-30',
      notes: 'Full shelving layout<!--TAX_META:{"depreciationSchedule":"macrs_5","purchasePrice":45000}-->',
    };

    let capturedUpdatePayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('inventory_vehicles');
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingVehicleRow, error: null }),
              }),
            }),
          }),
          update: vi.fn((payload) => {
            capturedUpdatePayload = payload;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...existingVehicleRow, ...payload },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
        };
      }),
    } as never;

    // Simulate saving vehicle without passing VIN, insurance, or notes
    const updated = await saveVehicle(mockSupabase, accountId, {
      id: 'd3b07384-d113-49d6-848e-5b128522e860',
      name: 'Heavy Duty Van 1 (Updated Name)',
      make: 'Ram',
      model: 'ProMaster',
      year: 2023,
      licensePlate: 'RAM-1234',
    });

    expect(capturedUpdatePayload).toBeDefined();
    // Verify name changed
    expect(capturedUpdatePayload!.name).toBe('Heavy Duty Van 1 (Updated Name)');
    // Crucial: Existing VIN, insurance, status, notes, driver, and service history MUST NOT be nulled or reset!
    expect(capturedUpdatePayload!.vin).toBe('3C6URVBG8PE998877');
    expect(capturedUpdatePayload!.insurance_expires_at).toBe('2027-09-30');
    expect(capturedUpdatePayload!.inspection_expires_at).toBe('2027-03-31');
    expect(capturedUpdatePayload!.status).toBe('in_shop');
    expect(capturedUpdatePayload!.primary_driver_id).toBe('crew-dave-id');
    expect(capturedUpdatePayload!.primary_driver_name).toBe('Dave Cooper');
    expect(capturedUpdatePayload!.last_service_date).toBe('2026-06-15');
    expect(capturedUpdatePayload!.last_service_mileage).toBe(42000);

    expect(updated.vin).toBe('3C6URVBG8PE998877');
    expect(updated.insuranceExpiresAt).toBe('2027-09-30');
    expect(updated.status).toBe('in_shop');
    expect(updated.primaryDriverName).toBe('Dave Cooper');
  });

  it('updates odometer mileage via updateVehicleMileage modifying ONLY current_mileage and updated_at', async () => {
    const existingVehicleRow = {
      id: 'veh-real-456',
      account_id: accountId,
      name: 'Service Van 2',
      make: 'Ford',
      model: 'Transit',
      year: 2024,
      license_plate: 'TX-7788',
      vin: '1FT8W2BT5REC44332',
      current_mileage: 28000,
      status: 'active',
      inspection_expires_at: '2026-12-31',
      insurance_expires_at: '2027-05-15',
    };

    let capturedPayload: Record<string, unknown> | null = null;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('inventory_vehicles');
        return {
          update: vi.fn((payload) => {
            capturedPayload = payload;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...existingVehicleRow, ...payload },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }),
        };
      }),
    } as never;

    const updated = await updateVehicleMileage(mockSupabase, accountId, 'veh-real-456', 29500);

    expect(capturedPayload).toBeDefined();
    // Payload must contain ONLY current_mileage and updated_at
    expect(Object.keys(capturedPayload!).sort()).toEqual(['current_mileage', 'updated_at'].sort());
    expect(capturedPayload!.current_mileage).toBe(29500);

    // Mapped vehicle preserves all existing data
    expect(updated.name).toBe('Service Van 2');
    expect(updated.make).toBe('Ford');
    expect(updated.model).toBe('Transit');
    expect(updated.year).toBe(2024);
    expect(updated.licensePlate).toBe('TX-7788');
    expect(updated.vin).toBe('1FT8W2BT5REC44332');
    expect(updated.currentMileage).toBe(29500);
    expect(updated.status).toBe('active');
  });

  it('does not invent tax elections or borrow fake prices from DEFAULT_VEHICLES', async () => {
    // A real vehicle with custom plate and price, but no tax schedule specified
    const rawRow = {
      id: 'veh-custom-99',
      account_id: accountId,
      name: 'Custom Box Truck',
      make: 'Isuzu',
      model: 'NPR-HD',
      year: 2024,
      license_plate: 'CUST-99',
      vin: '4UZAA2AC5PC112233',
      current_mileage: 18000,
      status: 'active',
      notes: '<!--TAX_META:{"purchasePrice":62000}-->',
    };

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: rawRow, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never;

    const vehicle = await updateVehicleMileage(mockSupabase, accountId, 'veh-custom-99', 18500);
    // Crucial: Must NOT default to 'section_179'
    expect(vehicle.depreciationSchedule).toBeNull();
    expect(vehicle.purchasePrice).toBe(62000);
  });

  it('throws an error if follow-up vehicle update fails in saveMaintenanceRecord', async () => {
    const mockMaint = {
      id: 'maint-fail-test',
      account_id: accountId,
      asset_type: 'vehicle',
      asset_id: 'veh-1',
      asset_name: 'Transit Van 1',
      service_type: 'Transmission Service',
      cost: 450.0,
      performed_by: 'Shop Tech',
      performed_at: '2026-09-02',
    };

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
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: new Error('Postgres connection severed') }),
              }),
            }),
          };
        }
        return {};
      }),
    } as never;

    await expect(
      saveMaintenanceRecord(mockSupabase, accountId, {
        assetType: 'vehicle',
        assetId: 'veh-1',
        assetName: 'Transit Van 1',
        serviceType: 'Transmission Service',
        cost: 450.0,
        performedBy: 'Shop Tech',
        performedAt: '2026-09-02',
      }),
    ).rejects.toThrow('Postgres connection severed');
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

  it('throws an error in loadInventoryData if any table query fails', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        const query: any = {
          then: (resolve: any) => {
            if (table === 'inventory_vehicles') {
              return Promise.resolve({ data: null, error: { message: 'relation inventory_vehicles failed' } }).then(resolve);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.order = vi.fn(() => query);
        query.limit = vi.fn(() => query);
        return query;
      }),
    } as never;

    await expect(loadInventoryData(mockSupabase, accountId)).rejects.toThrow('Failed to load inventory data');
  });

  it('saves vehicle with purchase_price, purchase_date, and depreciation_schedule in database columns directly', async () => {
    let capturedPayload: any = null;
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn((payload) => {
          capturedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'veh-new-uuid',
                  account_id: accountId,
                  ...payload,
                },
                error: null,
              }),
            }),
          };
        }),
      }),
    } as never;

    const saved = await saveVehicle(mockSupabase, accountId, {
      name: 'Service Truck 1',
      make: 'Ford',
      model: 'F-250',
      year: 2025,
      licensePlate: 'ABC-1234',
      purchasePrice: 55000,
      purchaseDate: '2025-01-15',
      depreciationSchedule: 'macrs_5',
      notes: 'Clean service vehicle notes',
    });

    expect(capturedPayload.purchase_price).toBe(55000);
    expect(capturedPayload.purchase_date).toBe('2025-01-15');
    expect(capturedPayload.depreciation_schedule).toBe('macrs_5');
    expect(capturedPayload.notes).toBe('Clean service vehicle notes');
    // Ensure no HTML comments were injected into notes
    expect(capturedPayload.notes).not.toContain('<!--TAX_META:');
    expect(saved.purchasePrice).toBe(55000);
    expect(saved.depreciationSchedule).toBe('macrs_5');
  });

  it('asserts that migrations deduplicate and enforce unique constraints on all 5 inventory tables', () => {
    const root = process.cwd();
    const migrationPath = resolve(root, 'migrations/20260904140000_inventory_acl_hardening_and_deduplication.sql');
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');

    const inventoryTables = [
      'inventory_locations',
      'inventory_tools',
      'inventory_vehicles',
      'inventory_stock_items',
      'inventory_stock_transfers',
      'inventory_maintenance_records',
    ];

    for (const table of inventoryTables) {
      expect(sql).toContain(`revoke all on table public.${table} from anon, public;`);
    }

    // Unique index assertions for all 5 inventory tables
    expect(sql).toContain('create unique index if not exists idx_inventory_locations_account_name');
    expect(sql).toContain('create unique index if not exists idx_inventory_vehicles_account_plate');
    expect(sql).toContain('create unique index if not exists idx_inventory_tools_account_asset_tag');
    expect(sql).toContain('create unique index if not exists idx_inventory_stock_account_sku_loc');
    expect(sql).toContain('create unique index if not exists idx_inventory_maint_record_dedup');

    // Dedicated purchase_price columns added
    expect(sql).toContain('purchase_price numeric(10, 2)');
    expect(sql).toContain('depreciation_schedule text');

    // Post-condition assertion
    expect(sql).toContain('pg_catalog.aclexplode');
    expect(sql).toContain('Inventory table(s) still hold anon/public grants');
  });
});
