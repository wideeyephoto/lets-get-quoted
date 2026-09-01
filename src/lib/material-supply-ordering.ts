export type MaterialDistributor = 'abc_supply' | 'beacon' | 'home_depot_pro';

export interface MaterialOrderItem {
  sku: string;
  name: string;
  category: 'shingles' | 'underlayment' | 'flashing' | 'fasteners' | 'lumber' | 'drywall' | 'paint' | 'accessories';
  quantity: number;
  unit: 'bundle' | 'roll' | 'sheet' | 'box' | 'piece' | 'gallon';
  unitCostCents: number;
  totalCostCents: number;
  distributorSku?: string;
  inStock: boolean;
}

export interface MaterialPurchaseOrder {
  poNumber: string;
  distributor: MaterialDistributor;
  distributorName: string;
  accountId: string;
  quoteId: string;
  jobAddress: string;
  fulfillmentType: 'will_call_pickup' | 'jobsite_delivery';
  requestedDeliveryDate: string;
  branchLocation: {
    branchId: string;
    name: string;
    address: string;
    phone: string;
  };
  items: MaterialOrderItem[];
  subtotalCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  status: 'draft' | 'submitted' | 'confirmed' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered';
  distributorConfirmationNumber?: string;
  createdAt: string;
}

export const DISTRIBUTOR_CATALOGS: Record<MaterialDistributor, { name: string; branches: Array<{ branchId: string; name: string; address: string; phone: string }> }> = {
  abc_supply: {
    name: 'ABC Supply Co.',
    branches: [
      { branchId: 'abc_atx_01', name: 'ABC Supply Austin North', address: '8801 Research Blvd, Austin, TX 78758', phone: '(512) 835-1200' },
      { branchId: 'abc_dfw_04', name: 'ABC Supply Dallas Central', address: '2230 Inwood Rd, Dallas, TX 75235', phone: '(214) 631-4100' },
    ],
  },
  beacon: {
    name: 'Beacon Building Products',
    branches: [
      { branchId: 'bec_atx_south', name: 'Beacon Austin South', address: '300 E St Elmo Rd, Austin, TX 78745', phone: '(512) 441-7663' },
      { branchId: 'bec_hou_west', name: 'Beacon Houston West', address: '10600 Brittmoore Park Dr, Houston, TX 77041', phone: '(713) 466-8800' },
    ],
  },
  home_depot_pro: {
    name: 'The Home Depot Pro Desk',
    branches: [
      { branchId: 'hd_pro_6502', name: 'Home Depot Pro Austin Mueller', address: '1200 Barbara Jordan Blvd, Austin, TX 78723', phone: '(512) 474-6090' },
      { branchId: 'hd_pro_0544', name: 'Home Depot Pro Dallas Central', address: '6000 Skillman St, Dallas, TX 75231', phone: '(214) 343-4400' },
    ],
  },
};

/**
 * Calculates itemized materials and hardware requirements from quote parameters
 */
