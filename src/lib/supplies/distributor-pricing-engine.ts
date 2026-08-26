export type SupplyDistributorKey =
  | 'abc_supply'
  | 'beacon_pro'
  | 'ferguson'
  | 'srs_distribution'
  | 'home_depot_pro';

export type SupplyDistributor = {
  key: SupplyDistributorKey;
  name: string;
  shortCode: string;
  portalUrl: string;
  supportedTrades: Array<'roofing' | 'siding' | 'gutters' | 'electrical' | 'mechanical' | 'plumbing'>;
  features: {
    liveOrderPlacement: boolean;
    rooftopDropAvailable: boolean;
    willCallPickup: boolean;
    creditLineSync: boolean;
  };
};

export const DISTRIBUTORS: Record<SupplyDistributorKey, SupplyDistributor> = {
  abc_supply: {
    key: 'abc_supply',
    name: 'ABC Supply Co., Inc.',
    shortCode: 'ABC',
    portalUrl: 'https://myabcsupply.com',
    supportedTrades: ['roofing', 'siding', 'gutters'],
    features: {
      liveOrderPlacement: true,
      rooftopDropAvailable: true,
      willCallPickup: true,
      creditLineSync: true,
    },
  },
  beacon_pro: {
    key: 'beacon_pro',
    name: 'Beacon Building Products (Beacon PRO+)',
    shortCode: 'BECN',
    portalUrl: 'https://proplus.becn.com',
    supportedTrades: ['roofing', 'siding', 'gutters'],
    features: {
      liveOrderPlacement: true,
      rooftopDropAvailable: true,
      willCallPickup: true,
      creditLineSync: true,
    },
  },
  ferguson: {
    key: 'ferguson',
    name: 'Ferguson Enterprises',
    shortCode: 'FERG',
    portalUrl: 'https://www.ferguson.com',
    supportedTrades: ['plumbing', 'mechanical', 'electrical'],
    features: {
      liveOrderPlacement: true,
      rooftopDropAvailable: false,
      willCallPickup: true,
      creditLineSync: true,
    },
  },
  srs_distribution: {
    key: 'srs_distribution',
    name: 'SRS Distribution Inc. (Roof Hub)',
    shortCode: 'SRS',
    portalUrl: 'https://roofhub.pro',
    supportedTrades: ['roofing', 'siding'],
    features: {
      liveOrderPlacement: true,
      rooftopDropAvailable: true,
      willCallPickup: true,
      creditLineSync: true,
    },
  },
  home_depot_pro: {
    key: 'home_depot_pro',
    name: 'The Home Depot Pro Direct',
    shortCode: 'HDP',
    portalUrl: 'https://www.homedepot.com/pro',
    supportedTrades: ['roofing', 'siding', 'gutters', 'electrical', 'mechanical', 'plumbing'],
    features: {
      liveOrderPlacement: true,
      rooftopDropAvailable: false,
      willCallPickup: true,
      creditLineSync: false,
    },
  },
};

export type CatalogMaterialItem = {
  sku: string;
  name: string;
  manufacturer: string;
  unit: 'bundle' | 'roll' | 'piece' | 'box' | 'each' | 'linear_ft';
  coveragePerUnit: string;
  wholesaleUnitPrice: number;
  retailSuggestedPrice: number;
  distributorKey: SupplyDistributorKey;
  trade: 'roofing' | 'siding' | 'gutters' | 'electrical' | 'mechanical' | 'plumbing';
};

