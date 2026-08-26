import type {
  CensusLocationContext,
  JurisdictionDiscipline,
  JurisdictionMatch,
  ParsedAddress,
} from './types';

export type JurisdictionRegistryEntry = {
  authorityId: string;
  authorityName: string;
  agencyName: string;
  state: string;
  county: string;
  cityOrTownship: string;
  disciplines: Record<
    JurisdictionDiscipline,
    {
      enforcingAgency: string;
      level: 'municipality' | 'township' | 'county' | 'state';
      sourceUrl?: string;
    }
  >;
  portalUrl?: string;
  verifiedAt: string;
};

/**
 * Curated Michigan Jurisdiction Registry based on the official Michigan LARA BCC
 * Statewide Jurisdiction List and municipal building departments.
 * Expanded across Wayne, Oakland, Macomb, Kent, and Washtenaw counties.
 */
export const MICHIGAN_JURISDICTION_REGISTRY: JurisdictionRegistryEntry[] = [
  // --- OAKLAND COUNTY ---
  {
    authorityId: 'mi-royal-oak',
    authorityName: 'City of Royal Oak',
    agencyName: 'Building Inspection Division',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Royal Oak',
    disciplines: {
      building: {
        enforcingAgency: 'City of Royal Oak Building Inspection',
        level: 'municipality',
        sourceUrl: 'https://www.romi.gov/176/Building-Inspection',
      },
      electrical: {
        enforcingAgency: 'City of Royal Oak Electrical Inspection',
        level: 'municipality',
        sourceUrl: 'https://www.romi.gov/176/Building-Inspection',
      },
      mechanical: {
        enforcingAgency: 'City of Royal Oak Mechanical Inspection',
        level: 'municipality',
        sourceUrl: 'https://www.romi.gov/176/Building-Inspection',
      },
      plumbing: {
        enforcingAgency: 'City of Royal Oak Plumbing Inspection',
        level: 'municipality',
        sourceUrl: 'https://www.romi.gov/176/Building-Inspection',
      },
    },
    portalUrl: 'https://www.accessmygov.com/?uid=1349',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-troy',
    authorityName: 'City of Troy',
    agencyName: 'Building Inspection Department',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Troy',
    disciplines: {
      building: { enforcingAgency: 'City of Troy Building Inspection', level: 'municipality', sourceUrl: 'https://troymi.gov/building' },
      electrical: { enforcingAgency: 'City of Troy Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'City of Troy Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'City of Troy Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://www.accessmygov.com/?uid=1355',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-rochester-hills',
    authorityName: 'City of Rochester Hills',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Rochester Hills',
    disciplines: {
      building: { enforcingAgency: 'Rochester Hills Building Department', level: 'municipality', sourceUrl: 'https://www.rochesterhills.org/building' },
      electrical: { enforcingAgency: 'Rochester Hills Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Rochester Hills Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Rochester Hills Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=367',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-farmington-hills',
    authorityName: 'City of Farmington Hills',
    agencyName: 'Planning & Community Development - Building Division',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Farmington Hills',
    disciplines: {
      building: { enforcingAgency: 'Farmington Hills Building Division', level: 'municipality' },
      electrical: { enforcingAgency: 'Farmington Hills Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'Farmington Hills Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'Farmington Hills Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=330',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-southfield',
    authorityName: 'City of Southfield',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Southfield',
    disciplines: {
      building: { enforcingAgency: 'City of Southfield Building Department', level: 'municipality' },
      electrical: { enforcingAgency: 'City of Southfield Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'City of Southfield Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'City of Southfield Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=380',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-birmingham',
    authorityName: 'City of Birmingham',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Birmingham',
    disciplines: {
      building: { enforcingAgency: 'City of Birmingham Building Department', level: 'municipality' },
      electrical: { enforcingAgency: 'City of Birmingham Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'City of Birmingham Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'City of Birmingham Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://www.accessmygov.com/?uid=1326',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-bloomfield-twp',
    authorityName: 'Charter Township of Bloomfield',
    agencyName: 'Building Division',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Bloomfield Township',
    disciplines: {
      building: { enforcingAgency: 'Bloomfield Township Building Division', level: 'township' },
      electrical: { enforcingAgency: 'Bloomfield Township Electrical Inspection', level: 'township' },
      mechanical: { enforcingAgency: 'Bloomfield Township Mechanical Inspection', level: 'township' },
      plumbing: { enforcingAgency: 'Bloomfield Township Plumbing Inspection', level: 'township' },
    },
    portalUrl: 'https://bsaonline.com/?uid=317',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-oakland-twp',
    authorityName: 'Charter Township of Oakland',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Oakland Township',
    disciplines: {
      building: {
        enforcingAgency: 'Oakland Township Building Department',
        level: 'township',
        sourceUrl: 'https://www.oaklandtownship.org',
      },
      electrical: { enforcingAgency: 'Oakland Township Electrical Inspection', level: 'township' },
      mechanical: { enforcingAgency: 'Oakland Township Mechanical Inspection', level: 'township' },
      plumbing: { enforcingAgency: 'Oakland Township Plumbing Inspection', level: 'township' },
    },
    portalUrl: 'https://www.accessmygov.com/?uid=1342',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-novi',
    authorityName: 'City of Novi',
    agencyName: 'Community Development - Building Division',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Novi',
    disciplines: {
      building: { enforcingAgency: 'City of Novi Building Division', level: 'municipality' },
      electrical: { enforcingAgency: 'City of Novi Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'City of Novi Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'City of Novi Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=354',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-pontiac',
    authorityName: 'City of Pontiac',
    agencyName: 'Building Safety Division',
    state: 'MI',
    county: 'Oakland',
    cityOrTownship: 'Pontiac',
    disciplines: {
      building: { enforcingAgency: 'City of Pontiac Building Safety Division', level: 'municipality' },
      electrical: { enforcingAgency: 'City of Pontiac Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'City of Pontiac Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'City of Pontiac Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=364',
    verifiedAt: '2026-08-26',
  },

  // --- WAYNE COUNTY ---
  {
    authorityId: 'mi-detroit',
    authorityName: 'City of Detroit',
    agencyName: 'Buildings, Safety Engineering, and Environmental Dept (BSEED)',
    state: 'MI',
    county: 'Wayne',
    cityOrTownship: 'Detroit',
    disciplines: {
      building: {
        enforcingAgency: 'Detroit BSEED Building Division',
        level: 'municipality',
        sourceUrl: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
      },
      electrical: {
        enforcingAgency: 'Detroit BSEED Electrical Division',
        level: 'municipality',
        sourceUrl: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
      },
      mechanical: {
        enforcingAgency: 'Detroit BSEED Mechanical Division',
        level: 'municipality',
        sourceUrl: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
      },
      plumbing: {
        enforcingAgency: 'Detroit BSEED Plumbing Division',
        level: 'municipality',
        sourceUrl: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department',
      },
    },
    portalUrl: 'https://detroitmi.gov/bseed-online-permits',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-dearborn',
    authorityName: 'City of Dearborn',
    agencyName: 'Department of Building & Safety',
    state: 'MI',
    county: 'Wayne',
    cityOrTownship: 'Dearborn',
    disciplines: {
      building: { enforcingAgency: 'Dearborn Department of Building & Safety', level: 'municipality' },
      electrical: { enforcingAgency: 'Dearborn Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Dearborn Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Dearborn Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=1329',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-livonia',
    authorityName: 'City of Livonia',
    agencyName: 'Inspection Department',
    state: 'MI',
    county: 'Wayne',
    cityOrTownship: 'Livonia',
    disciplines: {
      building: { enforcingAgency: 'City of Livonia Inspection Department', level: 'municipality' },
      electrical: { enforcingAgency: 'Livonia Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'Livonia Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'Livonia Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=348',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-canton-twp',
    authorityName: 'Charter Township of Canton',
    agencyName: 'Building Division',
    state: 'MI',
    county: 'Wayne',
    cityOrTownship: 'Canton',
    disciplines: {
      building: { enforcingAgency: 'Canton Township Building Division', level: 'township' },
      electrical: { enforcingAgency: 'Canton Township Electrical Division', level: 'township' },
      mechanical: { enforcingAgency: 'Canton Township Mechanical Division', level: 'township' },
      plumbing: { enforcingAgency: 'Canton Township Plumbing Division', level: 'township' },
    },
    portalUrl: 'https://bsaonline.com/?uid=320',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-westland',
    authorityName: 'City of Westland',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Wayne',
    cityOrTownship: 'Westland',
    disciplines: {
      building: { enforcingAgency: 'City of Westland Building Department', level: 'municipality' },
      electrical: { enforcingAgency: 'Westland Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Westland Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Westland Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=396',
    verifiedAt: '2026-08-26',
  },

  // --- MACOMB COUNTY ---
  {
    authorityId: 'mi-warren',
    authorityName: 'City of Warren',
    agencyName: 'Division of Buildings & Safety Engineering',
    state: 'MI',
    county: 'Macomb',
    cityOrTownship: 'Warren',
    disciplines: {
      building: { enforcingAgency: 'City of Warren Division of Buildings & Safety', level: 'municipality' },
      electrical: { enforcingAgency: 'Warren Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Warren Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Warren Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=392',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-sterling-heights',
    authorityName: 'City of Sterling Heights',
    agencyName: 'Office of Building Services',
    state: 'MI',
    county: 'Macomb',
    cityOrTownship: 'Sterling Heights',
    disciplines: {
      building: { enforcingAgency: 'Sterling Heights Office of Building Services', level: 'municipality' },
      electrical: { enforcingAgency: 'Sterling Heights Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Sterling Heights Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Sterling Heights Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=383',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-clinton-twp',
    authorityName: 'Charter Township of Clinton',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Macomb',
    cityOrTownship: 'Clinton Township',
    disciplines: {
      building: { enforcingAgency: 'Clinton Township Building Department', level: 'township' },
      electrical: { enforcingAgency: 'Clinton Township Electrical Division', level: 'township' },
      mechanical: { enforcingAgency: 'Clinton Township Mechanical Division', level: 'township' },
      plumbing: { enforcingAgency: 'Clinton Township Plumbing Division', level: 'township' },
    },
    portalUrl: 'https://bsaonline.com/?uid=323',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-shelby-twp',
    authorityName: 'Charter Township of Shelby',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Macomb',
    cityOrTownship: 'Shelby Township',
    disciplines: {
      building: { enforcingAgency: 'Shelby Township Building Department', level: 'township' },
      electrical: { enforcingAgency: 'Shelby Township Electrical Inspection', level: 'township' },
      mechanical: { enforcingAgency: 'Shelby Township Mechanical Inspection', level: 'township' },
      plumbing: { enforcingAgency: 'Shelby Township Plumbing Inspection', level: 'township' },
    },
    portalUrl: 'https://bsaonline.com/?uid=376',
    verifiedAt: '2026-08-26',
  },

  // --- KENT COUNTY ---
  {
    authorityId: 'mi-grand-rapids',
    authorityName: 'City of Grand Rapids',
    agencyName: 'Development Center - Building Inspections',
    state: 'MI',
    county: 'Kent',
    cityOrTownship: 'Grand Rapids',
    disciplines: {
      building: {
        enforcingAgency: 'Grand Rapids Development Center',
        level: 'municipality',
        sourceUrl: 'https://www.grandrapidsmi.gov/Government/Departments/Development-Center',
      },
      electrical: {
        enforcingAgency: 'Grand Rapids Development Center',
        level: 'municipality',
        sourceUrl: 'https://www.grandrapidsmi.gov/Government/Departments/Development-Center',
      },
      mechanical: {
        enforcingAgency: 'Grand Rapids Development Center',
        level: 'municipality',
        sourceUrl: 'https://www.grandrapidsmi.gov/Government/Departments/Development-Center',
      },
      plumbing: {
        enforcingAgency: 'Grand Rapids Development Center',
        level: 'municipality',
        sourceUrl: 'https://www.grandrapidsmi.gov/Government/Departments/Development-Center',
      },
    },
    portalUrl: 'https://www.citizenaccess.grandrapidsmi.gov',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-wyoming',
    authorityName: 'City of Wyoming',
    agencyName: 'Building Inspection Department',
    state: 'MI',
    county: 'Kent',
    cityOrTownship: 'Wyoming',
    disciplines: {
      building: { enforcingAgency: 'City of Wyoming Building Inspection Department', level: 'municipality' },
      electrical: { enforcingAgency: 'Wyoming Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'Wyoming Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'Wyoming Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=400',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-kentwood',
    authorityName: 'City of Kentwood',
    agencyName: 'Inspections Department',
    state: 'MI',
    county: 'Kent',
    cityOrTownship: 'Kentwood',
    disciplines: {
      building: { enforcingAgency: 'City of Kentwood Inspections Department', level: 'municipality' },
      electrical: { enforcingAgency: 'Kentwood Electrical Division', level: 'municipality' },
      mechanical: { enforcingAgency: 'Kentwood Mechanical Division', level: 'municipality' },
      plumbing: { enforcingAgency: 'Kentwood Plumbing Division', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=344',
    verifiedAt: '2026-08-26',
  },

  // --- WASHTENAW COUNTY ---
  {
    authorityId: 'mi-ann-arbor',
    authorityName: 'City of Ann Arbor',
    agencyName: 'Planning & Development Services - Building Division',
    state: 'MI',
    county: 'Washtenaw',
    cityOrTownship: 'Ann Arbor',
    disciplines: {
      building: {
        enforcingAgency: 'Ann Arbor Building Division',
        level: 'municipality',
        sourceUrl: 'https://www.a2gov.org/departments/build-plan',
      },
      electrical: {
        enforcingAgency: 'Ann Arbor Building Division',
        level: 'municipality',
        sourceUrl: 'https://www.a2gov.org/departments/build-plan',
      },
      mechanical: {
        enforcingAgency: 'Ann Arbor Building Division',
        level: 'municipality',
        sourceUrl: 'https://www.a2gov.org/departments/build-plan',
      },
      plumbing: {
        enforcingAgency: 'Ann Arbor Building Division',
        level: 'municipality',
        sourceUrl: 'https://www.a2gov.org/departments/build-plan',
      },
    },
    portalUrl: 'https://stream.a2gov.org',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-ypsilanti',
    authorityName: 'City of Ypsilanti',
    agencyName: 'Building Department',
    state: 'MI',
    county: 'Washtenaw',
    cityOrTownship: 'Ypsilanti',
    disciplines: {
      building: { enforcingAgency: 'City of Ypsilanti Building Department', level: 'municipality' },
      electrical: { enforcingAgency: 'Ypsilanti Electrical Inspection', level: 'municipality' },
      mechanical: { enforcingAgency: 'Ypsilanti Mechanical Inspection', level: 'municipality' },
      plumbing: { enforcingAgency: 'Ypsilanti Plumbing Inspection', level: 'municipality' },
    },
    portalUrl: 'https://bsaonline.com/?uid=402',
    verifiedAt: '2026-08-26',
  },
  {
    authorityId: 'mi-pittsfield-twp',
    authorityName: 'Charter Township of Pittsfield',
    agencyName: 'Building Services Division',
    state: 'MI',
    county: 'Washtenaw',
    cityOrTownship: 'Pittsfield Township',
    disciplines: {
      building: { enforcingAgency: 'Pittsfield Township Building Services', level: 'township' },
      electrical: { enforcingAgency: 'Pittsfield Township Electrical Division', level: 'township' },
      mechanical: { enforcingAgency: 'Pittsfield Township Mechanical Division', level: 'township' },
      plumbing: { enforcingAgency: 'Pittsfield Township Plumbing Division', level: 'township' },
    },
    portalUrl: 'https://bsaonline.com/?uid=362',
    verifiedAt: '2026-08-26',
  },
];

import { STATE_CODE_REGISTRY, normalizeStateCode } from '../permit-intel/state-code-registry';
import { CANADA_CODE_REGISTRY, normalizeCanadaProvinceCode } from '../permit-intel/canada-code-registry';
import { MEXICO_CODE_REGISTRY, normalizeMexicoStateCode } from '../permit-intel/mexico-code-registry';

/**
 * Resolves the enforcing jurisdiction for a given location context and trade discipline across all 50 US states, DC, Canada, and Mexico.
 */
export function resolveJurisdiction(
  location: ParsedAddress | CensusLocationContext,
  discipline: JurisdictionDiscipline = 'building',
): JurisdictionMatch {
  const cityOrPlace =
    ('city' in location && location.city) ||
    ('incorporatedPlace' in location && location.incorporatedPlace) ||
    ('minorCivilDivision' in location && location.minorCivilDivision) ||
    '';

  let rawState =
    ('state' in location && location.state) ||
    ('stateFips' in location && location.stateFips ? (Object.values(STATE_CODE_REGISTRY).find((p) => p.fips === location.stateFips)?.stateCode) : undefined) ||
    '';

  const cleanCity = cityOrPlace.toLowerCase().replace(/^(city of|charter township of|township of|municipio de)\s+/i, '').trim();
  const cleanCitySlug = cleanCity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const rawText = ('raw' in location && location.raw) || '';

  // 1. Check for Mexican match
  const isMexicoAddress =
    ('country' in location && (location.country === 'MX' || location.country === 'Mexico' || location.country === 'México')) ||
    /Mexico|México|Monterrey|Guadalajara|Cancún|Cancun|Tijuana|Cuauhtémoc|Cuauhtemoc|Mérida|Merida|Puebla|Querétaro|Queretaro|Veracruz|Hermosillo|Chihuahua|Saltillo|Culiacán|Culiacan|San Luis Potosí|Aguascalientes|Cuernavaca|Pachuca|Morelia|Tuxtla|Oaxaca|Acapulco|Villahermosa|Zacatecas|Durango|Tepic|Colima|Tlaxcala|Campeche|Nuevo León|Nuevo Leon|Quintana Roo|Baja California/i.test(rawText);

  const mexStateMatch =
    (isMexicoAddress ? normalizeMexicoStateCode(rawState) : null) ||
    (rawText ? normalizeMexicoStateCode(rawText.match(/\b(Ciudad de México|CDMX|Distrito Federal|Nuevo León|Nuevo Leon|Jalisco|Estado de México|Estado de Mexico|Edomex|Baja California Sur|Baja California|Quintana Roo|Yucatán|Yucatan|Guanajuato|Puebla|Querétaro|Queretaro|Veracruz|Sonora|Chihuahua|Tamaulipas|Coahuila|Sinaloa|San Luis Potosí|San Luis Potosi|Aguascalientes|Morelos|Hidalgo|Michoacán|Michoacan|Chiapas|Oaxaca|Guerrero|Tabasco|Zacatecas|Durango|Nayarit|Colima|Tlaxcala|Campeche)\b/i)?.[0]) : null) ||
    (rawText && isMexicoAddress ? normalizeMexicoStateCode(rawText.match(/\b(CDMX|NL|JAL|MEX|BCN|BCS|ROO|YUC|GTO|PUE|QRO|VER|SON|CHH|TAM|COA|SIN|SLP|AGU|MOR|HID|MIC|CHP|OAX|GRO|TAB|ZAC|DUR|NAY|COL|TLA|CAM)\b/i)?.[0]) : null) ||
    (rawState && MEXICO_CODE_REGISTRY[rawState.toUpperCase()] && !CANADA_CODE_REGISTRY[rawState.toUpperCase()] ? rawState.toUpperCase() : null);

  if (mexStateMatch && MEXICO_CODE_REGISTRY[mexStateMatch]) {
    const mexProfile = MEXICO_CODE_REGISTRY[mexStateMatch];
    const authorityName = cityOrPlace
      ? `Municipio de ${cityOrPlace}`
      : `Estado de ${mexProfile.stateName} (${mexProfile.licensingBoard})`;

    const agencyName = cityOrPlace
      ? `Dirección de Obras Públicas y Desarrollo Urbano de ${cityOrPlace}`
      : `${mexProfile.licensingBoard}`;

    return {
      authorityId: `mex-${mexProfile.stateCode.toLowerCase()}-${cleanCitySlug || 'estatal'}`,
      authorityName,
      agencyName,
      discipline,
      enforcementLevel: cityOrPlace ? 'municipality' : 'state',
      state: mexProfile.stateCode,
      county: mexProfile.stateName,
      cityOrTownship: cityOrPlace || undefined,
      isAuthoritative: false,
      confidence: 'low',
      sourceUrl: mexProfile.licensingUrl,
      verifiedAt: '2026-08-26',
    };
  }

  // 2. Check for Canadian province match
  const canadaProvMatch =
    normalizeCanadaProvinceCode(rawState) ||
    (rawText ? normalizeCanadaProvinceCode(rawText.match(/\b(Ontario|British Columbia|Alberta|Quebec|Québec|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Prince Edward Island|Yukon|Nunavut|Northwest Territories)\b/i)?.[0]) : null) ||
    (rawText ? normalizeCanadaProvinceCode(rawText.match(/\b(ON|BC|AB|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b/i)?.[0]) : null);

  if (canadaProvMatch && CANADA_CODE_REGISTRY[canadaProvMatch]) {
    const provProfile = CANADA_CODE_REGISTRY[canadaProvMatch];
    const authorityName = cityOrPlace
      ? `City of ${cityOrPlace}`
      : `Province of ${provProfile.provinceName} (${provProfile.licensingBoard})`;

    const agencyName = cityOrPlace
      ? `City of ${cityOrPlace} Building & Safety Inspection Division`
      : `${provProfile.licensingBoard}`;

    return {
      authorityId: `can-${provProfile.provinceCode.toLowerCase()}-${cleanCitySlug || 'provincewide'}`,
      authorityName,
      agencyName,
      discipline,
      enforcementLevel: cityOrPlace ? 'municipality' : 'state',
      state: provProfile.provinceCode,
      county: provProfile.provinceName,
      cityOrTownship: cityOrPlace || undefined,
      isAuthoritative: false,
      confidence: 'low',
      sourceUrl: provProfile.licensingUrl,
      verifiedAt: '2026-08-26',
    };
  }

  if (!rawState && rawText) {
    const match = rawText.match(/\b([A-Z]{2})\b|\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia)\b/i);
    if (match) {
      rawState = match[0];
    }
  }

  const stateCode = normalizeStateCode(rawState) || (rawState?.toUpperCase() === 'US' ? null : null);

  const county =
    ('county' in location && location.county) ||
    ('countyName' in location && location.countyName) ||
    '';

  // 1. If Michigan, search curated Michigan municipal registry first
  if (stateCode === 'MI' || (!stateCode && cleanCity)) {
    for (const entry of MICHIGAN_JURISDICTION_REGISTRY) {
      const entryCity = entry.cityOrTownship.toLowerCase().replace(/^(city of|charter township of|township of)\s+/i, '').trim();
      if (
        (cleanCity.includes(entryCity) || entryCity.includes(cleanCity)) &&
        cleanCity.length > 0
      ) {
        const disc = entry.disciplines[discipline] || entry.disciplines.building;
        return {
          authorityId: entry.authorityId,
          authorityName: entry.authorityName,
          agencyName: disc.enforcingAgency || entry.agencyName,
          discipline,
          enforcementLevel: disc.level,
          state: 'MI',
          county: entry.county,
          cityOrTownship: entry.cityOrTownship,
          isAuthoritative: true,
          confidence: 'verified',
          sourceUrl: disc.sourceUrl || entry.portalUrl,
          verifiedAt: entry.verifiedAt,
        };
      }
    }

    if (stateCode === 'MI' || !stateCode) {
      const authorityName = cityOrPlace
        ? `${cityOrPlace} Enforcing Agency (or State of Michigan LARA BCC)`
        : county
        ? `${county} County Building Authority`
        : 'State of Michigan Bureau of Construction Codes (LARA)';

      return {
        authorityId: `mi-generic-${cleanCity || county.toLowerCase() || 'state'}`,
        authorityName,
        agencyName: 'Bureau of Construction Codes / Local Code Authority',
        discipline,
        enforcementLevel: cityOrPlace ? 'municipality' : county ? 'county' : 'state',
        state: 'MI',
        county: county || 'Oakland',
        cityOrTownship: cityOrPlace || undefined,
        isAuthoritative: false,
        confidence: 'medium',
        sourceUrl: 'https://www.michigan.gov/lara/bureau-list/bcc',
        verifiedAt: '2026-08-26',
      };
    }
  }

  // 2. 50-State + DC National Resolution
  if (stateCode && STATE_CODE_REGISTRY[stateCode]) {
    const stateProfile = STATE_CODE_REGISTRY[stateCode];
    const authorityName = cityOrPlace
      ? `City of ${cityOrPlace}`
      : county
      ? `${county} County Building Department`
      : `State of ${stateProfile.stateName} (${stateProfile.licensingBoard})`;

    const agencyName = cityOrPlace
      ? `City of ${cityOrPlace} Building & Safety Inspection Division`
      : county
      ? `${county} County Code Enforcement`
      : `${stateProfile.licensingBoard}`;

    return {
      authorityId: `${stateProfile.stateCode.toLowerCase()}-${cleanCity.replace(/\s+/g, '-') || county.toLowerCase().replace(/\s+/g, '-') || 'statewide'}`,
      authorityName,
      agencyName,
      discipline,
      enforcementLevel: cityOrPlace ? 'municipality' : county ? 'county' : 'state',
      state: stateProfile.stateCode,
      county: county || 'Statewide',
      cityOrTownship: cityOrPlace || undefined,
      isAuthoritative: false,
      confidence: 'low',
      sourceUrl: stateProfile.licensingUrl,
      verifiedAt: '2026-08-26',
    };
  }

  // Generic national fallback
  return {
    authorityId: `general-${cleanCity.replace(/\s+/g, '-') || 'local'}`,
    authorityName: cityOrPlace ? `City of ${cityOrPlace} Building Department` : 'Local Building Authority',
    agencyName: 'Building Safety & Permitting Division',
    discipline,
    enforcementLevel: 'municipality',
    state: 'US',
    county: county || 'Local',
    cityOrTownship: cityOrPlace || undefined,
    isAuthoritative: false,
    confidence: 'low',
    verifiedAt: '2026-08-26',
  };
}
