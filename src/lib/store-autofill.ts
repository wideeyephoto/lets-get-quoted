import type { DepreciationSchedule } from './inventory-tracker';
import { STORE_PRODUCTS_CATALOG, type StoreProductCatalogItem } from './store-catalog';

export interface StoreAutofillResult {
  success: boolean;
  retailer: 'Home Depot' | "Lowe's" | 'Hardware Store';
  name: string;
  brand: string;
  category: string;
  modelNumber: string | null;
  sku: string | null;
  assetTagSuggestion: string;
  purchasePrice: number | null;
  purchaseDate: string; // Defaults to today's date YYYY-MM-DD
  depreciationSchedule: DepreciationSchedule;
  imageUrl: string | null;
  notes: string;
  productUrl: string;
}

const KNOWN_BRANDS = [
  'Milwaukee',
  'DEWALT',
  'RIDGID',
  'Makita',
  'Bosch',
  'Kobalt',
  'Craftsman',
  'Klein Tools',
  'Klein',
  'Ryobi',
  'Husky',
  'Hilti',
  'Fieldpiece',
  'Spartan Tool',
  'Spartan',
  'Greenlee',
  'Fluke',
  'Diablo',
  'Southwire',
  'Festool',
  'Metabo HPT',
  'Metabo',
  'Skil',
  'IRWIN',
  'Knipex',
  'Channellock',
];

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts a catalog item into a StoreAutofillResult.
 */
function catalogItemToAutofillResult(item: StoreProductCatalogItem): StoreAutofillResult {
  const today = getTodayDateString();
  const brandPrefix = item.brand.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'TOOL';
  return {
    success: true,
    retailer: item.retailer,
    name: item.name,
    brand: item.brand,
    category: item.category,
    modelNumber: item.modelNumber,
    sku: item.sku,
    assetTagSuggestion: `TAG-${brandPrefix}-${item.sku.slice(-4)}`,
    purchasePrice: item.price,
    purchaseDate: today,
    depreciationSchedule: item.price < 2500 ? 'de_minimis' : 'section_179',
    imageUrl: item.imageUrl,
    notes: `Model: ${item.modelNumber}. SKU: #${item.sku}.\n${item.description}`,
    productUrl: item.storeUrl,
  };
}

/**
 * Search the store catalog with keywords, brand names, or model numbers.
 */
export function searchStoreCatalog(query: string): StoreAutofillResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // Return top popular contractor tools
    return STORE_PRODUCTS_CATALOG.slice(0, 6).map(catalogItemToAutofillResult);
  }

  // If query is an exact URL, look for matching SKU in catalog
  const hdMatch = q.match(/\/p\/[^/]+(?:\/(\d+))?/i);
  const lowesMatch = q.match(/\/pd\/[^/]+(?:\/(\d+))?/i);
  const matchedSku = hdMatch?.[1] || lowesMatch?.[1];

  if (matchedSku) {
    const directMatch = STORE_PRODUCTS_CATALOG.find((item) => item.sku === matchedSku);
    if (directMatch) return [catalogItemToAutofillResult(directMatch)];
  }

  const terms = q.split(/\s+/).filter(Boolean);

  const scored = STORE_PRODUCTS_CATALOG.map((item) => {
    let score = 0;
    const nameLower = item.name.toLowerCase();
    const brandLower = item.brand.toLowerCase();
    const categoryLower = item.category.toLowerCase();
    const modelLower = item.modelNumber.toLowerCase();
    const descLower = item.description.toLowerCase();
    const kw = item.keywords.map((k) => k.toLowerCase());

    for (const term of terms) {
      if (brandLower === term) score += 40;
      else if (brandLower.includes(term)) score += 20;

      if (nameLower.includes(term)) score += 30;
      if (modelLower.includes(term)) score += 35;
      if (categoryLower.includes(term)) score += 15;
      if (descLower.includes(term)) score += 10;
      if (kw.includes(term)) score += 25;
      if (item.sku === term) score += 50;
    }

    return { item, score };
  });

  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => catalogItemToAutofillResult(s.item));

  return matches;
}

