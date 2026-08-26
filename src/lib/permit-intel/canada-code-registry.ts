export type CanadianCodeFamily = {
  name: string;
  edition: string;
  model: string;
  effectiveYear?: number;
};

export type CanadianProvinceProfile = {
  provinceCode: string;
  provinceName: string;
  country: 'CA';
  licensingBoard: string;
  licensingUrl: string;
  codes: {
    building: CanadianCodeFamily;
    electrical: CanadianCodeFamily;
    mechanical: CanadianCodeFamily;
    plumbing: CanadianCodeFamily;
  };
  climateZone: string;
  iceBarrierRequired: boolean;
  specialRules: string[];
  basePermitFee: number;
  estAverageFee: number;
};

/**
 * Authoritative Canada National Building Code & Provincial Code Adoptions Registry.
 * Grounded in National Research Council Canada (NRC), Canadian Commission on Building and Fire Codes (CCBFC),
 * CSA Group (Canadian Electrical Code - CSA C22.1), and Provincial Safety Authorities.
 */
export const CANADA_CODE_REGISTRY: Record<string, CanadianProvinceProfile> = {
  ON: {
    provinceCode: 'ON',
    provinceName: 'Ontario',
    country: 'CA',
    licensingBoard: 'Skilled Trades Ontario / Electrical Safety Authority (ESA) / Tarion',
    licensingUrl: 'https://www.skilledtradesontario.ca',
    codes: {
      building: { name: '2024 Ontario Building Code (OBC / 2020 NBC)', edition: '2024', model: 'OBC' },
      electrical: { name: 'Ontario Electrical Safety Code (OESC 28th Edition / CSA C22.1)', edition: '2021/2024', model: 'OESC' },
      mechanical: { name: 'Ontario Building Code Part 6 (HVAC) / CSA B149.1 Natural Gas Code', edition: '2024', model: 'OBC-M' },
      plumbing: { name: 'Ontario Building Code Part 7 (Plumbing)', edition: '2024', model: 'OBC-P' },
    },
    climateZone: 'Zone 5-7 (Cold / Severe Winter)',
    iceBarrierRequired: true,
    specialRules: [
      'esa_electrical_permit_notification_mandate',
      'obc_part_9_eave_protection_900mm',
      'tssa_fuels_safety_furnace_installation',
    ],
    basePermitFee: 140,
    estAverageFee: 245,
  },
  BC: {
    provinceCode: 'BC',
    provinceName: 'British Columbia',
    country: 'CA',
    licensingBoard: 'BC Housing (Licensing & Consumer Services) / Technical Safety BC',
    licensingUrl: 'https://www.bchousing.org/licensing-consumer-services',
    codes: {
      building: { name: '2024 British Columbia Building Code (BCBC / Zero Carbon Step Code)', edition: '2024', model: 'BCBC' },
      electrical: { name: 'BC Electrical Safety Regulation (CSA C22.1 Canadian Electrical Code)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'BC Building Code Part 6 & Part 9 HVAC', edition: '2024', model: 'BCBC-M' },
      plumbing: { name: '2024 British Columbia Plumbing Code', edition: '2024', model: 'BCPC' },
    },
    climateZone: 'Zone 4-6 (Marine / Alpine / Cold)',
    iceBarrierRequired: true,
    specialRules: [
      'bc_energy_step_code_compliance',
      'technical_safety_bc_contractor_operating_permit',
      'homeowner_protection_act_warranty',
    ],
    basePermitFee: 155,
    estAverageFee: 275,
  },
  AB: {
    provinceCode: 'AB',
    provinceName: 'Alberta',
    country: 'CA',
    licensingBoard: 'Alberta Safety Codes Council / Municipal Affairs Safety Services',
    licensingUrl: 'https://www.safetycodes.ab.ca',
    codes: {
      building: { name: '2023 National Building Code - Alberta Edition (NBC(AE))', edition: '2023', model: 'NBC(AE)' },
      electrical: { name: 'Canadian Electrical Code Part 1 (CSA C22.1:24) with Alberta Amendments', edition: '2024', model: 'CEC' },
      mechanical: { name: 'National Building Code - Alberta Edition Part 6/9', edition: '2023', model: 'NBC(AE)-M' },
      plumbing: { name: '2023 National Plumbing Code of Canada (NPC) with Alberta Amendments', edition: '2023', model: 'NPC' },
    },
    climateZone: 'Zone 7 (Very Cold / Chinook Wind / High Hail Risk)',
    iceBarrierRequired: true,
    specialRules: [
      'alberta_safety_codes_permit_system',
      'impact_resistant_class_4_shingle_incentive',
      'extreme_cold_eave_protection_ice_damming',
    ],
    basePermitFee: 135,
    estAverageFee: 230,
  },
  QC: {
    provinceCode: 'QC',
    provinceName: 'Quebec',
    country: 'CA',
    licensingBoard: 'Régie du bâtiment du Québec (RBQ) / Commission de la construction du Québec (CCQ)',
    licensingUrl: 'https://www.rbq.gouv.qc.ca',
    codes: {
      building: { name: 'Code de construction du Québec (CCQ, Chapitre I – Bâtiment / CNB 2015/2020)', edition: '2020', model: 'CCQ' },
      electrical: { name: 'Code de construction du Québec, Chapitre V – Électricité (CSA C22.1 / Hydro-Québec)', edition: '2024', model: 'CCQ-E' },
      mechanical: { name: 'Code de construction du Québec, Chapitre I & Gaz CSA B149', edition: '2020', model: 'CCQ-M' },
      plumbing: { name: 'Code de construction du Québec, Chapitre III – Plomberie (CNP 2020)', edition: '2020', model: 'CCQ-P' },
    },
    climateZone: 'Zone 6-7 (Severe Cold / Heavy Snow Load)',
    iceBarrierRequired: true,
    specialRules: [
      'rbq_mandatory_contractor_license',
      'protection_avant_toit_membrane_autocollante_900mm',
      'ccq_trade_qualification_cards',
    ],
    basePermitFee: 145,
    estAverageFee: 250,
  },
  MB: {
    provinceCode: 'MB',
    provinceName: 'Manitoba',
    country: 'CA',
    licensingBoard: 'Manitoba Inspection and Technical Services (ITS) / Manitoba Hydro',
    licensingUrl: 'https://www.gov.mb.ca/labour/its',
    codes: {
      building: { name: '2024 Manitoba Building Code (2020 NBC)', edition: '2024', model: 'MBC' },
      electrical: { name: '2024 Manitoba Electrical Code (CSA C22.1 / Manitoba Hydro)', edition: '2024', model: 'MEC' },
      mechanical: { name: '2024 Manitoba Building Code Part 6/9', edition: '2024', model: 'MBC-M' },
      plumbing: { name: '2024 Manitoba Plumbing Code (2020 NPC)', edition: '2024', model: 'MPC' },
    },
    climateZone: 'Zone 7 (Extreme Cold)',
    iceBarrierRequired: true,
    specialRules: ['extreme_frost_depth_eave_protection', 'manitoba_hydro_wiring_permit'],
    basePermitFee: 125,
    estAverageFee: 215,
  },
  SK: {
    provinceCode: 'SK',
    provinceName: 'Saskatchewan',
    country: 'CA',
    licensingBoard: 'Saskatchewan Building Standards / SaskPower / TSASK (Technical Safety Authority)',
    licensingUrl: 'https://www.tsask.ca',
    codes: {
      building: { name: '2024 Saskatchewan Building Standards (2020 NBC)', edition: '2024', model: 'SBC' },
      electrical: { name: 'SaskPower Electrical Inspections (CSA C22.1:24)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'Saskatchewan Building Standards Part 6/9', edition: '2024', model: 'SBC-M' },
      plumbing: { name: '2024 Saskatchewan Plumbing Regulations (2020 NPC)', edition: '2024', model: 'SPC' },
    },
    climateZone: 'Zone 7 (Extreme Cold / Prairie Wind)',
    iceBarrierRequired: true,
    specialRules: ['saskpower_electrical_permit', 'extreme_cold_vapor_barrier_air_sealing'],
    basePermitFee: 120,
    estAverageFee: 205,
  },
  NS: {
    provinceCode: 'NS',
    provinceName: 'Nova Scotia',
    country: 'CA',
    licensingBoard: 'Nova Scotia Building Code Advisory Committee / Nova Scotia Power',
    licensingUrl: 'https://novascotia.ca/lae/buildingcode',
    codes: {
      building: { name: 'Nova Scotia Building Code Regulations (2020 NBC)', edition: '2022/2024', model: 'NSBC' },
      electrical: { name: 'Nova Scotia Electrical Code (CSA C22.1 / Nova Scotia Power)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'Nova Scotia Building Code Part 6/9', edition: '2024', model: 'NSBC-M' },
      plumbing: { name: 'Nova Scotia Plumbing Regulations (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 5-6 (Marine / Coastal Wind-Driven Rain)',
    iceBarrierRequired: true,
    specialRules: ['coastal_wind_driven_rain_underlayment', 'eave_protection_ice_damming'],
    basePermitFee: 130,
    estAverageFee: 220,
  },
  NB: {
    provinceCode: 'NB',
    provinceName: 'New Brunswick',
    country: 'CA',
    licensingBoard: 'New Brunswick Department of Public Safety (Technical and Inspection Services)',
    licensingUrl: 'https://www2.gnb.ca/content/gnb/en/departments/public-safety.html',
    codes: {
      building: { name: '2021/2024 New Brunswick Building Code Administration Act (2020 NBC)', edition: '2024', model: 'NBBC' },
      electrical: { name: 'New Brunswick Electrical Safety Act (CSA C22.1)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'New Brunswick Building Code Part 6/9', edition: '2024', model: 'NBBC-M' },
      plumbing: { name: 'New Brunswick Plumbing Regulations (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 6 (Cold / Coastal)',
    iceBarrierRequired: true,
    specialRules: ['eave_protection_mandatory', 'licensed_electrical_contractor_mandate'],
    basePermitFee: 120,
    estAverageFee: 210,
  },
  NL: {
    provinceCode: 'NL',
    provinceName: 'Newfoundland and Labrador',
    country: 'CA',
    licensingBoard: 'Digital Government and Service NL (Engineering and Inspection Services)',
    licensingUrl: 'https://www.gov.nl.ca/dgsnl',
    codes: {
      building: { name: 'Newfoundland and Labrador Building Standards (2020 NBC)', edition: '2024', model: 'NLBC' },
      electrical: { name: 'Newfoundland and Labrador Electrical Regulations (CSA C22.1 / NL Power)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'Newfoundland and Labrador Building Standards Part 6/9', edition: '2024', model: 'NLBC-M' },
      plumbing: { name: 'Newfoundland and Labrador Plumbing Standards (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 6 (Severe Coastal Wind / Wet Snow)',
    iceBarrierRequired: true,
    specialRules: ['extreme_wind_fastening_coastal', 'eave_protection_membrane_mandatory'],
    basePermitFee: 125,
    estAverageFee: 215,
  },
  PE: {
    provinceCode: 'PE',
    provinceName: 'Prince Edward Island',
    country: 'CA',
    licensingBoard: 'PEI Department of Housing, Land and Communities / Inspection Services',
    licensingUrl: 'https://www.princeedwardisland.ca',
    codes: {
      building: { name: 'Prince Edward Island Building Codes Act (2020 NBC)', edition: '2024', model: 'PEIBC' },
      electrical: { name: 'PEI Electrical Inspection Act (CSA C22.1 / Maritime Electric)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'PEI Building Code Regulations Part 6/9', edition: '2024', model: 'PEIBC-M' },
      plumbing: { name: 'PEI Plumbing Code Regulations (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 5-6 (Maritime / Wet Snow / Cold)',
    iceBarrierRequired: true,
    specialRules: ['pei_building_permit_mandate', 'eave_protection_mandatory'],
    basePermitFee: 115,
    estAverageFee: 200,
  },
  YT: {
    provinceCode: 'YT',
    provinceName: 'Yukon',
    country: 'CA',
    licensingBoard: 'Yukon Department of Community Services (Building Safety Branch)',
    licensingUrl: 'https://yukon.ca/en/building-and-property/building-permits-and-inspections',
    codes: {
      building: { name: 'Yukon Building Standards Act (2020 NBC with Northern Amendments)', edition: '2024', model: 'YBC' },
      electrical: { name: 'Yukon Electrical Protection Act (CSA C22.1)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'Yukon Building Standards Part 6/9', edition: '2024', model: 'YBC-M' },
      plumbing: { name: 'Yukon Plumbing Standards (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 8 (Subarctic / Extreme Cold)',
    iceBarrierRequired: true,
    specialRules: ['extreme_cold_permafrost_foundation', 'enhanced_eave_protection_ice_damming', 'heavy_snow_drift'],
    basePermitFee: 160,
    estAverageFee: 280,
  },
  NT: {
    provinceCode: 'NT',
    provinceName: 'Northwest Territories',
    country: 'CA',
    licensingBoard: 'NWT Department of Infrastructure (Electrical & Mechanical / Building Inspections)',
    licensingUrl: 'https://www.inf.gov.nt.ca',
    codes: {
      building: { name: 'Northwest Territories Building Standards (2020 NBC)', edition: '2024', model: 'NTBC' },
      electrical: { name: 'NWT Electrical Protection Act (CSA C22.1)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'NWT Building Standards Part 6/9', edition: '2024', model: 'NTBC-M' },
      plumbing: { name: 'NWT Plumbing Regulations (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 8 (Subarctic / Arctic)',
    iceBarrierRequired: true,
    specialRules: ['permafrost_engineering_review', 'extreme_cold_thermal_envelope', 'enhanced_eave_protection'],
    basePermitFee: 165,
    estAverageFee: 290,
  },
  NU: {
    provinceCode: 'NU',
    provinceName: 'Nunavut',
    country: 'CA',
    licensingBoard: 'Nunavut Department of Community and Government Services (Building Safety Division)',
    licensingUrl: 'https://www.gov.nu.ca/community-and-government-services',
    codes: {
      building: { name: 'Nunavut Building Standards (2020 NBC)', edition: '2024', model: 'NUBC' },
      electrical: { name: 'Nunavut Electrical Safety Regulations (CSA C22.1)', edition: '2024', model: 'CEC' },
      mechanical: { name: 'Nunavut Building Standards Part 6/9', edition: '2024', model: 'NUBC-M' },
      plumbing: { name: 'Nunavut Plumbing Standards (2020 NPC)', edition: '2024', model: 'NPC' },
    },
    climateZone: 'Zone 8 (Arctic / Permafrost)',
    iceBarrierRequired: true,
    specialRules: ['arctic_wind_scour_fastening', 'permafrost_foundation_engineering', 'enhanced_eave_protection'],
    basePermitFee: 175,
    estAverageFee: 310,
  },
};

const CANADIAN_PROVINCES_TO_CODE: Record<string, string> = {
  ontario: 'ON',
  'british columbia': 'BC',
  alberta: 'AB',
  quebec: 'QC',
  québec: 'QC',
  manitoba: 'MB',
  saskatchewan: 'SK',
  'nova scotia': 'NS',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  newfoundland: 'NL',
  'prince edward island': 'PE',
  pei: 'PE',
  yukon: 'YT',
  'northwest territories': 'NT',
  nwt: 'NT',
  nunavut: 'NU',
};

/**
 * Normalizes any string representation of a Canadian province or territory to a 2-letter uppercase code.
 */
export function normalizeCanadaProvinceCode(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (CANADA_CODE_REGISTRY[upper]) return upper;

  const lower = trimmed.toLowerCase();
  if (CANADIAN_PROVINCES_TO_CODE[lower]) return CANADIAN_PROVINCES_TO_CODE[lower];

  return null;
}