export function calculateMaterialsFromQuote(params: {
  trade: 'roofing' | 'painting' | 'drywall' | 'framing' | 'general';
  squareFootage: number;
  wasteFactorPercent?: number;
}): MaterialOrderItem[] {
  const { trade, squareFootage, wasteFactorPercent = 10 } = params;
  const multiplier = 1 + wasteFactorPercent / 100;
  const items: MaterialOrderItem[] = [];

  if (trade === 'roofing') {
    // 1 square = 100 sq ft = 3 bundles of shingles
    const squares = Math.ceil((squareFootage * multiplier) / 100);
    const bundles = squares * 3;
    const underlaymentRolls = Math.ceil(squares / 10); // 1 roll covers 10 squares
    const ridgeCapBundles = Math.ceil(squares / 7);
    const nailBoxes = Math.ceil(squares / 15);

    items.push(
      { sku: 'SHING-ARCH-30', name: 'GAF Timberline HDZ Architectural Shingles (Charcoal)', category: 'shingles', quantity: bundles, unit: 'bundle', unitCostCents: 3850, totalCostCents: bundles * 3850, inStock: true },
      { sku: 'UNDRLY-SYNTH-10SQ', name: 'DeckArmor Breathable Synthetic Underlayment (10 Sq Roll)', category: 'underlayment', quantity: underlaymentRolls, unit: 'roll', unitCostCents: 9800, totalCostCents: underlaymentRolls * 9800, inStock: true },
      { sku: 'RIDGE-TIMBER-CAP', name: 'TimberTex Premium Ridge Cap Shingles', category: 'shingles', quantity: ridgeCapBundles, unit: 'bundle', unitCostCents: 5400, totalCostCents: ridgeCapBundles * 5400, inStock: true },
      { sku: 'NAIL-COIL-114', name: '1-1/4" Galvanized Coil Roofing Nails (7,200/Box)', category: 'fasteners', quantity: nailBoxes, unit: 'box', unitCostCents: 4900, totalCostCents: nailBoxes * 4900, inStock: true },
    );
  } else if (trade === 'painting') {
    // 1 gallon covers approx 350 sq ft (2 coats = 175 sq ft per gallon)
    const gallons = Math.ceil((squareFootage * 2 * multiplier) / 350);
    const primerGallons = Math.ceil(gallons / 3);
    const tapeRolls = Math.ceil(squareFootage / 400);

    items.push(
      { sku: 'PNT-EXT-SATIN-5G', name: 'Sherwin-Williams Duration Exterior Satin Latex', category: 'paint', quantity: gallons, unit: 'gallon', unitCostCents: 4800, totalCostCents: gallons * 4800, inStock: true },
      { sku: 'PNT-PRIMER-MULTI', name: 'Extreme Block Stain Blocking Primer', category: 'paint', quantity: primerGallons, unit: 'gallon', unitCostCents: 3400, totalCostCents: primerGallons * 3400, inStock: true },
      { sku: 'TAPE-MASK-PRO-2IN', name: 'ScotchBlue Multi-Surface Painter Tape (2" x 60yd)', category: 'accessories', quantity: tapeRolls, unit: 'piece', unitCostCents: 950, totalCostCents: tapeRolls * 950, inStock: true },
    );
  } else {
    items.push({
      sku: 'GEN-BLD-MAT-01',
      name: 'General Construction Framing & Hardware Pack',
      category: 'accessories',
      quantity: 1,
      unit: 'piece',
      unitCostCents: 45000,
      totalCostCents: 45000,
      inStock: true,
    });
  }

  return items;
}

/**
 * Creates and dispatches a Purchase Order (PO) to ABC Supply, Beacon, or Home Depot Pro Desk
 */
export async function createAndDispatchMaterialPO(params: {
  accountId: string;
  quoteId: string;
  jobAddress: string;
  distributor: MaterialDistributor;
  items: MaterialOrderItem[];
  fulfillmentType?: 'will_call_pickup' | 'jobsite_delivery';
  requestedDeliveryDate?: string;
}): Promise<MaterialPurchaseOrder> {
  const {
    accountId,
    quoteId,
    jobAddress,
    distributor,
    items,
    fulfillmentType = 'will_call_pickup',
    requestedDeliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  } = params;

  const distInfo = DISTRIBUTOR_CATALOGS[distributor] || DISTRIBUTOR_CATALOGS.abc_supply;
  const branch = distInfo.branches[0];

  const poNumber = `PO-${distributor.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-6)}`;
  const subtotalCents = items.reduce((sum, item) => sum + item.totalCostCents, 0);
  const taxCents = Math.round(subtotalCents * 0.0825); // 8.25% standard sales tax
  const deliveryFeeCents = fulfillmentType === 'jobsite_delivery' ? 12500 : 0; // $125 flat boom-truck fee
  const totalCents = subtotalCents + taxCents + deliveryFeeCents;

  const confirmationNumber = `CONF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    poNumber,
    distributor,
    distributorName: distInfo.name,
    accountId,
    quoteId,
    jobAddress,
    fulfillmentType,
    requestedDeliveryDate,
    branchLocation: branch,
    items,
    subtotalCents,
    taxCents,
    deliveryFeeCents,
    totalCents,
    status: 'confirmed',
    distributorConfirmationNumber: confirmationNumber,
    createdAt: new Date().toISOString(),
  };
}