/**
 * Infer tool category based on name and keywords.
 */
function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('band saw') || lower.includes('miter') || lower.includes('circular saw') || lower.includes('sawzall') || lower.includes('reciprocating') || lower.includes('cut-off') || lower.includes('saw')) {
    return 'Cutting Tools';
  }
  if (lower.includes('propress') || lower.includes('press tool') || lower.includes('pipe threader') || lower.includes('crimper') || lower.includes('pipe cutter') || lower.includes('pex')) {
    return 'Pipe Joining';
  }
  if (lower.includes('jetter') || lower.includes('drain') || lower.includes('auger') || lower.includes('snake') || lower.includes('sewer')) {
    return 'Drain Cleaning';
  }
  if (lower.includes('thermal') || lower.includes('flir') || lower.includes('infrared') || lower.includes('multimeter') || lower.includes('camera') || lower.includes('tester') || lower.includes('gauge')) {
    return 'Diagnostics';
  }
  if (lower.includes('manifold') || lower.includes('vacuum pump') || lower.includes('recovery') || lower.includes('refrigerant') || lower.includes('hvac')) {
    return 'HVAC Diagnostics';
  }
  if (lower.includes('drill') || lower.includes('impact') || lower.includes('grinder') || lower.includes('rotary') || lower.includes('driver')) {
    return 'Power Tools';
  }
  if (lower.includes('plier') || lower.includes('wrench') || lower.includes('screwdriver') || lower.includes('level') || lower.includes('hand tool')) {
    return 'Hand Tools';
  }
  return 'Power Tools';
}

/**
 * Parses Home Depot or Lowe's product URL or keyword search query.
 */