export const WHOLESALE_MATERIAL_CATALOG: CatalogMaterialItem[] = [
  // Roofing Materials - ABC Supply & Beacon PRO+
  {
    sku: 'GAF-HDZ-CHESTNUT',
    name: 'GAF Timberline HDZ Architectural Shingles - Charcoal / Weathered Wood',
    manufacturer: 'GAF',
    unit: 'bundle',
    coveragePerUnit: '33.3 sq ft (3 bundles/square)',
    wholesaleUnitPrice: 38.50,
    retailSuggestedPrice: 48.00,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'OC-DURATION-ESTATE',
    name: 'Owens Corning TruDefinition Duration Architectural Shingles - Onyx Black / Driftwood',
    manufacturer: 'Owens Corning',
    unit: 'bundle',
    coveragePerUnit: '32.8 sq ft (3 bundles/square)',
    wholesaleUnitPrice: 39.25,
    retailSuggestedPrice: 49.50,
    distributorKey: 'beacon_pro',
    trade: 'roofing',
  },
  {
    sku: 'GAF-FELTBUSTER-10SQ',
    name: 'GAF FeltBuster High-Traction Synthetic Roof Underlayment (10 Sq Roll)',
    manufacturer: 'GAF',
    unit: 'roll',
    coveragePerUnit: '1,000 sq ft (10 squares)',
    wholesaleUnitPrice: 88.00,
    retailSuggestedPrice: 118.00,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'GAF-WEATHERWATCH-2SQ',
    name: 'GAF WeatherWatch Mineral-Surfaced Self-Adhering Ice & Water Barrier (2 Sq Roll)',
    manufacturer: 'GAF',
    unit: 'roll',
    coveragePerUnit: '200 sq ft (2 squares)',
    wholesaleUnitPrice: 74.50,
    retailSuggestedPrice: 99.00,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'DRIP-EDGE-T-10FT-WHT',
    name: 'Aluminum T-Style Drip Edge Flashing (1.5" x 1.5" x 10 ft)',
    manufacturer: 'Quality Aluminum Products',
    unit: 'piece',
    coveragePerUnit: '10 linear feet',
    wholesaleUnitPrice: 6.80,
    retailSuggestedPrice: 9.95,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'GAF-PROSTART-STARTER',
    name: 'GAF Pro-Start Eave / Rake Universal Starter Strip Shingles',
    manufacturer: 'GAF',
    unit: 'bundle',
    coveragePerUnit: '120.33 linear feet',
    wholesaleUnitPrice: 48.00,
    retailSuggestedPrice: 62.00,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'GAF-TIMBERTEX-RIDGE',
    name: 'GAF Timbertex Premium Double-Layer Hip & Ridge Shingles',
    manufacturer: 'GAF',
    unit: 'bundle',
    coveragePerUnit: '20 linear feet',
    wholesaleUnitPrice: 62.00,
    retailSuggestedPrice: 79.50,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },
  {
    sku: 'NAILS-EG-COIL-1.25',
    name: 'Grip-Rite 1-1/4" Electro-Galvanized Coil Roofing Nails (7,200 ct Box)',
    manufacturer: 'Grip-Rite',
    unit: 'box',
    coveragePerUnit: 'Fastens approx 25-30 squares',
    wholesaleUnitPrice: 49.00,
    retailSuggestedPrice: 66.00,
    distributorKey: 'beacon_pro',
    trade: 'roofing',
  },
  {
    sku: 'PIPE-BOOT-FLASHING-3IN',
    name: 'Oatey Master Flash All-Flash Flexible Roof Pipe Flashing Boot (1.5" - 3")',
    manufacturer: 'Oatey',
    unit: 'piece',
    coveragePerUnit: '1 plumbing vent pipe penetration',
    wholesaleUnitPrice: 14.50,
    retailSuggestedPrice: 22.00,
    distributorKey: 'abc_supply',
    trade: 'roofing',
  },

  // Plumbing Materials - Ferguson
  {
    sku: 'RHEEM-PROG50-40N',
    name: 'Rheem Professional Classic Plus 50-Gal Natural Gas Water Heater (40k BTU)',
    manufacturer: 'Rheem',
    unit: 'each',
    coveragePerUnit: 'Complete residential replacement unit',
    wholesaleUnitPrice: 685.00,
    retailSuggestedPrice: 945.00,
    distributorKey: 'ferguson',
    trade: 'plumbing',
  },
  {
    sku: 'EXPANSION-TANK-THERMAL-2GAL',
    name: 'Amtrol Therm-X-Trol ST-5 2.1 Gallon Potable Water Thermal Expansion Tank',
    manufacturer: 'Amtrol',
    unit: 'each',
    coveragePerUnit: '1 water heater protection',
    wholesaleUnitPrice: 58.00,
    retailSuggestedPrice: 85.00,
    distributorKey: 'ferguson',
    trade: 'plumbing',
  },

  // Electrical Materials - Ferguson / Home Depot Pro
  {
    sku: 'SQD-HOM4080M200PC',
    name: 'Square D Homeline 200A 40-Space 80-Circuit Indoor Main Breaker Load Center',
    manufacturer: 'Schneider Electric',
    unit: 'each',
    coveragePerUnit: 'Main residential service panel',
    wholesaleUnitPrice: 245.00,
    retailSuggestedPrice: 330.00,
    distributorKey: 'ferguson',
    trade: 'electrical',
  },
  {
    sku: 'NEMA-14-50R-EV-OUTLET',
    name: 'Hubbell 50A 125/250V Flush Heavy-Duty EV Charger Receptacle (NEMA 14-50R)',
    manufacturer: 'Hubbell',
    unit: 'each',
    coveragePerUnit: 'Level 2 EV charging receptacle',
    wholesaleUnitPrice: 72.00,
    retailSuggestedPrice: 105.00,
    distributorKey: 'home_depot_pro',
    trade: 'electrical',
  },
];

