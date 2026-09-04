/**
 * Official High-Resolution Studio Product Photography Assets
 *
 * Sourced directly from Printful's high-definition product catalog CDN.
 * Provides authentic, studio-shot photographic blanks for shirts, polos,
 * hats, tumblers, and phone cases.
 */

export interface ProductPhotoDefinition {
  front: string;
  back?: string;
  detail?: string;
  tintFallback?: string;
}

export const PRINTFUL_STUDIO_PHOTOS: Record<string, Record<string, ProductPhotoDefinition>> = {
  // 1. Heavyweight Contractor Crew T-Shirt (Bella+Canvas 3001 - Catalog ID 71)
  t_shirts: {
    black: {
      front: 'https://files.cdn.printful.com/products/71/4016_1752236278.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    dark_navy: {
      front: 'https://files.cdn.printful.com/products/71/4111_1752236282.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    heather_charcoal: {
      front: 'https://files.cdn.printful.com/products/71/8460_1752236278.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    safety_orange: {
      front: 'https://files.cdn.printful.com/products/71/4126_1752236282.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    safety_yellow: {
      front: 'https://files.cdn.printful.com/products/71/4181_1752236284.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    army_olive: {
      front: 'https://files.cdn.printful.com/products/71/17202_1752236282.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
    crisp_white: {
      front: 'https://files.cdn.printful.com/products/71/4011_1752236284.jpg',
      back: 'https://files.cdn.printful.com/m/57-bc3001/medium/onman/back/05_bc3001_onman_back_basewhitebg.png',
    },
  },

  // 2. Moisture-Wicking Micro-Pique Polo (Gildan 64800 - Catalog ID 670)
  polos: {
    onyx_black: {
      front: 'https://files.cdn.printful.com/products/670/16756_1681385661.jpg',
      back: 'https://files.cdn.printful.com/m/unisex_pique_polo_shirt_gildan_64800/medium/ghost/front/05_Gildan_64800_ghost_mockup_ghost_front_base_whitebg.png',
    },
    deep_navy: {
      front: 'https://files.cdn.printful.com/products/670/16763_1681385682.jpg',
      back: 'https://files.cdn.printful.com/m/unisex_pique_polo_shirt_gildan_64800/medium/ghost/front/05_Gildan_64800_ghost_mockup_ghost_front_base_whitebg.png',
    },
    steel_gray: {
      front: 'https://files.cdn.printful.com/products/670/16769_1681385702.jpg',
      back: 'https://files.cdn.printful.com/m/unisex_pique_polo_shirt_gildan_64800/medium/ghost/front/05_Gildan_64800_ghost_mockup_ghost_front_base_whitebg.png',
    },
    crisp_white: {
      front: 'https://files.cdn.printful.com/products/670/16776_1681385723.jpg',
      back: 'https://files.cdn.printful.com/m/unisex_pique_polo_shirt_gildan_64800/medium/ghost/front/05_Gildan_64800_ghost_mockup_ghost_front_base_whitebg.png',
    },
    hi_vis_yellow: {
      front: 'https://files.cdn.printful.com/m/unisex_pique_polo_shirt_gildan_64800/medium/ghost/front/05_Gildan_64800_ghost_mockup_ghost_front_base_whitebg.png',
      tintFallback: '#eab308',
    },
    forest_green: {
      front: 'https://files.cdn.printful.com/products/670/16756_1681385661.jpg',
      tintFallback: '#14532d',
    },
  },

  // 3. Richardson 112 Trucker Snapback Hat (Catalog ID 422)
  hats: {
    heather_black: {
      front: 'https://files.cdn.printful.com/products/422/11421_1587535531.jpg',
    },
    solid_black: {
      front: 'https://files.cdn.printful.com/products/422/11417_1587535533.jpg',
    },
    navy_white: {
      front: 'https://files.cdn.printful.com/products/422/11420_1587535530.jpg',
    },
    camo_black: {
      front: 'https://files.cdn.printful.com/products/422/16711_1680092646.jpg',
    },
    caramel_khaki: {
      front: 'https://files.cdn.printful.com/products/422/11418_1587535534.jpg',
    },
  },

  // 4. Stainless Steel Tumbler (Catalog ID 909)
  tumblers: {
    white: {
      front: 'https://files.cdn.printful.com/products/909/23470_1759304140.jpg',
    },
    matte_black: {
      front: 'https://files.cdn.printful.com/products/909/23470_1759304140.jpg',
    },
    brushed_steel: {
      front: 'https://files.cdn.printful.com/products/909/23470_1759304140.jpg',
    },
    contractor_orange: {
      front: 'https://files.cdn.printful.com/products/909/23470_1759304140.jpg',
    },
  },

  // 5. Tough iPhone Case (Catalog ID 601)
  phone_cases: {
    onyx_black: {
      front: 'https://files.cdn.printful.com/products/601/15381_1654239978.jpg',
    },
    contractor_yellow: {
      front: 'https://files.cdn.printful.com/products/601/15381_1654239978.jpg',
    },
    slate_navy: {
      front: 'https://files.cdn.printful.com/products/601/15381_1654239978.jpg',
    },
    concrete_gray: {
      front: 'https://files.cdn.printful.com/products/601/15381_1654239978.jpg',
    },
  },
};

/**
 * Returns the photographic asset URL for a product, color, and view angle.
 */
export function getProductStudioPhoto(
  productId: string,
  colorId: string,
  viewAngle: 'front' | 'back' | 'detail' | 'angle' = 'front'
): { photoUrl: string; hasBackPhoto: boolean } {
  const productPhotos = PRINTFUL_STUDIO_PHOTOS[productId];
  if (!productPhotos) {
    return { photoUrl: '', hasBackPhoto: false };
  }

  // Look up exact color match or first available
  const colorDef = productPhotos[colorId] || Object.values(productPhotos)[0];
  if (!colorDef) {
    return { photoUrl: '', hasBackPhoto: false };
  }

  if (viewAngle === 'back' && colorDef.back) {
    return { photoUrl: colorDef.back, hasBackPhoto: true };
  }

  return { photoUrl: colorDef.front, hasBackPhoto: Boolean(colorDef.back) };
}
