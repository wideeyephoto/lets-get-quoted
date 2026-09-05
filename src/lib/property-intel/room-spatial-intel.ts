import { getRoomFloorPolygon, polygonArea, type FloorPoint } from './room-scan-geometry';
export { parseCustomScanJson } from './room-scan-validation';

// 3D Room Spatial Intelligence & LiDAR Geometry Engine
// Uses normalized room geometry for surface takeoffs and supply house pick-lists.

export type RoomOpeningType = 'door' | 'window' | 'opening';

export type RoomOpening = {
  id: string;
  type: RoomOpeningType;
  wallIndex: number;
  widthInches: number;
  heightInches: number;
  offsetInches: number; // offset from wall start
};

export type WallSegment = {
  id: string;
  label: string;
  lengthInches: number;
  heightInches: number;
  isExterior?: boolean;
};

export type RoomObject3D = {
  id: string;
  category: 'bathtub' | 'shower' | 'vanity' | 'toilet' | 'cabinet' | 'appliance' | 'closet';
  label: string;
  dimensionsInches: { width: number; depth: number; height: number };
  position: { x: number; y: number; z: number }; // inches; footprint center X/Z, base elevation Y
};

export type RoomSpatialScan = {
  id: string;
  title: string;
  roomType: 'bathroom' | 'kitchen' | 'bedroom' | 'living' | 'basement' | 'garage';
  scannedAt: string;
  device: string; // e.g. 'iPhone 15 Pro LiDAR · Apple RoomPlan'
  pointCount: number; // e.g. 142000
  confidenceScore: number; // 0-100%
  ceilingHeightInches: number;
  walls: WallSegment[];
  openings: RoomOpening[];
  objects: RoomObject3D[];
  schemaVersion?: 1;
  units?: 'inches';
  floorShape?: 'rectangle';
  floorPolygon?: FloorPoint[];
  rawUsdzUrl?: string;
  rawJsonUrl?: string;
  isSample?: boolean;
};

export type RoomDimensionsSummary = {
  floorAreaSqFt: number;
  perimeterLinearFt: number;
  grossWallAreaSqFt: number;
  openingsAreaSqFt: number;
  netPaintableWallSqFt: number;
  ceilingHeightFt: number;
  primaryAlcoveSpanInches?: number;
  tileAreaSqFt: number; // floor + wet walls for bathroom
  doorsCount: number;
  windowsCount: number;
  baseboardLinearFt: number;
};

export type FlooringFinish = 'tile' | 'hardwood' | 'lvp' | 'carpet';
export type WallFinish = 'paint' | 'drywall_paint' | 'tile_surround';

export type MaterialCostBreakdown = {
  flooringCost: number;
  flooringLabel: string;
  wallCost: number;
  wallLabel: string;
  trimCost: number;
  totalEstimatedTakeoff: number;
};

export const FLOORING_RATES: Record<FlooringFinish, { label: string; ratePerSqFt: number }> = {
  tile: { label: 'Porcelain / Ceramic Tile ($14/sq ft)', ratePerSqFt: 14 },
  hardwood: { label: 'Engineered Hardwood ($11/sq ft)', ratePerSqFt: 11 },
  lvp: { label: 'Luxury Vinyl Plank ($7/sq ft)', ratePerSqFt: 7 },
  carpet: { label: 'Plush Carpet ($5/sq ft)', ratePerSqFt: 5 },
};

export const WALL_RATES: Record<WallFinish, { label: string; ratePerSqFt: number }> = {
  paint: { label: '2-Coat Premium Paint ($1.85/sq ft)', ratePerSqFt: 1.85 },
  drywall_paint: { label: 'Level 4 Drywall & Paint ($4.50/sq ft)', ratePerSqFt: 4.5 },
  tile_surround: { label: 'Full Wet Wall Tile Surround ($28/sq ft)', ratePerSqFt: 28 },
};

export const TRIM_RATE_PER_LF = 6.5; // 5-1/4" Baseboard Trim installed

export type SupplyHouseCategory =
  | 'Flooring & Tile'
  | 'Wet Wall & Waterproofing'
  | 'Paint & Drywall'
  | 'Trim & Finish Carpentry';

