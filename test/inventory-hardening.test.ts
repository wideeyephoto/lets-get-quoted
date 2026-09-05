import { describe, expect, it, vi } from 'vitest';
import {
  type ToolAsset,
  type FleetVehicle,
  type VanStockItem,
  type VanKitTemplate,
  checkOutTool,
  checkInTool,
  isToolOverdue,
  auditVehicleMaintenance,
  describeVehicleStatus,
  calculateAssetDepreciation,
  generateDepreciationScheduleCsv,
} from '@/lib/inventory-tracker';
import {
  validateToolPhotoFile,
  assertValidToolPhotoFile,
} from '@/lib/tool-photo-storage';
import { parseStoreProductUrl } from '@/lib/store-autofill';
import { applyVanKitTemplate } from '@/lib/inventory-db';
import { checkSearchRateLimit } from '@/app/dashboard/inventory/actions';

describe('Tool Photo Validation & Storage Constraints', () => {
  function makeMockFile(name: string, size: number, type: string): File {
    const blob = new Blob([new Uint8Array(size)], { type });
    return new File([blob], name, { type });
  }

  it('rejects files larger than 5MB', () => {
    const oversizedFile = makeMockFile('large.jpg', 5 * 1024 * 1024 + 1, 'image/jpeg');
    const result = validateToolPhotoFile(oversizedFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('5 MB');
  });

  it('rejects unsupported image and document formats', () => {
    const pdfFile = makeMockFile('manual.pdf', 1024, 'application/pdf');
    const gifFile = makeMockFile('tool.gif', 1024, 'image/gif');
    const exeFile = makeMockFile('installer.exe', 1024, 'application/x-msdownload');

    expect(validateToolPhotoFile(pdfFile).valid).toBe(false);
    expect(validateToolPhotoFile(gifFile).valid).toBe(false);
    expect(validateToolPhotoFile(exeFile).valid).toBe(false);
  });

  it('accepts valid JPEG, PNG, and WebP images within 5MB', () => {
    const jpg = makeMockFile('tool.jpg', 2 * 1024 * 1024, 'image/jpeg');
    const png = makeMockFile('tool.png', 3 * 1024 * 1024, 'image/png');
    const webp = makeMockFile('tool.webp', 1 * 1024 * 1024, 'image/webp');

    expect(validateToolPhotoFile(jpg).valid).toBe(true);
    expect(validateToolPhotoFile(png).valid).toBe(true);
    expect(validateToolPhotoFile(webp).valid).toBe(true);
  });

  it('assertValidToolPhotoFile throws clear descriptive error on invalid files', () => {
    const invalidFile = makeMockFile('doc.txt', 100, 'text/plain');
    expect(() => assertValidToolPhotoFile(invalidFile)).toThrow(/JPG, PNG, or WebP/);
  });
});

describe('Tool Custody & Overdue Tracking', () => {
  const baseTool: ToolAsset = {
    id: 'tool-c1',
    name: 'Milwaukee M18 Fuel Sawzall',
    category: 'Saws',
    brand: 'Milwaukee',
    assetTag: 'TAG-SAW-01',
    status: 'available',
  };

  it('returns false when expectedReturnDate is undefined or tool is available', () => {
    expect(isToolOverdue(baseTool)).toBe(false);

    const pastDateAvailable: ToolAsset = {
      ...baseTool,
      status: 'available',
      expectedReturnDate: '2026-08-01',
    };
    expect(isToolOverdue(pastDateAvailable)).toBe(false);
  });

  it('correctly calculates overdue status for checked out tools past expected date', () => {
    const overdueTool: ToolAsset = {
      ...baseTool,
      status: 'checked_out',
      assignedCrewId: 'crew-1',
      assignedCrewName: 'Alex Rivera',
      checkedOutAt: '2026-08-20T08:00:00Z',
      expectedReturnDate: '2026-08-25',
    };

    // As of 2026-08-26 (day after expected return) -> overdue
    expect(isToolOverdue(overdueTool, '2026-08-26')).toBe(true);

    // As of 2026-08-24 (day before expected return) -> not overdue
    expect(isToolOverdue(overdueTool, '2026-08-24')).toBe(false);
  });

  it('sets and clears expectedReturnDate during checkout and return workflow', () => {
    const checkedOut = checkOutTool(baseTool, {
      crewId: 'crew-2',
      crewName: 'Sarah Jenkins',
      expectedReturnDate: '2026-09-10',
      notes: 'Job #402',
    });

    expect(checkedOut.status).toBe('checked_out');
    expect(checkedOut.assignedCrewName).toBe('Sarah Jenkins');
    expect(checkedOut.expectedReturnDate).toBe('2026-09-10');

    const returned = checkInTool(checkedOut);
    expect(returned.status).toBe('available');
    expect(returned.assignedCrewName).toBeNull();
    expect(returned.expectedReturnDate).toBeNull();
  });
});

describe('Tax Depreciation Engine & Calendar Year Scoping', () => {
  it('scopes Section 179 deduction strictly to placed-in-service calendar year', () => {
    const toolCost = 8500;
    // Purchased and placed in service in 2025
    const purchaseDate = '2025-04-15';

    // Calculation in placed-in-service year 2025: 100% expensed
    const dep2025 = calculateAssetDepreciation(toolCost, purchaseDate, 'section_179', '2025-12-31');
    expect(dep2025.accumulatedDepreciation).toBe(8500);
    expect(dep2025.remainingTaxBasis).toBe(0);
    expect(dep2025.accumulatedTaxDeduction).toBe(8500);
    expect(dep2025.statusText).toContain('100% Expensed (Sec 179)');

    // Calculation prior to placed-in-service year: 0% depreciated
    const depPrior = calculateAssetDepreciation(toolCost, purchaseDate, 'section_179', '2024-12-31');
    expect(depPrior.accumulatedDepreciation).toBe(0);
    expect(depPrior.remainingTaxBasis).toBe(toolCost);
    expect(depPrior.statusText).toContain('Not yet depreciable');
  });

  it('scopes De Minimis Safe Harbor deduction strictly to purchase calendar year', () => {
    const drillCost = 450;
    const purchaseDate = '2025-02-10';

    const dep2025 = calculateAssetDepreciation(drillCost, purchaseDate, 'de_minimis', '2025-11-01');
    expect(dep2025.accumulatedDepreciation).toBe(450);
    expect(dep2025.remainingTaxBasis).toBe(0);
    expect(dep2025.statusText).toContain('Safe Harbor');

    const depPrior = calculateAssetDepreciation(drillCost, purchaseDate, 'de_minimis', '2024-12-31');
    expect(depPrior.accumulatedDepreciation).toBe(0);
    expect(depPrior.remainingTaxBasis).toBe(drillCost);
  });

  it('maintains strict cents precision without floating point artifacts', () => {
    const dep = calculateAssetDepreciation(1000.33, '2024-01-01', 'straight_line_5', '2024-12-31');
    // Ensure all monetary fields are rounded to exact cents
    expect(Number.isInteger(Math.round(dep.accumulatedDepreciation * 100))).toBe(true);
    expect(Number.isInteger(Math.round(dep.remainingTaxBasis * 100))).toBe(true);
    expect(dep.accumulatedDepreciation.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('generates valid depreciation CSV export with headers and rows', () => {
    const tools: ToolAsset[] = [
      {
        id: 't-csv-1',
        name: 'Hammer Drill',
        category: 'Drills',
        brand: 'Bosch',
        assetTag: 'TAG-BOS-01',
        purchasePrice: 600,
        purchaseDate: '2025-01-01',
        depreciationSchedule: 'straight_line_5',
        status: 'available',
      },
    ];
    const vehicles: FleetVehicle[] = [];

    const csv = generateDepreciationScheduleCsv(tools, vehicles, '2026-09-01');
    expect(csv).toContain('Asset Type,Identifier,Description,Purchase Date,Original Cost Basis');
    expect(csv).toContain('TAG-BOS-01');
    expect(csv).toContain('Tool / Equipment');
    expect(csv).toContain('600.00');
  });
});

describe('Retired Fleet Vehicle Neutrality', () => {
  const retiredVan: FleetVehicle = {
    id: 'van-ret-1',
    name: 'Van 3 (Decommissioned)',
    make: 'Ford',
    model: 'Transit 250',
    year: 2018,
    licensePlate: 'RET-999',
    currentMileage: 185000,
    status: 'retired',
    lastServiceDate: '2024-01-01',
    lastServiceMileage: 160000,
    nextServiceDueMileage: 165000, // 20,000 miles past due!
    inspectionExpiresAt: '2024-06-01', // Expired!
    insuranceExpiresAt: '2024-06-01',
  };

  it('completely excludes retired vehicles from maintenance alerts', () => {
    const audit = auditVehicleMaintenance(retiredVan, '2026-09-05');
    expect(audit.isServiceDueSoon).toBe(false);
    expect(audit.isServiceOverdue).toBe(false);
    expect(audit.isInspectionExpired).toBe(false);
    expect(audit.isInsuranceExpired).toBe(false);
    expect(audit.statusTone).toBe('success');
    expect(audit.summaryAlert).toBe('Retired from active fleet service');
  });

  it('describes retired vehicle status with neutral badge label', () => {
    expect(describeVehicleStatus('retired')).toEqual({ label: 'Retired', tone: 'neutral' });
  });
});

describe('Store Autofill Price Honesty', () => {
  it('flags estimated category pricing with isPriceEstimated: true', () => {
    const result = parseStoreProductUrl('https://www.homedepot.com/p/Milwaukee-M18-Fuel-Circular-Saw/305212345');
    expect(result.brand).toBe('Milwaukee');
    expect(result.category).toBe('Cutting Tools');
    // Crucial: Must be flagged as an estimate, never presented as verified actual price
    expect(result.isPriceEstimated).toBe(true);
    expect(result.isDateEstimated).toBe(true);
  });
});

describe('Van Kit Templates Application', () => {
  it('scales existing items and inserts missing items for the target location', async () => {
    const mockTemplateRow = {
      id: 'plumbing-basic',
      account_id: 'acc-test',
      template_name: 'Standard Plumbing Van',
      trade: 'plumbing',
      items: [
        {
          sku: 'SKU-COP-075',
          name: '3/4" Copper Press Coupling',
          category: 'Fittings',
          minThreshold: 5,
          reorderQty: 25,
          unitCost: 4.5,
          unit: 'ea',
        },
        {
          sku: 'SKU-PEX-050',
          name: 'PEX 1/2" 100ft Coil',
          category: 'Pipe',
          minThreshold: 2,
          reorderQty: 4,
          unitCost: 42.0,
          unit: 'coil',
        },
      ],
    };

    const existingStock = {
      id: 'stock-1',
      account_id: 'acc-test',
      sku: 'SKU-COP-075',
      name: '3/4" Copper Press Coupling',
      category: 'Fittings',
      location_name: 'Van 1 - Jake',
      quantity_on_hand: 10,
      min_threshold: 5,
      reorder_qty: 20,
      unit_cost: 4.5,
      unit: 'ea',
    };

    const insertedRows: any[] = [];
    const updatedRows: any[] = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'inventory_van_kit_templates') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockTemplateRow, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === 'inventory_stock_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                eq: vi.fn((c2: string, v2: string) => ({
                  eq: vi.fn((c3: string, loc: string) => ({
                    maybeSingle: vi.fn(() => {
                      if (v2 === 'SKU-COP-075') {
                        return Promise.resolve({ data: existingStock, error: null });
                      }
                      return Promise.resolve({ data: null, error: null });
                    }),
                  })),
                })),
              })),
            })),
            insert: vi.fn((payload: any) => {
              insertedRows.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { id: 'stock-2', ...payload },
                      error: null,
                    })
                  ),
                })),
              };
            }),
            update: vi.fn((payload: any) => {
              updatedRows.push(payload);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn(() =>
                        Promise.resolve({
                          data: { ...existingStock, ...payload },
                          error: null,
                        })
                      ),
                    })),
                  })),
                })),
              };
            }),
          };
        }
        return {};
      }),
    } as any;

    const result = await applyVanKitTemplate(mockSupabase, 'acc-test', 'plumbing-basic', 'Van 1 - Jake');

    expect(result).toHaveLength(2);
    expect(updatedRows[0].reorder_qty).toBe(25);
    expect(insertedRows[0].name).toBe('PEX 1/2" 100ft Coil');
    expect(insertedRows[0].location_name).toBe('Van 1 - Jake');
  });
});

describe('Store Catalog Search Rate Limiting', () => {
  it('allows requests within window and limits abusive rates', async () => {
    const accountId = 'rate-test-account-hardening';
    // Max 5 requests per 1000ms
    for (let i = 0; i < 5; i++) {
      await expect(checkSearchRateLimit(accountId, 5, 1000)).resolves.not.toThrow();
    }
    // 6th request must throw rate limit error
    await expect(checkSearchRateLimit(accountId, 5, 1000)).rejects.toThrow(/Search catalog rate limit exceeded/);
  });
});