export type BillOfMaterialsItem = {
  sku: string;
  name: string;
  manufacturer: string;
  quantity: number;
  unit: string;
  wholesaleUnitPrice: number;
  extendedWholesalePrice: number;
  retailUnitPrice: number;
  extendedRetailPrice: number;
  distributorKey: SupplyDistributorKey;
};

export type BillOfMaterials = {
  trade: string;
  squaresOrUnits: number;
  distributor: SupplyDistributor;
  items: BillOfMaterialsItem[];
  totals: {
    totalWholesaleCost: number;
    totalRetailValuation: number;
    estimatedContractorGrossMargin: number;
    grossMarginPercent: number;
  };
};

/**
 * Calculates a complete Bill of Materials (BOM) for a project given trade, squares, and distributor.
 */
export function calculateBillOfMaterials(
  trade: 'roofing' | 'siding' | 'gutters' | 'electrical' | 'mechanical' | 'plumbing',
  squaresOrUnits: number,
  distributorKey: SupplyDistributorKey = 'abc_supply',
): BillOfMaterials {
  const distributor = DISTRIBUTORS[distributorKey] || DISTRIBUTORS.abc_supply;
  const items: BillOfMaterialsItem[] = [];

  if (trade === 'roofing') {
    const grossSquares = Math.max(1, squaresOrUnits);
    const bundleQuantity = Math.ceil(grossSquares * 3);
    const underlaymentRolls = Math.ceil(grossSquares / 10);
    const iceAndWaterRolls = Math.max(1, Math.ceil(grossSquares * 0.15));
    const starterBundles = Math.max(1, Math.ceil(grossSquares * 0.1));
    const ridgeBundles = Math.max(1, Math.ceil(grossSquares * 0.12));
    const dripEdgePieces = Math.ceil(grossSquares * 1.5);
    const nailBoxes = Math.max(1, Math.ceil(grossSquares / 25));
    const pipeBoots = 3;

    const definitions = [
      { sku: 'GAF-HDZ-CHESTNUT', qty: bundleQuantity },
      { sku: 'GAF-FELTBUSTER-10SQ', qty: underlaymentRolls },
      { sku: 'GAF-WEATHERWATCH-2SQ', qty: iceAndWaterRolls },
      { sku: 'GAF-PROSTART-STARTER', qty: starterBundles },
      { sku: 'GAF-TIMBERTEX-RIDGE', qty: ridgeBundles },
      { sku: 'DRIP-EDGE-T-10FT-WHT', qty: dripEdgePieces },
      { sku: 'NAILS-EG-COIL-1.25', qty: nailBoxes },
      { sku: 'PIPE-BOOT-FLASHING-3IN', qty: pipeBoots },
    ];

    for (const def of definitions) {
      const catalogItem = WHOLESALE_MATERIAL_CATALOG.find((c) => c.sku === def.sku);
      if (catalogItem) {
        items.push({
          sku: catalogItem.sku,
          name: catalogItem.name,
          manufacturer: catalogItem.manufacturer,
          quantity: def.qty,
          unit: catalogItem.unit,
          wholesaleUnitPrice: catalogItem.wholesaleUnitPrice,
          extendedWholesalePrice: Math.round(catalogItem.wholesaleUnitPrice * def.qty * 100) / 100,
          retailUnitPrice: catalogItem.retailSuggestedPrice,
          extendedRetailPrice: Math.round(catalogItem.retailSuggestedPrice * def.qty * 100) / 100,
          distributorKey,
        });
      }
    }
  } else if (trade === 'plumbing') {
    const definitions = [
      { sku: 'RHEEM-PROG50-40N', qty: 1 },
      { sku: 'EXPANSION-TANK-THERMAL-2GAL', qty: 1 },
    ];

    for (const def of definitions) {
      const catalogItem = WHOLESALE_MATERIAL_CATALOG.find((c) => c.sku === def.sku);
      if (catalogItem) {
        items.push({
          sku: catalogItem.sku,
          name: catalogItem.name,
          manufacturer: catalogItem.manufacturer,
          quantity: def.qty,
          unit: catalogItem.unit,
          wholesaleUnitPrice: catalogItem.wholesaleUnitPrice,
          extendedWholesalePrice: Math.round(catalogItem.wholesaleUnitPrice * def.qty * 100) / 100,
          retailUnitPrice: catalogItem.retailSuggestedPrice,
          extendedRetailPrice: Math.round(catalogItem.retailSuggestedPrice * def.qty * 100) / 100,
          distributorKey: 'ferguson',
        });
      }
    }
  } else if (trade === 'electrical') {
    const definitions = [
      { sku: 'SQD-HOM4080M200PC', qty: 1 },
      { sku: 'NEMA-14-50R-EV-OUTLET', qty: 1 },
    ];

    for (const def of definitions) {
      const catalogItem = WHOLESALE_MATERIAL_CATALOG.find((c) => c.sku === def.sku);
      if (catalogItem) {
        items.push({
          sku: catalogItem.sku,
          name: catalogItem.name,
          manufacturer: catalogItem.manufacturer,
          quantity: def.qty,
          unit: catalogItem.unit,
          wholesaleUnitPrice: catalogItem.wholesaleUnitPrice,
          extendedWholesalePrice: Math.round(catalogItem.wholesaleUnitPrice * def.qty * 100) / 100,
          retailUnitPrice: catalogItem.retailSuggestedPrice,
          extendedRetailPrice: Math.round(catalogItem.retailSuggestedPrice * def.qty * 100) / 100,
          distributorKey: 'ferguson',
        });
      }
    }
  }

  const totalWholesaleCost = Math.round(items.reduce((sum, i) => sum + i.extendedWholesalePrice, 0) * 100) / 100;
  const totalRetailValuation = Math.round(items.reduce((sum, i) => sum + i.extendedRetailPrice, 0) * 100) / 100;
  const estimatedContractorGrossMargin = Math.round((totalRetailValuation - totalWholesaleCost) * 100) / 100;
  const grossMarginPercent = totalRetailValuation > 0
    ? Math.round((estimatedContractorGrossMargin / totalRetailValuation) * 1000) / 10
    : 0;

  return {
    trade,
    squaresOrUnits,
    distributor,
    items,
    totals: {
      totalWholesaleCost,
      totalRetailValuation,
      estimatedContractorGrossMargin,
      grossMarginPercent,
    },
  };
}