export type SupplyHouseItem = {
  category: SupplyHouseCategory;
  name: string;
  quantity: number;
  unit: string;
  wasteFactor: string; // e.g. "10% Cut Waste"
  notes?: string;
};

/**
 * Calculates trade-ready takeoffs (square footage, paintable area, linear trim)
 * from a 3D LiDAR Room Spatial Scan.
 */
export function calculateRoomSummary(scan: RoomSpatialScan): RoomDimensionsSummary {
  const ceilingHeightFt = scan.ceilingHeightInches / 12;

  const floorAreaSqFt = Math.round(polygonArea(getRoomFloorPolygon(scan)) / 144 * 10) / 10;

  const perimeterLinearFt = Math.round(
    (scan.walls.reduce((sum, w) => sum + w.lengthInches, 0) / 12) * 10
  ) / 10;

  // Gross wall surface area
  const grossWallAreaSqFt = Math.round(
    scan.walls.reduce((sum, w) => sum + (w.lengthInches * w.heightInches) / 144, 0)
  );

  // Openings area (doors + windows)
  let openingsAreaSqFt = 0;
  let doorsCount = 0;
  let windowsCount = 0;
  let doorWidthsInches = 0;

  for (const op of scan.openings) {
    const area = (op.widthInches * op.heightInches) / 144;
    openingsAreaSqFt += area;
    if (op.type === 'door' || op.type === 'opening') {
      doorsCount++;
      doorWidthsInches += op.widthInches;
    } else if (op.type === 'window') {
      windowsCount++;
    }
  }
  openingsAreaSqFt = Math.round(openingsAreaSqFt * 10) / 10;

  const netPaintableWallSqFt = Math.max(
    0,
    Math.round(grossWallAreaSqFt - openingsAreaSqFt)
  );

  // Baseboard trim: perimeter minus door opening widths
  const baseboardLinearFt = Math.max(
    0,
    Math.round((perimeterLinearFt - doorWidthsInches / 12) * 10) / 10
  );

  // For bathroom: tile area is floor + shower/tub wet wall surround (~3 walls * 8ft high)
  let tileAreaSqFt = floorAreaSqFt;
  const tubOrShower = scan.objects.find(
    (o) => o.category === 'bathtub' || o.category === 'shower'
  );
  let primaryAlcoveSpanInches: number | undefined;

  if (tubOrShower) {
    primaryAlcoveSpanInches = tubOrShower.dimensionsInches.width;
    const backWallFt = tubOrShower.dimensionsInches.width / 12;
    const sideWallFt = tubOrShower.dimensionsInches.depth / 12;
    const wetWallArea = (backWallFt + 2 * sideWallFt) * (scan.ceilingHeightInches / 12);
    tileAreaSqFt += Math.round(wetWallArea);
  }

  return {
    floorAreaSqFt,
    perimeterLinearFt,
    grossWallAreaSqFt,
    openingsAreaSqFt,
    netPaintableWallSqFt,
    ceilingHeightFt: Math.round(ceilingHeightFt * 10) / 10,
    primaryAlcoveSpanInches,
    tileAreaSqFt: Math.round(tileAreaSqFt),
    doorsCount,
    windowsCount,
    baseboardLinearFt,
  };
}

export type CustomTradeRates = {
  flooringRatePerSqFt?: number;
  wallRatePerSqFt?: number;
  trimRatePerLf?: number;
};

/**
 * Matches a job or lead scope text to the best fitting sample room scan preset.
 */
export function matchScanToScope(
  scope?: string | null,
  scans: RoomSpatialScan[] = SAMPLE_ROOM_SCANS
): RoomSpatialScan {
  if (!scans || scans.length === 0) return SAMPLE_ROOM_SCANS[0];
  const text = (scope ?? '').toLowerCase();

  if (/\b(?:kitchen|island|cook|countertop|range|cabinet|pantry|fridge|sink|hood)\b/i.test(text)) {
    const kitchenScan = scans.find((s) => s.roomType === 'kitchen');
    if (kitchenScan) return kitchenScan;
  }

  if (/\b(?:bed|bedroom|master bed|guest room|hardwood|carpet|closet)\b/i.test(text)) {
    const bedScan = scans.find((s) => s.roomType === 'bedroom');
    if (bedScan) return bedScan;
  }

  if (/\b(?:bath|bathroom|tub|shower|alcove|vanity|toilet|wet wall|tile|tiling)\b/i.test(text)) {
    const bathScan = scans.find((s) => s.roomType === 'bathroom');
    if (bathScan) return bathScan;
  }

  return scans[0];
}

