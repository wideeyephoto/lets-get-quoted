import { describe, expect, it } from 'vitest';
import {
  type ToolAsset,
  type FleetVehicle,
  type VanStockItem,
  checkOutTool,
  checkInTool,
  auditVehicleMaintenance,
  auditLowStockItems,
  describeToolStatus,
  describeVehicleStatus,
  calculateAssetDepreciation,
  TAX_GUIDANCE_SCHEDULES,
} from '@/lib/inventory-tracker';

describe('Tool Check-In and Check-Out Life Cycle', () => {
  const sampleTool: ToolAsset = {
    id: 't1',
    name: 'RIDGID RP 351 ProPress Press Tool',
    category: 'Pipe Joining',
    brand: 'RIDGID',
    assetTag: 'TAG-PLUMB-01',
    status: 'available',
  };

  it('checks out tool to technician and job site', () => {
    const checkedOut = checkOutTool(sampleTool, {
      crewId: 'c1',
      crewName: 'Jake Martinez',
      jobId: 'job-101',
      jobLabel: '142 Ridgewood Rd',
      notes: 'Checked out with 1" jaw',
    });

    expect(checkedOut.status).toBe('checked_out');
    expect(checkedOut.assignedCrewName).toBe('Jake Martinez');
    expect(checkedOut.assignedJobLabel).toBe('142 Ridgewood Rd');
    expect(checkedOut.checkedOutAt).toBeDefined();
    expect(checkedOut.notes).toBe('Checked out with 1" jaw');
  });

  it('checks in tool back to shop pool', () => {
    const activeTool: ToolAsset = {
      ...sampleTool,
      status: 'checked_out',
      assignedCrewId: 'c1',
      assignedCrewName: 'Jake Martinez',
      checkedOutAt: '2026-08-25T10:00:00Z',
    };

    const returned = checkInTool(activeTool);
    expect(returned.status).toBe('available');
    expect(returned.assignedCrewId).toBeNull();
    expect(returned.assignedCrewName).toBeNull();
    expect(returned.checkedOutAt).toBeNull();
  });

  it('checks in tool flagged for maintenance', () => {
    const activeTool: ToolAsset = {
      ...sampleTool,
      status: 'checked_out',
      assignedCrewId: 'c1',
    };

    const returned = checkInTool(activeTool, { condition: 'in_maintenance', notes: 'Needs calibration' });
    expect(returned.status).toBe('in_maintenance');
    expect(returned.notes).toBe('Needs calibration');
  });
});

describe('Fleet Vehicle Maintenance Audit', () => {
  const baseVehicle: FleetVehicle = {
    id: 'v1',
    name: 'Truck 1',
    make: 'Ford',
    model: 'F-250',
    year: 2024,
    licensePlate: 'X92-KLP',
    currentMileage: 24850,
    status: 'active',
    lastServiceDate: '2026-05-10',
    lastServiceMileage: 20000,
    nextServiceDueMileage: 25000,
    inspectionExpiresAt: '2026-11-30',
    insuranceExpiresAt: '2027-04-15',
  };

  it('flags service due soon when within 500 miles', () => {
    const audit = auditVehicleMaintenance(baseVehicle, '2026-08-25');
    expect(audit.isServiceDueSoon).toBe(true);
    expect(audit.isServiceOverdue).toBe(false);
    expect(audit.milesUntilService).toBe(150);
    expect(audit.statusTone).toBe('warn');
    expect(audit.summaryAlert).toContain('Service due in 150 miles');
  });

  it('flags service overdue when past mileage limit', () => {
    const overdueVeh: FleetVehicle = {
      ...baseVehicle,
      currentMileage: 25400, // 400 miles over 25,000!
    };
    const audit = auditVehicleMaintenance(overdueVeh, '2026-08-25');
    expect(audit.isServiceOverdue).toBe(true);
    expect(audit.statusTone).toBe('danger');
    expect(audit.summaryAlert).toContain('overdue by 400 miles');
  });

  it('flags expired state inspection', () => {
    const expiredInspection: FleetVehicle = {
      ...baseVehicle,
      inspectionExpiresAt: '2026-08-01',
    };
    const audit = auditVehicleMaintenance(expiredInspection, '2026-08-25');
    expect(audit.isInspectionExpired).toBe(true);
    expect(audit.statusTone).toBe('danger');
    expect(audit.summaryAlert).toContain('inspection expired');
  });
});

