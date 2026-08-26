import type { JurisdictionDiscipline } from '../location-context/types';
import type { CodeAdoption, CodeReference } from './types';

/**
 * Curated Code Catalog with copyright-safe section citations and plain-language contractor summaries.
 * Covers Building (Roofing), Electrical, Mechanical/HVAC, and Plumbing disciplines.
 */

// --- BUILDING & ROOFING ---
export const MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS: CodeReference[] = [
  {
    codeFamily: 'MRC',
    editionYear: '2015',
    section: 'R908.3',
    title: 'Roofing Re-covering and Replacement',
    plainEnglishSummary:
      'A complete tear-off is required when the existing roof has two or more applications of any type of roof covering, or when the existing roof or roof covering is water soaked or deteriorated.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-residential-code-2015/chapter/9/roof-assemblies#R908.3',
  },
  {
    codeFamily: 'MRC',
    editionYear: '2015',
    section: 'R905.1.2',
    title: 'Ice Barrier Requirements',
    plainEnglishSummary:
      'In areas where there has been a history of ice forming along the eaves (all Michigan climate zones), an ice barrier is mandatory from the lowest edges of all eaves to a point at least 24 inches inside the exterior wall line.',
    amendmentType: 'state_amendment',
    citationUrl: 'https://up.codes/viewer/michigan/mi-residential-code-2015/chapter/9/roof-assemblies#R905.1.2',
  },
  {
    codeFamily: 'MRC',
    editionYear: '2015',
    section: 'R905.2.8.5',
    title: 'Drip Edge at Eaves and Rakes',
    plainEnglishSummary:
      'A drip edge is required at eaves and gables of shingle roofs. Overlap must be a minimum of 2 inches, fastened every 4 to 12 inches.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-residential-code-2015/chapter/9/roof-assemblies#R905.2.8.5',
  },
  {
    codeFamily: 'MRC',
    editionYear: '2015',
    section: 'R903.2',
    title: 'Flashing and Valleys',
    plainEnglishSummary:
      'Flashings must be installed at wall/roof intersections, wherever there is a change in roof slope/direction, and around all roof openings.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-residential-code-2015/chapter/9/roof-assemblies#R903.2',
  },
  {
    codeFamily: 'MRC',
    editionYear: '2015',
    section: 'R806.1',
    title: 'Attic Ventilation Cross-Section',
    plainEnglishSummary:
      'Enclosed attics require cross ventilation with a minimum net free ventilating area of 1/150 of the area of the space ventilated (or 1/300 if balanced high/low ventilation and vapor barrier are present).',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-residential-code-2015/chapter/8/roof-ceiling-construction#R806',
  },
];

// --- ELECTRICAL ---
export const MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS: CodeReference[] = [
  {
    codeFamily: 'NEC / MEC Pt 8',
    editionYear: '2023',
    section: 'Art. 230.70',
    title: 'Service Equipment Disconnecting Means',
    plainEnglishSummary:
      'Emergency electrical service disconnect must be readily accessible on the exterior of one- and two-family dwellings.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-electrical-code-2023/chapter/2/wiring-and-protection#230.70',
  },
  {
    codeFamily: 'NEC / MEC Pt 8',
    editionYear: '2023',
    section: 'Art. 625.40',
    title: 'Electric Vehicle Branch Circuit',
    plainEnglishSummary:
      'Each outlet installed for charging electric vehicles shall be supplied by an individual branch circuit rated at least 40 amperes or dedicated continuous load.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-electrical-code-2023/chapter/6/special-equipment#625.40',
  },
  {
    codeFamily: 'NEC / MEC Pt 8',
    editionYear: '2023',
    section: 'Art. 702.5',
    title: 'Optional Standby Generator Interlock',
    plainEnglishSummary:
      'Generators must have an approved manual or automatic transfer switch to isolate the standby system from the utility power grid before energization.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-electrical-code-2023/chapter/7/special-conditions#702.5',
  },
];

// --- MECHANICAL / HVAC ---
export const MICHIGAN_MECHANICAL_CODE_2021_CITATIONS: CodeReference[] = [
  {
    codeFamily: 'MMC / MRC Ch. 14',
    editionYear: '2021',
    section: 'M1401.3',
    title: 'Heating and Cooling Equipment Sizing (Manual J/S)',
    plainEnglishSummary:
      'Heating and cooling equipment sizing must be based on building heat loss/gain calculation procedures per ACCA Manual J, and equipment selected per ACCA Manual S.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-mechanical-code-2021/chapter/14/heating-and-cooling-equipment#M1401.3',
  },
  {
    codeFamily: 'MMC / MRC Ch. 18',
    editionYear: '2021',
    section: 'M1801.1',
    title: 'Chimneys and Direct-Vent Terminations',
    plainEnglishSummary:
      'High-efficiency condensing furnaces and heat pump venting terminations must maintain mandatory clearances from windows, doors, and gas regulators.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-mechanical-code-2021/chapter/18/chimneys-and-vents#M1801',
  },
  {
    codeFamily: 'MMC / MRC Ch. 16',
    editionYear: '2021',
    section: 'M1601.4.1',
    title: 'Duct Sealing & Mastic Standards',
    plainEnglishSummary:
      'All longitudinal and transverse joints, seams, and connections in duct systems must be securely fastened and sealed with approved mastics or gaskets.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-mechanical-code-2021/chapter/16/duct-systems#M1601.4.1',
  },
];