/**
 * Calculates estimated trade material/labor cost from 3D room takeoffs.
 * Supports custom rate overrides from a contractor's price book.
 */
export function calculateMaterialCosts(
  summary: RoomDimensionsSummary,
  flooring: FlooringFinish = 'tile',
  wall: WallFinish = 'paint',
  customRates?: CustomTradeRates
): MaterialCostBreakdown {
  const fRate = FLOORING_RATES[flooring];
  const wRate = WALL_RATES[wall];

  const flooringUnitRate = customRates?.flooringRatePerSqFt ?? fRate.ratePerSqFt;
  const wallUnitRate = customRates?.wallRatePerSqFt ?? wRate.ratePerSqFt;
  const trimUnitRate = customRates?.trimRatePerLf ?? TRIM_RATE_PER_LF;

  const flooringCost = Math.round(summary.floorAreaSqFt * flooringUnitRate);
  const wallTargetSqFt =
    wall === 'tile_surround' ? summary.tileAreaSqFt : summary.netPaintableWallSqFt;
  const wallCost = Math.round(wallTargetSqFt * wallUnitRate);
  const trimCost = Math.round(summary.baseboardLinearFt * trimUnitRate);

  const flooringLabel =
    customRates?.flooringRatePerSqFt != null
      ? `${fRate.label.split(' (')[0]} ($${flooringUnitRate}/sq ft Custom)`
      : fRate.label;

  const wallLabel =
    customRates?.wallRatePerSqFt != null
      ? `${wRate.label.split(' (')[0]} ($${wallUnitRate}/sq ft Custom)`
      : wRate.label;

  return {
    flooringCost,
    flooringLabel,
    wallCost,
    wallLabel,
    trimCost,
    totalEstimatedTakeoff: flooringCost + wallCost + trimCost,
  };
}

/**
 * Converts 3D Room Spatial Takeoffs into vendor-ready supply house ordering units.
 * Applies industry-standard 10-15% cut waste factors.
 */
