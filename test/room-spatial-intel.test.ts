import { describe, it, expect } from 'vitest';
import {
  calculateRoomSummary,
  calculateMaterialCosts,
  calculateSupplyHousePickList,
  formatSupplyHousePickListText,
  formatSpatialTakeoffReport,
  generateSupplyHouseCsv,
  formatSubcontractorSlip,
  getWallElevations,
  parseCustomScanJson,
  matchScanToScope,
  SAMPLE_ROOM_SCANS,
} from '@/lib/property-intel/room-spatial-intel';
import {
  shouldDisplayRoomSpatialScan,
  inferRoomTypeFromScope,
} from '@/lib/property-intel/profile';

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

  it('supports custom price book rate overrides for material and labor estimates', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const costs = calculateMaterialCosts(summary, 'tile', 'paint', {
      flooringRatePerSqFt: 22,
      wallRatePerSqFt: 3.5,
      trimRatePerLf: 9,
    });

    // 50 * 22 = 1100
    expect(costs.flooringCost).toBe(1100);
    expect(costs.flooringLabel).toContain('$22/sq ft Custom');
    // 244 * 3.5 = 854
    expect(costs.wallCost).toBe(854);
    expect(costs.wallLabel).toContain('$3.5/sq ft Custom');
    // 27.3 * 9 = 246
    expect(costs.trimCost).toBe(246);
    expect(costs.totalEstimatedTakeoff).toBe(1100 + 854 + 246);
  });

  it('accurately auto-matches room scan presets based on scope keywords', () => {
    const kitchenScan = matchScanToScope('Full kitchen remodel with center island cabinets and quartz');
    expect(kitchenScan.roomType).toBe('kitchen');
    expect(kitchenScan.id).toBe('scan-kitchen-alcove');

    const bedroomScan = matchScanToScope('Primary bedroom hardwood flooring takeoff and closet trim');
    expect(bedroomScan.roomType).toBe('bedroom');
    expect(bedroomScan.id).toBe('scan-primary-bed');

    const bathScan = matchScanToScope('Master bath tub-to-shower conversion with porcelain tile');
    expect(bathScan.roomType).toBe('bathroom');
    expect(bathScan.id).toBe('scan-master-bath-alcove');

    const fallbackScan = matchScanToScope('Unspecified general repair');
    expect(fallbackScan.id).toBe(SAMPLE_ROOM_SCANS[0].id);
  });

  it('intelligently targets LiDAR display: promoted for interior trades, collapsed for exterior trades', () => {
    // 1. Exterior trade with exterior scope -> collapsed optional
    const roofingResult = shouldDisplayRoomSpatialScan({
      trade: 'Roofing Contractor',
      scope: 'Tear off architectural shingles and install flashing',
    });
    expect(roofingResult.shouldDisplay).toBe(true);
    expect(roofingResult.isPromoted).toBe(false);

    const landscapingResult = shouldDisplayRoomSpatialScan({
      trade: 'Landscaping & Tree Service',
      scope: 'Sod installation and mulch beds',
    });
    expect(landscapingResult.isPromoted).toBe(false);

    // 2. Exterior trade taking on an interior scope -> promoted!
    const roofingInteriorResult = shouldDisplayRoomSpatialScan({
      trade: 'Roofing Contractor',
      scope: 'Attic drywall repair and master bedroom ceiling paint',
    });
    expect(roofingInteriorResult.isPromoted).toBe(true);
    expect(roofingInteriorResult.recommendedRoomType).toBe('bedroom');

    // 3. Interior trades -> promoted!
    const painterResult = shouldDisplayRoomSpatialScan({
      trade: 'Painting & Drywall LLC',
      scope: 'Interior wall paint',
    });
    expect(painterResult.isPromoted).toBe(true);

    const flooringResult = shouldDisplayRoomSpatialScan({
      trade: 'Hardwood & Tile Flooring',
      scope: 'Tile installation',
    });
    expect(flooringResult.isPromoted).toBe(true);

    // 4. Custom scan attached -> always promoted
    const customScanResult = shouldDisplayRoomSpatialScan({
      trade: 'Roofing',
      scope: 'Roof repair',
      hasCustomScan: true,
    });
    expect(customScanResult.isPromoted).toBe(true);
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

  it('generates standard RFC-compliant CSV for ProDesk / supply house purchasing', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const items = calculateSupplyHousePickList(summary, scan);
    const csv = generateSupplyHouseCsv(scan, items);

    expect(csv).toContain('Category,Item Description,Quantity,Unit,Waste Factor,Notes,Room,Device');
    expect(csv).toContain('Flooring & Tile');
    expect(csv).toContain('Floor Tile / Planks');
    expect(csv).toContain('Trim & Finish Carpentry');
  });

  it('formats trade-specific subcontractor slips for Tile, Paint, and Trim subs', () => {
    const scan = SAMPLE_ROOM_SCANS[0];
    const summary = calculateRoomSummary(scan);
    const items = calculateSupplyHousePickList(summary, scan);

    const tileSlip = formatSubcontractorSlip('tile', scan, summary, items);
    expect(tileSlip).toContain('TILE & WATERPROOFING SUBCONTRACTOR WORK SLIP');
    expect(tileSlip).toContain('Floor Tile Area:         50 sq ft');
    expect(tileSlip).toContain('Wet Wall Alcove Area:');

    const paintSlip = formatSubcontractorSlip('paint', scan, summary, items);
    expect(paintSlip).toContain('DRYWALL & PAINT SUBCONTRACTOR WORK SLIP');
    expect(paintSlip).toContain('Net Paintable Walls:     244 sq ft');

    const trimSlip = formatSubcontractorSlip('trim', scan, summary, items);
    expect(trimSlip).toContain('TRIM & FINISH CARPENTRY SUBCONTRACTOR WORK SLIP');
    expect(trimSlip).toContain('Net Baseboard Perimeter: 27.3 lin ft');
  });

  it('computes 2D wall elevation cutouts and net surface areas', () => {
    const scan = SAMPLE_ROOM_SCANS[0]; // 4 walls, door on wall 2, window on wall 3
    const elevations = getWallElevations(scan);

    expect(elevations).toHaveLength(4);
    expect(elevations[0].label).toBe('North Wall (Vanity & Mirror)');
    expect(elevations[0].openings).toHaveLength(0);

    expect(elevations[2].label).toBe('South Wall (Entry Door)');
    expect(elevations[2].openings).toHaveLength(1);
    expect(elevations[2].openings[0].type).toBe('door');
    expect(elevations[2].netAreaSqFt).toBeLessThan(elevations[2].grossAreaSqFt);

    expect(elevations[3].label).toBe('West Wall (Window & Toilet)');
    expect(elevations[3].openings).toHaveLength(1);
    expect(elevations[3].openings[0].type).toBe('window');

    // Wet wall check for bathroom shower alcove
    expect(elevations[1].isWetWall).toBe(true);
  });

  it('parses valid custom Apple RoomPlan / LiDAR JSON data', () => {
    const rawJson = JSON.stringify({
      title: 'Custom Guest Suite Scan',
      roomType: 'bedroom',
      ceilingHeightInches: 100,
      walls: [
        { id: 'w1', lengthInches: 140, heightInches: 100 },
        { id: 'w2', lengthInches: 120, heightInches: 100 },
        { id: 'w3', lengthInches: 140, heightInches: 100 },
        { id: 'w4', lengthInches: 120, heightInches: 100 },
      ],
      openings: [],
      objects: [],
    });

    const parsed = parseCustomScanJson(rawJson);
    expect(parsed.title).toBe('Custom Guest Suite Scan');
    expect(parsed.roomType).toBe('bedroom');
    expect(parsed.walls).toHaveLength(4);
    expect(parsed.ceilingHeightInches).toBe(100);

    // Throws error on invalid format
    expect(() => parseCustomScanJson('{ invalid json')).toThrow();
    expect(() => parseCustomScanJson('{"title": "Missing walls"}')).toThrow();
  });
});