// --- PLUMBING ---
export const MICHIGAN_PLUMBING_CODE_2021_CITATIONS: CodeReference[] = [
  {
    codeFamily: 'MPC / MRC Ch. 28',
    editionYear: '2021',
    section: 'P2804.6.1',
    title: 'Water Heater Pressure Relief Discharge (T&P Valve)',
    plainEnglishSummary:
      'Temperature and pressure relief valve discharge piping must terminate through an air gap, discharge to the floor, or outside with rigid copper, CPVC, or galvanized steel.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-plumbing-code-2021/chapter/28/water-heaters#P2804.6.1',
  },
  {
    codeFamily: 'MPC / MRC Ch. 29',
    editionYear: '2021',
    section: 'P2902.5.3',
    title: 'Lawn Irrigation & Backflow Prevention',
    plainEnglishSummary:
      'The potable water supply to lawn irrigation systems shall be protected against backflow by an atmospheric vacuum breaker, pressure vacuum breaker, or reduced pressure zone assembly.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-plumbing-code-2021/chapter/29/water-supply-and-distribution#P2902.5.3',
  },
  {
    codeFamily: 'MPC / MRC Ch. 30',
    editionYear: '2021',
    section: 'P3005.2',
    title: 'Building Sewer Drainage Cleanouts',
    plainEnglishSummary:
      'Cleanouts shall be installed at intervals of not more than 100 feet in horizontal drainage lines and at the building drain junction.',
    amendmentType: 'standard_model',
    citationUrl: 'https://up.codes/viewer/michigan/mi-plumbing-code-2021/chapter/30/sanitary-drainage#P3005.2',
  },
];

// --- LOCAL AMENDMENTS ---
export const ROYAL_OAK_LOCAL_AMENDMENTS: CodeReference[] = [
  {
    codeFamily: 'Royal Oak Code of Ordinances',
    editionYear: 'Current',
    section: 'Chapter 230 - Building Construction',
    title: 'Contractor Registration & Permit Requirements',
    plainEnglishSummary:
      'All building, electrical, mechanical, and plumbing trade permits require an active Michigan license registered with the City of Royal Oak Building Inspection Division prior to permit issuance.',
    amendmentType: 'local_ordinance',
    citationUrl: 'https://www.romi.gov/176/Building-Inspection',
  },
  {
    codeFamily: 'Royal Oak Building Inspection Notice',
    editionYear: 'Current',
    section: 'Inspection Milestones',
    title: 'Trade Inspection Scheduling Windows',
    plainEnglishSummary:
      'Rough and final trade inspections may be requested online via AccessMyGov or by phone between 8:00 AM and 9:00 AM daily.',
    amendmentType: 'local_ordinance',
    citationUrl: 'https://www.accessmygov.com/?uid=1349',
  },
];

/**
 * Returns applicable code adoptions for a given authority, discipline, and project date.
 */
export function getApplicableCodes(
  authorityId: string,
  discipline: JurisdictionDiscipline = 'building',
  _projectDate?: string,
): CodeAdoption[] {
  if (authorityId.startsWith('mi-')) {
    if (discipline === 'electrical') {
      return [
        {
          codeFamily: 'Michigan Electrical Code (Part 8 / NEC)',
          editionYear: '2023',
          effectiveDate: '2023-04-10',
          governingBody: 'Michigan Bureau of Construction Codes',
          isCurrent: true,
          references: MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS,
        },
      ];
    }

    if (discipline === 'mechanical') {
      return [
        {
          codeFamily: 'Michigan Mechanical Code (MMC)',
          editionYear: '2021',
          effectiveDate: '2021-07-28',
          governingBody: 'Michigan Bureau of Construction Codes',
          isCurrent: true,
          references: MICHIGAN_MECHANICAL_CODE_2021_CITATIONS,
        },
      ];
    }

    if (discipline === 'plumbing') {
      return [
        {
          codeFamily: 'Michigan Plumbing Code (MPC)',
          editionYear: '2021',
          effectiveDate: '2021-07-28',
          governingBody: 'Michigan Bureau of Construction Codes',
          isCurrent: true,
          references: MICHIGAN_PLUMBING_CODE_2021_CITATIONS,
        },
      ];
    }

    // Default: Building / Roofing
    return [
      {
        codeFamily: 'Michigan Residential Code (MRC)',
        editionYear: '2015',
        effectiveDate: '2016-02-08',
        governingBody: 'State of Michigan Bureau of Construction Codes',
        isCurrent: true,
        references: MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS,
      },
    ];
  }

  // Generic fallback
  return [
    {
      codeFamily: 'International Residential Code (IRC)',
      editionYear: '2021',
      effectiveDate: '2021-01-01',
      governingBody: 'International Code Council (ICC)',
      isCurrent: true,
      references: [
        {
          codeFamily: 'IRC',
          editionYear: '2021',
          section: 'General Provisions',
          title: `${discipline.toUpperCase()} Code Standards`,
          plainEnglishSummary: `Governs installation and maintenance of residential ${discipline} assemblies and systems.`,
          amendmentType: 'standard_model',
        },
      ],
    },
  ];
}

/**
 * Returns local municipal amendments for an authority.
 */
export function getLocalAmendments(authorityId: string): CodeReference[] {
  if (authorityId === 'mi-royal-oak') {
    return ROYAL_OAK_LOCAL_AMENDMENTS;
  }
  return [];
}