describe('auditLowStockItems', () => {
  const stockItems: VanStockItem[] = [
    {
      id: 's1',
      name: '3/4" Copper Coupling',
      sku: 'VIEGA-78052',
      category: 'Fittings',
      quantityOnHand: 4,
      minThreshold: 10,
      unit: 'pcs',
      unitCost: 5.00,
      preferredSupplier: 'Ferguson',
      reorderQty: 20,
      location: 'Van 1',
    },
    {
      id: 's2',
      name: '20A Breaker',
      sku: 'SQD-QO120',
      category: 'Electrical',
      quantityOnHand: 15,
      minThreshold: 8,
      unit: 'pcs',
      unitCost: 10.00,
      preferredSupplier: 'Graybar',
      reorderQty: 10,
      location: 'Van 2',
    },
  ];

  it('detects low stock items and computes purchase order cost', () => {
    const result = auditLowStockItems(stockItems);
    expect(result.totalItems).toBe(2);
    expect(result.lowStockCount).toBe(1);
    expect(result.lowStockItems[0].name).toBe('3/4" Copper Coupling');
    // 20 reorder * $5.00 = $100.00
    expect(result.estimatedRestockCost).toBe(100);
    expect(result.formattedRestockCost).toBe('$100.00');
  });
});

describe('describeToolStatus & describeVehicleStatus', () => {
  it('maps tool tones accurately', () => {
    expect(describeToolStatus('available')).toEqual({ label: 'Available in Shop', tone: 'success' });
    expect(describeToolStatus('checked_out')).toEqual({ label: 'Checked Out', tone: 'warn' });
    expect(describeToolStatus('in_maintenance')).toEqual({ label: 'In Maintenance / Repair', tone: 'danger' });
  });

  it('maps vehicle tones accurately', () => {
    expect(describeVehicleStatus('active')).toEqual({ label: 'On the Road', tone: 'success' });
    expect(describeVehicleStatus('in_shop')).toEqual({ label: 'In Shop / Service', tone: 'warn' });
  });
});

describe('Tax Guidance & Asset Depreciation Engine', () => {
  it('handles Section 179 full immediate expensing', () => {
    const result = calculateAssetDepreciation(3850, '2025-04-10', 'section_179');
    expect(result.originalCost).toBe(3850);
    expect(result.currentBookValue).toBe(0);
    expect(result.accumulatedDepreciation).toBe(3850);
    expect(result.percentDepreciated).toBe(100);
    expect(result.scheduleBadge).toBe('Sec 179');
  });

  it('handles De Minimis safe harbor under $2,500', () => {
    const result = calculateAssetDepreciation(845, '2025-03-12', 'de_minimis');
    expect(result.originalCost).toBe(845);
    expect(result.currentBookValue).toBe(0);
    expect(result.accumulatedDepreciation).toBe(845);
    expect(result.scheduleBadge).toBe('De Minimis');
  });

  it('handles Straight-Line 3-Year depreciation over time', () => {
    const asOf = new Date('2026-01-20');
    // 12 months elapsed out of 36 months = 1/3 (33%)
    const result = calculateAssetDepreciation(3000, '2025-01-20', 'straight_line_3', asOf);
    expect(result.originalCost).toBe(3000);
    expect(result.accumulatedDepreciation).toBe(1000);
    expect(result.currentBookValue).toBe(2000);
    expect(result.percentDepreciated).toBe(33);
  });

  it('handles assets held at cost basis with no depreciation', () => {
    const result = calculateAssetDepreciation(5000, '2024-01-01', 'none');
    expect(result.originalCost).toBe(5000);
    expect(result.currentBookValue).toBe(5000);
    expect(result.accumulatedDepreciation).toBe(0);
  });

  it('provides tax guidance tips for all standard schedules', () => {
    expect(TAX_GUIDANCE_SCHEDULES.section_179.shortTip).toContain('100%');
    expect(TAX_GUIDANCE_SCHEDULES.de_minimis.shortTip).toContain('$2,500');
    expect(TAX_GUIDANCE_SCHEDULES.macrs_5.shortTip).toContain('5-year');
  });
});