export type PurchaseOrderDetails = {
  poNumber: string;
  createdAt: string;
  distributorName: string;
  distributorAccountRef?: string;
  jobRef: string;
  jobAddress: string;
  contractorName: string;
  deliveryMethod: 'will_call' | 'jobsite_ground_drop' | 'jobsite_rooftop_drop';
  requestedDeliveryDate: string;
  deliveryInstructions: string;
  bom: BillOfMaterials;
};

/**
 * Formats a ready-to-send Distributor Purchase Order (PO).
 */
export function generateDistributorPurchaseOrder(input: {
  jobRef: string;
  jobAddress: string;
  contractorName: string;
  distributorKey: SupplyDistributorKey;
  trade: 'roofing' | 'siding' | 'gutters' | 'electrical' | 'mechanical' | 'plumbing';
  squaresOrUnits: number;
  deliveryMethod?: 'will_call' | 'jobsite_ground_drop' | 'jobsite_rooftop_drop';
  deliveryDate?: string;
  distributorAccountRef?: string;
  deliveryNotes?: string;
}): PurchaseOrderDetails {
  const bom = calculateBillOfMaterials(input.trade, input.squaresOrUnits, input.distributorKey);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const poNumber = `PO-${bom.distributor.shortCode}-${dateStr}-${randNum}`;

  const defaultNotes = input.deliveryMethod === 'jobsite_rooftop_drop'
    ? 'Rooftop delivery requested: Spot bundles evenly across main ridge and rafters. Avoid concentrated center loads.'
    : 'Jobsite delivery: Place pallets in driveway on left side, do not block garage door.';

  return {
    poNumber,
    createdAt: new Date().toISOString(),
    distributorName: bom.distributor.name,
    distributorAccountRef: input.distributorAccountRef || 'LGQ-ACCT-499102',
    jobRef: input.jobRef,
    jobAddress: input.jobAddress,
    contractorName: input.contractorName,
    deliveryMethod: input.deliveryMethod || 'jobsite_rooftop_drop',
    requestedDeliveryDate: input.deliveryDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    deliveryInstructions: input.deliveryNotes || defaultNotes,
    bom,
  };
}