export function parseStoreProductUrl(rawInput: string): StoreAutofillResult {
  const trimmed = rawInput.trim();
  const today = getTodayDateString();

  // First, check if the input matches any item in our store catalog (by search keyword or SKU)
  const catalogMatches = searchStoreCatalog(trimmed);
  if (catalogMatches.length > 0) {
    return catalogMatches[0];
  }

  // If not in catalog and is a URL, parse URL structure
  const isUrl = trimmed.includes('http') || trimmed.includes('homedepot.com') || trimmed.includes('lowes.com');
  if (!isUrl) {
    // If it was just a random keyword that didn't match anything in catalog:
    // Return a graceful failure rather than fake garbage like "Commercial Brand xyz"
    return {
      success: false,
      retailer: 'Hardware Store',
      name: '',
      brand: '',
      category: 'Power Tools',
      modelNumber: null,
      sku: null,
      assetTagSuggestion: `TAG-TOOL-${Math.floor(1000 + Math.random() * 9000)}`,
      purchasePrice: null,
      purchaseDate: today,
      depreciationSchedule: 'de_minimis',
      imageUrl: null,
      notes: '',
      productUrl: '',
    };
  }

  let retailer: 'Home Depot' | "Lowe's" | 'Hardware Store' = 'Hardware Store';
  if (/homedepot\.com/i.test(trimmed)) {
    retailer = 'Home Depot';
  } else if (/lowes\.com/i.test(trimmed)) {
    retailer = "Lowe's";
  }

  let pathname = trimmed;
  let skuFromUrl: string | null = null;
  let rawSlug = '';

  if (trimmed.includes('/')) {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      pathname = parsed.pathname;
    } catch {
      // raw string
    }
  } else {
    rawSlug = trimmed;
  }

  // 1. Check for Home Depot pattern: /p/{Slug}/{InternetNumber}
  const hdMatch = pathname.match(/\/p\/([^/]+)(?:\/(\d+))?/i);
  // 2. Check for Lowe's pattern: /pd/{Slug}/{ItemNumber}
  const lowesMatch = pathname.match(/\/pd\/([^/]+)(?:\/(\d+))?/i);

  if (hdMatch) {
    rawSlug = hdMatch[1];
    skuFromUrl = hdMatch[2] || null;
    retailer = 'Home Depot';
  } else if (lowesMatch) {
    rawSlug = lowesMatch[1];
    skuFromUrl = lowesMatch[2] || null;
    retailer = "Lowe's";
  } else if (!rawSlug) {
    const parts = pathname.split('/').filter(Boolean);
    rawSlug = parts[parts.length - 1] || trimmed || 'Commercial Tool';
  }

  const tokens = rawSlug.split(/[-_]+/).filter(Boolean);

  let brand = 'Commercial Brand';
  for (const b of KNOWN_BRANDS) {
    const matchIdx = tokens.findIndex((t) => t.toLowerCase() === b.toLowerCase());
    if (matchIdx !== -1) {
      brand = b;
      break;
    }
  }

  let modelNumber: string | null = null;
  const modelRegex = /^([A-Z0-9]+-[A-Z0-9]+|[A-Z]{1,4}[0-9]{2,6}[A-Z0-9]*|[0-9]{4,6}-[0-9]{2,4})$/i;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (modelRegex.test(tokens[i])) {
      modelNumber = tokens[i];
      break;
    }
  }

  const nameTokens = [...tokens];
  if (nameTokens.length > 0 && nameTokens[0].toLowerCase() === brand.toLowerCase()) {
    nameTokens.shift();
  }
  const cleanTokens = nameTokens.filter(
    (t) => !['tool', 'only', 'with', 'battery', 'bare'].includes(t.toLowerCase())
  );

  let toolName = cleanTokens.join(' ').replace(/\s+/g, ' ').trim();
  if (!toolName) toolName = 'Commercial Equipment';
  const fullName = `${brand} ${toolName}`;

  const category = inferCategory(fullName);

  let suggestedPrice = 249.0;
  if (category === 'Pipe Joining') suggestedPrice = 3850.0;
  else if (category === 'Drain Cleaning') suggestedPrice = 2800.0;
  else if (category === 'Diagnostics') suggestedPrice = 850.0;
  else if (category === 'Cutting Tools') suggestedPrice = 349.0;
  else if (category === 'HVAC Diagnostics') suggestedPrice = 695.0;

  let imageUrl: string = '/images/tools/generic-tool.jpg';
  const lowerName = fullName.toLowerCase();
  if (lowerName.includes('pipe') || lowerName.includes('wrench')) {
    imageUrl = '/images/tools/ridgid-pipe-wrench.jpg';
  } else if (lowerName.includes('band saw') || lowerName.includes('milwaukee')) {
    imageUrl = '/images/tools/milwaukee-bandsaw.jpg';
  } else if (lowerName.includes('propress') || lowerName.includes('ridgid rp')) {
    imageUrl = '/images/tools/ridgid-propress.jpg';
  } else if (lowerName.includes('jetter') || lowerName.includes('spartan')) {
    imageUrl = '/images/tools/spartan-jetter.jpg';
  } else if (lowerName.includes('flir') || lowerName.includes('thermal')) {
    imageUrl = '/images/tools/flir-thermal.jpg';
  } else if (lowerName.includes('multimeter') || lowerName.includes('klein')) {
    imageUrl = '/images/tools/klein-multimeter.jpg';
  } else if (lowerName.includes('drill') || lowerName.includes('dewalt')) {
    imageUrl = '/images/tools/dewalt-drill.jpg';
  } else if (lowerName.includes('manifold') || lowerName.includes('fieldpiece')) {
    imageUrl = '/images/tools/fieldpiece-manifold.jpg';
  }

  const brandPrefix = brand.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'TOOL';
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const assetTagSuggestion = skuFromUrl
    ? `TAG-${brandPrefix}-${skuFromUrl.slice(-4)}`
    : `TAG-${brandPrefix}-${randomSuffix}`;

  return {
    success: true,
    retailer,
    name: fullName,
    brand,
    category,
    modelNumber,
    sku: skuFromUrl,
    assetTagSuggestion,
    purchasePrice: suggestedPrice,
    purchaseDate: today,
    depreciationSchedule: suggestedPrice < 2500 ? 'de_minimis' : 'section_179',
    imageUrl,
    notes: `Model: ${modelNumber || 'N/A'}.${skuFromUrl ? ` SKU: #${skuFromUrl}.` : ''}\nProduct Reference: ${trimmed}`,
    productUrl: trimmed,
  };
}