export function calculateSupplyHousePickList(
  summary: RoomDimensionsSummary,
  _scan?: RoomSpatialScan
): SupplyHouseItem[] {
  const items: SupplyHouseItem[] = [];

  // 1. Flooring & Tile
  const floorTileBoxes = Math.ceil((summary.floorAreaSqFt * 1.1) / 20); // 20 sq ft per box, 10% waste
  items.push({
    category: 'Flooring & Tile',
    name: 'Floor Tile / Planks (20 sq ft/box)',
    quantity: floorTileBoxes,
    unit: 'boxes',
    wasteFactor: '+10% Cut Waste',
    notes: `Covers ${summary.floorAreaSqFt} sq ft actual area`,
  });

  const thinsetBags = Math.ceil(summary.floorAreaSqFt / 45);
  items.push({
    category: 'Flooring & Tile',
    name: 'Polymer-Modified Thinset Mortar (50 lb)',
    quantity: thinsetBags,
    unit: 'bags',
    wasteFactor: 'Standard Spread',
    notes: '45-50 sq ft coverage per bag with 1/2" notch',
  });

  const groutBags = Math.max(1, Math.ceil(summary.floorAreaSqFt / 100));
  items.push({
    category: 'Flooring & Tile',
    name: 'All-in-One Grout (25 lb)',
    quantity: groutBags,
    unit: 'bags',
    wasteFactor: 'Standard Joint',
    notes: '1/8" to 1/4" joint width',
  });

  // 2. Wet Walls & Waterproofing (if bath/shower detected)
  const wetWallSqFt = summary.tileAreaSqFt - summary.floorAreaSqFt;
  if (wetWallSqFt > 0) {
    const wetWallBoxes = Math.ceil((wetWallSqFt * 1.15) / 15); // 15 sq ft/box, 15% cut waste for wet walls
    items.push({
      category: 'Wet Wall & Waterproofing',
      name: 'Shower Wet Wall Surround Tile (15 sq ft/box)',
      quantity: wetWallBoxes,
      unit: 'boxes',
      wasteFactor: '+15% Wet Miter Waste',
      notes: `Covers ${wetWallSqFt} sq ft shower/tub alcove surround`,
    });

    const backerboardSheets = Math.ceil(wetWallSqFt / 15); // 3x5 ft = 15 sq ft
    items.push({
      category: 'Wet Wall & Waterproofing',
      name: '1/2" Cement Backerboard (3ft x 5ft)',
      quantity: backerboardSheets,
      unit: 'sheets',
      wasteFactor: 'Corner Overlap',
      notes: 'For wet area framing backing',
    });

    const waterproofingBuckets = Math.max(1, Math.ceil(wetWallSqFt / 100));
    items.push({
      category: 'Wet Wall & Waterproofing',
      name: 'Liquid Waterproofing Membrane (1 Gallon)',
      quantity: waterproofingBuckets,
      unit: 'buckets',
      wasteFactor: '2 Heavy Coats',
      notes: 'Continuous vapor & water barrier',
    });
  }

  // 3. Paint & Drywall
  const primerGallons = Math.max(1, Math.ceil(summary.netPaintableWallSqFt / 350));
  items.push({
    category: 'Paint & Drywall',
    name: 'PVA Drywall / Stain-Blocking Primer',
    quantity: primerGallons,
    unit: 'gal',
    wasteFactor: '1 Solid Coat',
    notes: `Covers ${summary.netPaintableWallSqFt} sq ft paintable walls`,
  });

  const paintGallons = Math.max(1, Math.ceil((summary.netPaintableWallSqFt * 2) / 350));
  items.push({
    category: 'Paint & Drywall',
    name: 'Premium Interior Finish Paint',
    quantity: paintGallons,
    unit: 'gal',
    wasteFactor: '2 Top Coats',
    notes: 'Eggshell / Satin washable finish',
  });

  const tapeRolls = Math.max(1, Math.ceil(summary.perimeterLinearFt / 60));
  items.push({
    category: 'Paint & Drywall',
    name: '1.5" Painter\'s Clean-Release Tape (60 yd)',
    quantity: tapeRolls,
    unit: 'rolls',
    wasteFactor: 'Trim & Ceiling Line',
    notes: 'Edge masking',
  });

  // 4. Trim & Finish Carpentry
  const baseboardSticks = Math.ceil((summary.baseboardLinearFt * 1.1) / 8); // 8-ft sticks, 10% miter waste
  items.push({
    category: 'Trim & Finish Carpentry',
    name: '5-1/4" Primed Baseboard Molding (8-ft Stick)',
    quantity: baseboardSticks,
    unit: 'pieces',
    wasteFactor: '+10% Miter Cut Waste',
    notes: `Covers ${summary.baseboardLinearFt} LF net perimeter (${summary.doorsCount} doors deducted)`,
  });

  const caulkTubes = Math.max(1, Math.ceil(summary.baseboardLinearFt / 30));
  items.push({
    category: 'Trim & Finish Carpentry',
    name: 'Painter\'s Acrylic Siliconized Caulk (10.1 oz)',
    quantity: caulkTubes,
    unit: 'tubes',
    wasteFactor: 'Baseboard & Casing',
    notes: 'Top edge and inside corner sealing',
  });

  return items;
}

/**
 * Formats a clean supply house pick-list text order for clipboard copying.
 */
export function formatSupplyHousePickListText(
  scan: RoomSpatialScan,
  items: SupplyHouseItem[]
): string {
  const lines = [
    `══════════════════════════════════════════════════════`,
    `  SUPPLY HOUSE ORDER PICK-LIST — ${scan.title.toUpperCase()}`,
    `══════════════════════════════════════════════════════`,
    `Source: ${scan.device} (${scan.pointCount.toLocaleString()} pts)`,
    `Date: ${scan.scannedAt}`,
    ``,
  ];

  const grouped: Record<string, SupplyHouseItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  for (const [cat, catItems] of Object.entries(grouped)) {
    lines.push(`[${cat.toUpperCase()}]`);
    for (const it of catItems) {
      lines.push(` • ${it.quantity} ${it.unit} — ${it.name} (${it.wasteFactor})`);
      if (it.notes) lines.push(`     Note: ${it.notes}`);
    }
    lines.push(``);
  }

  lines.push(`══════════════════════════════════════════════════════`);
  return lines.join('\n');
}

