import { describe, it, expect } from 'vitest';
import {
  calculateRoomSummary,
  calculateMaterialCosts,
  calculateSupplyHousePickList,
  formatSupplyHousePickListText,
  formatSpatialTakeoffReport,
  SAMPLE_ROOM_SCANS,
} from '@/lib/property-intel/room-spatial-intel';

describe('3D LiDAR Room Spatial Intelligence Takeoffs', () => {
  it('accurately calculates square footage and linear perimeter from a 4-wall scan', () => {
    const scan = SAMPLE_ROOM_SCANS[0]; // Master Bath (120" x 60", 108" height)
    const summary = calculateRoomSummary(scan);

    // 120" = 10ft, 60" = 5ft => 10 * 5 = 50 sq ft
    expect(summary.floorAreaSqFt).toBe(50);
    // Perimeter = (120 + 60 + 120 + 60) / 12 = 30 lin ft
    expect(summary.perimeterLinearFt).toBe(30);
    // Ceiling height = 108 / 12 = 9 ft
    expect(summary.ceilingHeightFt).toBe(9);
  });

  it('correctly deduces net paintable wall area by subtracting doors and windows', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);

    // Gross wall area: (120*108*2 + 60*108*2) / 144 = (25920 + 12960) / 144 = 270 sq ft
    expect(summary.grossWallAreaSqFt).toBe(270);
    // Door (32x80 = 2560 sq in = 17.78 sq ft) + Window (28x42 = 1176 sq in = 8.17 sq ft) = ~26 sq ft
    expect(summary.openingsAreaSqFt).toBeCloseTo(25.9, 1);
    expect(summary.netPaintableWallSqFt).toBe(244);
    expect(summary.doorsCount).toBe(1);
    expect(summary.windowsCount).toBe(1);
  });

  it('calculates bathroom wet wall tile area including shower alcove', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);

    expect(summary.primaryAlcoveSpanInches).toBe(60);
    // Tile area = floor (50) + wet walls ((5 + 2*2.67) * 9 = 93) => ~143 sq ft
    expect(summary.tileAreaSqFt).toBeGreaterThan(130);
  });

  it('correctly deduces baseboard trim by subtracting door opening widths from perimeter', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);

    // 30 lin ft minus 32" (2.67 ft) door = 27.3 lin ft
    expect(summary.baseboardLinearFt).toBe(27.3);
  });

  it('calculates material trade cost breakdowns from room takeoffs', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const costs = calculateMaterialCosts(summary, 'tile', 'paint');

    // Flooring: 50 sq ft * $14 = $700
    expect(costs.flooringCost).toBe(700);
    // Wall: 244 sq ft * $1.85 = $451
    expect(costs.wallCost).toBe(451);
    // Trim: 27.3 LF * $6.50 = $177
    expect(costs.trimCost).toBe(177);
    expect(costs.totalEstimatedTakeoff).toBe(700 + 451 + 177);
  });

  it('calculates vendor-ready supply house materials pick-list with waste factors', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const items = calculateSupplyHousePickList(summary, scan);

    // Floor Tile: (50 * 1.1) / 20 = 2.75 => 3 boxes
    const floorTile = items.find((i) => i.name.includes('Floor Tile'));
    expect(floorTile).toBeDefined();
    expect(floorTile?.quantity).toBe(3);
    expect(floorTile?.unit).toBe('boxes');
    expect(floorTile?.wasteFactor).toBe('+10% Cut Waste');

    // Paint: (244 * 2) / 350 = 1.39 => 2 gallons
    const finishPaint = items.find((i) => i.name.includes('Premium Interior Finish Paint'));
    expect(finishPaint).toBeDefined();
    expect(finishPaint?.quantity).toBe(2);
    expect(finishPaint?.unit).toBe('gal');

    // Baseboard Trim: (27.3 * 1.1) / 8 = 3.75 => 4 pieces
    const baseboard = items.find((i) => i.name.includes('Baseboard Molding'));
    expect(baseboard).toBeDefined();
    expect(baseboard?.quantity).toBe(4);
    expect(baseboard?.unit).toBe('pieces');

    // Cement Backerboard for wet walls: (143 - 50 = 93 sq ft) / 15 = 6.2 => 7 sheets
    const backerboard = items.find((i) => i.name.includes('Cement Backerboard'));
    expect(backerboard).toBeDefined();
    expect(backerboard?.quantity).toBeGreaterThanOrEqual(6);
  });

  it('formats supply house pick-list text for clipboard copying', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const items = calculateSupplyHousePickList(summary, scan);
    const text = formatSupplyHousePickListText(scan, items);

    expect(text).toContain('SUPPLY HOUSE ORDER PICK-LIST');
    expect(text).toContain('[FLOORING & TILE]');
    expect(text).toContain('3 boxes — Floor Tile / Planks');
    expect(text).toContain('[TRIM & FINISH CARPENTRY]');
  });

  it('formats clean spatial takeoff report text for export', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const costs = calculateMaterialCosts(summary, 'tile', 'paint');
    const report = formatSpatialTakeoffReport(scan, summary, costs);

    expect(report).toContain('3D LiDAR SPATIAL TAKEOFF REPORT');
    expect(report).toContain('Floor Surface Area:      50 sq ft');
    expect(report).toContain('TOTAL ESTIMATED TAKEOFF: $1,328');
  });
});