/**
 * Formats a clean text bill-of-materials summary for clipboard or report exports.
 */
export function formatSpatialTakeoffReport(
  scan: RoomSpatialScan,
  summary: RoomDimensionsSummary,
  costs?: MaterialCostBreakdown
): string {
  const isSample = Boolean(scan.isSample);
  const lines = [
    `══════════════════════════════════════════════════════`,
    `  3D LiDAR SPATIAL TAKEOFF REPORT — ${scan.title.toUpperCase()}${isSample ? ' [SAMPLE DEMO]' : ''}`,
    `══════════════════════════════════════════════════════`,
    `Device: ${scan.device}`,
    `Source confidence: ${scan.confidenceScore || 'Not provided'}${scan.confidenceScore ? '% (not an accuracy guarantee)' : ''}`,
    `Source point count: ${scan.pointCount || 'Not provided'}`,
    `Date: ${scan.scannedAt}`,
    ``,
    `Imported dimensions; confirm critical spans on site before ordering.`,
    `DIMENSIONS & TAKEOFF QUANTITIES:`,
    ` • Floor Surface Area:      ${summary.floorAreaSqFt} sq ft`,
    ` • Room Perimeter:           ${summary.perimeterLinearFt} lin ft`,
    ` • Ceiling Height:           ${summary.ceilingHeightFt} ft (${scan.ceilingHeightInches}")`,
    ` • Net Paintable Walls:      ${summary.netPaintableWallSqFt} sq ft (excl. ${summary.openingsAreaSqFt} sq ft openings)`,
    ` • Openings Count:           ${summary.doorsCount} doors, ${summary.windowsCount} windows`,
    ` • Baseboard Trim:           ${summary.baseboardLinearFt} lin ft`,
  ];

  if (summary.primaryAlcoveSpanInches) {
    lines.push(` • Shower/Tub Alcove Span:   ${summary.primaryAlcoveSpanInches.toFixed(1)}"`);
    lines.push(` • Estimated Tile Area:      ${summary.tileAreaSqFt} sq ft (floor + assumed three-sided surround)`);
  }

  if (costs) {
    lines.push(
      ``,
      `TRADE MATERIAL & LABOR ESTIMATES:`,
      ` • Flooring: $${costs.flooringCost.toLocaleString()} (${costs.flooringLabel})`,
      ` • Wall Finish: $${costs.wallCost.toLocaleString()} (${costs.wallLabel})`,
      ` • Baseboard Trim: $${costs.trimCost.toLocaleString()} ($${TRIM_RATE_PER_LF}/LF)`,
      `──────────────────────────────────────────────────────`,
      ` TOTAL ESTIMATED TAKEOFF: $${costs.totalEstimatedTakeoff.toLocaleString()}`
    );
  }

  if (isSample) {
    lines.push(
      ``,
      `*Notice & Verification: Generated from a sample CAD template for interactive demonstration. All dimensions must be physically verified on site before ordering materials or finalizing contracts.*`
    );
  }

  lines.push(`══════════════════════════════════════════════════════`);
  return lines.join('\n');
}

/**
 * Generates an RFC-compliant CSV formatted for direct upload into ProDesk / supply house carts.
 */
export function generateSupplyHouseCsv(
  scan: RoomSpatialScan,
  items: SupplyHouseItem[]
): string {
  const headers = ['Category', 'Item Description', 'Quantity', 'Unit', 'Waste Factor', 'Notes', 'Room', 'Device'];
  const rows = items.map((it) => [
    `"${it.category.replace(/"/g, '""')}"`,
    `"${it.name.replace(/"/g, '""')}"`,
    it.quantity,
    `"${it.unit.replace(/"/g, '""')}"`,
    `"${it.wasteFactor.replace(/"/g, '""')}"`,
    `"${(it.notes ?? '').replace(/"/g, '""')}"`,
    `"${scan.title.replace(/"/g, '""')}${scan.isSample ? ' (Sample Template)' : ''}"`,
    `"${scan.device.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export type SubcontractorTrade = 'tile' | 'paint' | 'trim';

/**
 * Formats a trade-specific work order / takeoff slip for individual subcontractors.
 */
export function formatSubcontractorSlip(
  trade: SubcontractorTrade,
  scan: RoomSpatialScan,
  summary: RoomDimensionsSummary,
  items: SupplyHouseItem[],
  annotatedPhotoUrls?: string[]
): string {
  const dateStr = scan.scannedAt;
  const isSample = Boolean(scan.isSample);
  const photoSection =
    annotatedPhotoUrls && annotatedPhotoUrls.length > 0
      ? [
          ``,
          `SITE MARKUP & INSPECTION PHOTOS:`,
          ...annotatedPhotoUrls.map((url, idx) => ` • Inspection Markup #${idx + 1}: ${url}`),
        ]
      : [];

  if (trade === 'tile') {
    const tileItems = items.filter(
      (i) => i.category === 'Flooring & Tile' || i.category === 'Wet Wall & Waterproofing'
    );
    const lines = [
      `══════════════════════════════════════════════════════`,
      `  TILE & WATERPROOFING SUBCONTRACTOR WORK SLIP${isSample ? ' [SAMPLE DEMO]' : ''}`,
      `══════════════════════════════════════════════════════`,
      `Job / Room: ${scan.title}`,
      `Scan Source: ${scan.device} · Precision: ${scan.confidenceScore}%`,
      `Date: ${dateStr}`,
      ``,
      `SCOPE & TAKEOFF QUANTITIES:`,
      ` • Floor Tile Area:         ${summary.floorAreaSqFt} sq ft`,
      ` • Wet Wall Alcove Area:    ${summary.tileAreaSqFt - summary.floorAreaSqFt} sq ft`,
      ` • Total Tile Surface:      ${summary.tileAreaSqFt} sq ft`,
    ];
    if (summary.primaryAlcoveSpanInches) {
      lines.push(` • Shower / Alcove Span:    ${summary.primaryAlcoveSpanInches.toFixed(1)}"`);
    }
    lines.push(``, `ORDERED MATERIALS SCHEDULE:`);
    for (const it of tileItems) {
      lines.push(` • ${it.quantity} ${it.unit} — ${it.name} (${it.wasteFactor})`);
      if (it.notes) lines.push(`     Spec: ${it.notes}`);
    }
    lines.push(...photoSection);
    if (isSample) {
      lines.push(``, `*Notice: Generated from sample CAD reference template. Verify on-site before performing work.*`);
    }
    lines.push(`══════════════════════════════════════════════════════`);
    return lines.join('\n');
  }

  if (trade === 'paint') {
    const paintItems = items.filter((i) => i.category === 'Paint & Drywall');
    const lines = [
      `══════════════════════════════════════════════════════`,
      `  DRYWALL & PAINT SUBCONTRACTOR WORK SLIP${isSample ? ' [SAMPLE DEMO]' : ''}`,
      `══════════════════════════════════════════════════════`,
      `Job / Room: ${scan.title}`,
      `Scan Source: ${scan.device} · Precision: ${scan.confidenceScore}%`,
      `Date: ${dateStr}`,
      ``,
      `SCOPE & TAKEOFF QUANTITIES:`,
      ` • Net Paintable Walls:     ${summary.netPaintableWallSqFt} sq ft`,
      ` • Gross Wall Surface:      ${summary.grossWallAreaSqFt} sq ft`,
      ` • Cutouts Deducted:        ${summary.openingsAreaSqFt} sq ft (${summary.doorsCount} doors, ${summary.windowsCount} windows)`,
      ` • Ceiling Height:          ${summary.ceilingHeightFt} ft (${scan.ceilingHeightInches}")`,
      ` • Room Perimeter:          ${summary.perimeterLinearFt} lin ft`,
      ``,
      `ORDERED MATERIALS SCHEDULE:`,
    ];
    for (const it of paintItems) {
      lines.push(` • ${it.quantity} ${it.unit} — ${it.name} (${it.wasteFactor})`);
      if (it.notes) lines.push(`     Spec: ${it.notes}`);
    }
    lines.push(...photoSection);
    if (isSample) {
      lines.push(``, `*Notice: Generated from sample CAD reference template. Verify on-site before performing work.*`);
    }
    lines.push(`══════════════════════════════════════════════════════`);
    return lines.join('\n');
  }

  // Trim carpentry
  const trimItems = items.filter((i) => i.category === 'Trim & Finish Carpentry');
  const lines = [
    `══════════════════════════════════════════════════════`,
    `  TRIM & FINISH CARPENTRY SUBCONTRACTOR WORK SLIP${isSample ? ' [SAMPLE DEMO]' : ''}`,
    `══════════════════════════════════════════════════════`,
    `Job / Room: ${scan.title}`,
    `Scan Source: ${scan.device} · Precision: ${scan.confidenceScore}%`,
    `Date: ${dateStr}`,
    ``,
    `SCOPE & TAKEOFF QUANTITIES:`,
    ` • Net Baseboard Perimeter: ${summary.baseboardLinearFt} lin ft`,
    ` • Gross Room Perimeter:    ${summary.perimeterLinearFt} lin ft`,
    ` • Door Openings Deducted:  ${summary.doorsCount} doors`,
    ``,
    `ORDERED MATERIALS SCHEDULE:`,
  ];
  for (const it of trimItems) {
    lines.push(` • ${it.quantity} ${it.unit} — ${it.name} (${it.wasteFactor})`);
    if (it.notes) lines.push(`     Spec: ${it.notes}`);
  }
  lines.push(...photoSection);
  if (isSample) {
    lines.push(``, `*Notice: Generated from sample CAD reference template. Verify on-site before performing work.*`);
  }
  lines.push(`══════════════════════════════════════════════════════`);
  return lines.join('\n');
}

export type WallElevation = {
  wallIndex: number;
  id: string;
  label: string;
  lengthInches: number;
  heightInches: number;
  lengthFt: number;
  heightFt: number;
  openings: RoomOpening[];
  grossAreaSqFt: number;
  netAreaSqFt: number;
  isWetWall: boolean;
};

/**
 * Computes individual 2D elevation profiles for each wall in the room.
 */
export function getWallElevations(scan: RoomSpatialScan): WallElevation[] {
  const hasTubOrShower = scan.objects.some(
    (o) => o.category === 'bathtub' || o.category === 'shower'
  );

  return scan.walls.map((w, idx) => {
    const wallOpenings = scan.openings.filter((op) => op.wallIndex === idx);
    const grossAreaSqFt = Math.round((w.lengthInches * w.heightInches) / 144);
    const openingsArea = wallOpenings.reduce(
      (sum, op) => sum + (op.widthInches * op.heightInches) / 144,
      0
    );
    const netAreaSqFt = Math.max(0, Math.round(grossAreaSqFt - openingsArea));
    const isWetWall = hasTubOrShower && (idx === 1 || /shower|alcove|tub|bath/i.test(w.label));

    return {
      wallIndex: idx,
      id: w.id,
      label: w.label,
      lengthInches: w.lengthInches,
      heightInches: w.heightInches,
      lengthFt: Math.round((w.lengthInches / 12) * 10) / 10,
      heightFt: Math.round((w.heightInches / 12) * 10) / 10,
      openings: wallOpenings,
      grossAreaSqFt,
      netAreaSqFt,
      isWetWall,
    };
  });
}

/**
 * Pre-built sample LiDAR scans for immediate interactive testing & demonstration.
 */
export const SAMPLE_ROOM_SCANS: RoomSpatialScan[] = [
  {
    id: 'scan-master-bath-alcove',
    title: 'Master Bathroom (Tub-to-Shower Alcove)',
    roomType: 'bathroom',
    scannedAt: 'Sample Reference Model',
    device: 'Sample Demo CAD Model (iPhone 15 Pro RoomPlan Profile)',
    pointCount: 148500,
    confidenceScore: 99.4,
    ceilingHeightInches: 108, // 9ft ceiling
    isSample: true,
    walls: [
      { id: 'w1', label: 'North Wall (Vanity & Mirror)', lengthInches: 120, heightInches: 108 },
      { id: 'w2', label: 'East Wall (Shower Alcove)', lengthInches: 60, heightInches: 108 },
      { id: 'w3', label: 'South Wall (Entry Door)', lengthInches: 120, heightInches: 108 },
      { id: 'w4', label: 'West Wall (Window & Toilet)', lengthInches: 60, heightInches: 108 },
    ],
    openings: [
      { id: 'op-door', type: 'door', wallIndex: 2, widthInches: 32, heightInches: 80, offsetInches: 24 },
      { id: 'op-win', type: 'window', wallIndex: 3, widthInches: 28, heightInches: 42, offsetInches: 16 },
    ],
    objects: [
      {
        id: 'obj-shower',
        category: 'bathtub',
        label: 'Tub Alcove (60.0" Span)',
        dimensionsInches: { width: 60, depth: 32, height: 18 },
        position: { x: 0, y: 0, z: 0 },
      },
      {
        id: 'obj-vanity',
        category: 'vanity',
        label: 'Double Sink Vanity',
        dimensionsInches: { width: 60, depth: 22, height: 34 },
        position: { x: 30, y: 0, z: 0 },
      },
    ],
  },
  {
    id: 'scan-kitchen-alcove',
    title: 'Kitchen & Island Remodel',
    roomType: 'kitchen',
    scannedAt: 'Sample Reference Model',
    device: 'Sample Demo CAD Model (iPad Pro M4 Profile)',
    pointCount: 286000,
    confidenceScore: 98.8,
    ceilingHeightInches: 120, // 10ft ceiling
    isSample: true,
    walls: [
      { id: 'w1', label: 'North Wall (Range & Hood)', lengthInches: 180, heightInches: 120 },
      { id: 'w2', label: 'East Wall (Pantry & Fridge)', lengthInches: 144, heightInches: 120 },
      { id: 'w3', label: 'South Wall (Open Concept)', lengthInches: 180, heightInches: 120 },
      { id: 'w4', label: 'West Wall (Sink & Window)', lengthInches: 144, heightInches: 120 },
    ],
    openings: [
      { id: 'op-open', type: 'opening', wallIndex: 2, widthInches: 72, heightInches: 96, offsetInches: 40 },
      { id: 'op-win', type: 'window', wallIndex: 3, widthInches: 48, heightInches: 48, offsetInches: 36 },
    ],
    objects: [
      {
        id: 'obj-island',
        category: 'cabinet',
        label: 'Kitchen Center Island',
        dimensionsInches: { width: 84, depth: 42, height: 36 },
        position: { x: 0, y: 0, z: 0 },
      },
    ],
  },
  {
    id: 'scan-primary-bed',
    title: 'Primary Bedroom (Hardwood Flooring Takeoff)',
    roomType: 'bedroom',
    scannedAt: 'Sample Reference Model',
    device: 'Sample Demo CAD Model (iPhone 14 Pro Profile)',
    pointCount: 195000,
    confidenceScore: 99.1,
    ceilingHeightInches: 96, // 8ft ceiling
    isSample: true,
    walls: [
      { id: 'w1', label: 'North Wall', lengthInches: 168, heightInches: 96 },
      { id: 'w2', label: 'East Wall (Closet)', lengthInches: 144, heightInches: 96 },
      { id: 'w3', label: 'South Wall (Entry)', lengthInches: 168, heightInches: 96 },
      { id: 'w4', label: 'West Wall (Double Window)', lengthInches: 144, heightInches: 96 },
    ],
    openings: [
      { id: 'op-door', type: 'door', wallIndex: 2, widthInches: 36, heightInches: 80, offsetInches: 20 },
      { id: 'op-win1', type: 'window', wallIndex: 3, widthInches: 36, heightInches: 60, offsetInches: 18 },
      { id: 'op-win2', type: 'window', wallIndex: 3, widthInches: 36, heightInches: 60, offsetInches: 72 },
    ],
    objects: [],
  },
];
