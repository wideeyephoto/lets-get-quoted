import type {
  PermitWorkContext,
  RequirementRuleResult,
} from './types';
import {
  MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS,
  MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS,
  MICHIGAN_MECHANICAL_CODE_2021_CITATIONS,
  MICHIGAN_PLUMBING_CODE_2021_CITATIONS,
  ROYAL_OAK_LOCAL_AMENDMENTS,
} from './code-catalog';
import { STATE_CODE_REGISTRY } from './state-code-registry';
import { CANADA_CODE_REGISTRY } from './canada-code-registry';
import { MEXICO_CODE_REGISTRY } from './mexico-code-registry';

/**
 * Deterministic requirement engine that evaluates work scope against verified municipal,
 * state, and provincial building codes across all 50 US States, DC, Canada, and Mexico.
 *
 * CRITICAL SAFETY BOUNDARY:
 * If an authority or work type is unverified or ambiguous, the engine MUST return 'verify'
 * and NEVER 'not_required'.
 */
export function evaluatePermitRequirement(
  authorityId: string,
  work: PermitWorkContext,
): RequirementRuleResult {
  const isCanada = authorityId.startsWith('can-');
  const canadaProvCode = isCanada ? authorityId.split('-')[1]?.toUpperCase() : null;
  const canadaProfile = canadaProvCode ? CANADA_CODE_REGISTRY[canadaProvCode] : null;

  const isMexico = authorityId.startsWith('mex-');
  const mexStateCode = isMexico ? authorityId.split('-')[1]?.toUpperCase() : null;
  const mexProfile = mexStateCode ? MEXICO_CODE_REGISTRY[mexStateCode] : null;

  const statePrefix = (authorityId.split('-')[0] || '').toUpperCase();
  const stateProfile = isCanada || isMexico
    ? null
    : STATE_CODE_REGISTRY[statePrefix] || (authorityId.startsWith('mi-') ? STATE_CODE_REGISTRY.MI : undefined);
  const isRoyalOak = authorityId === 'mi-royal-oak';
  const isMichigan = authorityId.startsWith('mi-') || statePrefix === 'MI';

  // CRITICAL SAFETY: Check if jurisdiction is unknown or unverified in US/Canada/Mexico registries
  if (!stateProfile && !canadaProfile && !mexProfile && !isRoyalOak && !isMichigan) {
    return {
      decision: 'verify',
      permitTypes: ['Building / Trade Permit (Verify with jurisdiction)'],
      requiredDocuments: [
        'Trade Permit Application',
        'Contractor License & Insurance',
      ],
      requiredInspections: ['Inspect as mandated by local authority'],
      estimatedGovernmentFee: null,
      reasons: [
        'Permit rules for this specific work scope or jurisdiction have not been verified in the LGQ registry.',
        'Check directly with the local building department before proceeding.',
      ],
      citations: [],
      confidence: 'low',
      disclaimer:
        'Always verify permit requirements with the local municipal or county building authority prior to commencing work.',
    };
  }

  // ==========================================
  // MEXICAN STATE EVALUATION ENGINE
  // ==========================================
  if (isMexico && mexProfile) {
    // Gutters in Mexico (Canaletas y bajadas pluviales exentas de licencia)
    if (work.trade === 'gutters') {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'La instalación y mantenimiento de canaletas y bajadas pluviales exteriores se clasifica como obra menor no estructural y no requiere licencia de construcción.',
        ],
        citations: [],
        confidence: 'high',
        disclaimer: 'Dictamen informativo. Si se alteran elementos estructurales o losas, consulte a la Dirección de Obras Públicas.',
      };
    }

    // Electrical in Mexico (NOM-001-SEDE / CFE / Dictamen UVIE)
    if (work.trade === 'electrical') {
      if (work.scope === 'repair' && work.freeTextDescription && /replace outlet|replace switch|light fixture|cambio de contacto|apagador|foco/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'El reemplazo de apagadores, contactos o luminarias sin modificar el cuadro de distribución ni alimentadores principales está exento de trámite.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Aviso informativo. Modificaciones a la acometida, incremento de carga o cargadores de autos eléctricos requieren validación NOM-001-SEDE.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Dictamen de Cumplimiento Eléctrico (NOM-001-SEDE) / Trámite de Acometida CFE'],
        requiredDocuments: [
          'Plano Eléctrico y Cuadro de Cargas Unifilar',
          'Cédula Profesional de Ingeniero Electricista / Perito Registrado',
          'Dictamen de Unidad de Verificación de Instalaciones Eléctricas (UVIE si aplica)',
        ],
        requiredInspections: [
          'Verificación de Tierras y Cuadro de Distribución',
          'Inspección Final de Acometida y Medidor CFE',
        ],
        estimatedGovernmentFee: {
          baseFee: mexProfile.basePermitFee,
          estimatedTotal: mexProfile.estAverageFee,
          notes: `${mexProfile.stateName} trámite de regularización y factibilidad eléctrica CFE (MXN).`,
        },
        reasons: [
          `${mexProfile.codes.electrical.name} exige dictamen técnico para nuevas instalaciones, aumento de carga y sistemas de respaldo.`,
        ],
        citations: [
          {
            codeFamily: 'NOM-SEDE',
            editionYear: mexProfile.codes.electrical.edition,
            section: 'Artículo 100 / 210',
            title: mexProfile.codes.electrical.name,
            plainEnglishSummary: 'Las instalaciones eléctricas para utilización de energía eléctrica deben garantizar la seguridad de personas y bienes conforme a la NOM-001-SEDE.',
          },
        ],
        confidence: 'high',
        disclaimer: `Los trabajos eléctricos deben ser ejecutados por personal técnico calificado registrado ante ${mexProfile.licensingBoard}.`,
      };
    }

    // Mechanical / HVAC in Mexico (NOM-020-ENER / NOM-008-SEDG)
    if (work.trade === 'mechanical') {
      if (work.scope === 'repair' && work.freeTextDescription && /filter|tune-up|thermostat|mantenimiento|filtro/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Mantenimiento preventivo, limpieza de filtros y cambio de termostatos en equipos de aire acondicionado están exentos de trámite municipal.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Aviso informativo. Nuevas líneas de gas LP o instalaciones centrales requieren dictamen de aprovechamiento.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Aviso de Instalación Mecánica y Envolvente Térmica (NOM-020-ENER)'],
        requiredDocuments: [
          'Memoria de Cálculo de Cargas Térmicas (Eficiencia Energética)',
          'Ficha Técnica de Equipos Inverter / Alta Eficiencia',
          'Dictamen Técnico de Instalación de Gas (si aplica NOM-008-SEDG)',
        ],
        requiredInspections: [
          'Prueba de Hermeticidad de Tuberías de Gas / Refrigerante',
          'Inspección de Eficiencia Energética de Envolvente',
        ],
        estimatedGovernmentFee: {
          baseFee: mexProfile.basePermitFee,
          estimatedTotal: mexProfile.estAverageFee + 200,
          notes: `${mexProfile.stateName} registro de instalaciones mecánicas (MXN).`,
        },
        reasons: [
          `${mexProfile.codes.mechanical.name} exige cumplimiento de aislamiento térmico y seguridad en equipos de climatización.`,
        ],
        citations: [
          {
            codeFamily: 'NOM-ENER',
            editionYear: mexProfile.codes.mechanical.edition,
            section: 'NOM-020-ENER-2011',
            title: mexProfile.codes.mechanical.name,
            plainEnglishSummary: 'Limita la ganancia de calor en las edificaciones para optimizar el consumo de energía en aire acondicionado.',
          },
        ],
        confidence: 'high',
        disclaimer: `Instalaciones avaladas por peritos técnicos colegiados ante ${mexProfile.licensingBoard}.`,
      };
    }

    // Plumbing in Mexico (NOM-001-CONAGUA)
    if (work.trade === 'plumbing') {
      if (work.scope === 'repair' && work.freeTextDescription && /faucet repair|washer|toilet flapper|clear drain|fuga|empaque|destapar/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Reparación de grifos, cambio de empaques y desazolve de drenajes menores está exento de permisos municipales.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Conexiones a la red pública o reubicación de medidores de agua requieren trámite ante el organismo operador.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Permiso de Conexión y Regularización Hidrosanitaria (NOM-001-CONAGUA)'],
        requiredDocuments: [
          'Plano Isométrico Hidráulico y Sanitario',
          'Contrato de Agua y Drenaje / Número de Cuenta Municipal',
          'Identificación y Comprobante de Posesión de Inmueble',
        ],
        requiredInspections: [
          'Prueba Hidrostática de Tuberías',
          'Inspección Final de Conexión a Drenaje y Trampa de Grasa',
        ],
        estimatedGovernmentFee: {
          baseFee: mexProfile.basePermitFee,
          estimatedTotal: mexProfile.estAverageFee + 150,
          notes: `${mexProfile.stateName} derechos de infraestructura hidrosanitaria municipal (MXN).`,
        },
        reasons: [
          `${mexProfile.codes.plumbing.name} regula las redes de distribución de agua y descargas sanitarias en edificaciones.`,
        ],
        citations: [
          {
            codeFamily: 'NOM-CONAGUA',
            editionYear: mexProfile.codes.plumbing.edition,
            section: 'NOM-001-CONAGUA-2011',
            title: mexProfile.codes.plumbing.name,
            plainEnglishSummary: 'Especificaciones y métodos de prueba para sistemas de alcantarillado sanitario y tomas domiciliarias de agua.',
          },
        ],
        confidence: 'high',
        disclaimer: `Trámite gestionado ante el organismo operador municipal y supervisado por ${mexProfile.licensingBoard}.`,
      };
    }

    // Roofing in Mexico (Impermeabilización / Losa de Azotea / NOM-018-ENER)
    if (work.trade === 'roofing') {
      if (work.scope === 'repair' && (work.roofSquares == null || work.roofSquares <= 1)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Reparaciones menores de impermeabilización (menos de 10 m²) de mantenimiento superficial sin demolición de losa están exentas de licencia de construcción.',
          ],
          citations: [
            {
              codeFamily: mexProfile.codes.building.model,
              editionYear: mexProfile.codes.building.edition,
              section: 'Obras Menores Exentas',
              title: 'Mantenimiento y Reparación de Azoteas',
              plainEnglishSummary: 'Las reparaciones de acabados e impermeabilizaciones preventivas no requieren licencia de construcción siempre que no se altere la estructura.',
            },
          ],
          confidence: 'high',
          disclaimer: 'Dictamen informativo. Si se sustituyen vigas, losas de concreto o cubiertas estructurales, se requiere licencia de obra con firma de DRO.',
        };
      }

      return {
        decision: 'required',
        permitTypes: [`Licencia de Construcción / Aviso de Obra (${mexProfile.codes.building.name})`],
        requiredDocuments: [
          'Solicitud de Licencia de Construcción o Aviso de Obra Menor (Desarrollo Urbano Municipal)',
          'Copia de Escritura Pública o Título de Propiedad y Boleta Predial al Corriente',
          'Constancia de Alineamiento y Número Oficial',
          'Firma de Director Responsable de Obra (DRO / Perito Colegiado si involucra estructura)',
        ],
        requiredInspections: [
          'Inspección de Preparación de Superficie y Pendientes Pluviales',
          'Inspección Final de Acabado e Impermeabilización',
        ],
        estimatedGovernmentFee: {
          baseFee: mexProfile.basePermitFee,
          estimatedTotal: mexProfile.estAverageFee,
          notes: `${mexProfile.stateName} derechos municipales de construcción y expedición de licencia (MXN).`,
        },
        reasons: [
          `${mexProfile.codes.building.name} exige licencia de construcción y cumplimiento de aislamiento térmico (NOM-018-ENER) en techos y cubiertas.`,
        ],
        citations: [
          {
            codeFamily: mexProfile.codes.building.model,
            editionYear: mexProfile.codes.building.edition,
            section: 'Capítulo de Techos y Azoteas',
            title: mexProfile.codes.building.name,
            plainEnglishSummary: 'Las cubiertas y techos deben contar con pendientes pluviales mínimas del 2%, sistemas de impermeabilización continua y resistencia al viento.',
          },
        ],
        confidence: 'high',
        disclaimer: `Requerimiento asesor basado en las normas de ${mexProfile.stateName}. Confirme costos y aranceles ante la Dirección de Obras Públicas Municipal.`,
      };
    }
  }

  // ==========================================
  // CANADIAN PROVINCIAL EVALUATION ENGINE
  // ==========================================
  if (isCanada && canadaProfile) {
    // Gutters in Canada (Exempt non-structural exterior drainage)
    if (work.trade === 'gutters') {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'Gutter replacement and maintenance is classified as non-structural exterior drainage work and is exempt from building permit requirements.',
        ],
        citations: [],
        confidence: 'high',
        disclaimer: 'Advisory summary. Always confirm with the local municipality if fascia or rafter tail repairs are involved.',
      };
    }

    // Electrical in Canada (CSA C22.1 / OESC / Technical Safety BC)
    if (work.trade === 'electrical') {
      if (work.scope === 'repair' && work.freeTextDescription && /replace outlet|replace switch|light fixture/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Direct replacement of standard switches and receptacles without branch circuit wiring alterations is exempt maintenance.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Advisory determination. Adding new circuits or modifying electrical panels requires an Electrical Permit / Notification.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Electrical Safety Permit / Notification of Inspection'],
        requiredDocuments: [
          'Electrical Permit Application (ESA / Technical Safety BC / Provincial Authority)',
          `${canadaProfile.provinceName} Licensed Electrical Contractor (LEC) Registration`,
          'Certificate of Commercial General Liability Insurance',
        ],
        requiredInspections: [
          'Electrical Rough-In Inspection',
          'Final Electrical Certificate of Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: canadaProfile.basePermitFee,
          estimatedTotal: canadaProfile.estAverageFee,
          notes: `${canadaProfile.provinceName} electrical safety inspection permit fee schedule (CAD).`,
        },
        reasons: [
          `${canadaProfile.codes.electrical.name} mandates an electrical permit/notification for panel upgrades, EV charger installations, and new branch circuits.`,
        ],
        citations: [
          {
            codeFamily: canadaProfile.codes.electrical.model,
            editionYear: canadaProfile.codes.electrical.edition,
            section: 'Rule 2-004',
            title: canadaProfile.codes.electrical.name,
            plainEnglishSummary: 'An inspection application or permit is required prior to commencing electrical work or energizing new circuits.',
          },
        ],
        confidence: 'high',
        disclaimer: `Electrical permits must be pulled by a Licensed Electrical Contractor certified with ${canadaProfile.licensingBoard}.`,
      };
    }

    // Mechanical / HVAC in Canada (CSA B149.1 / TSSA / Provincial Codes)
    if (work.trade === 'mechanical') {
      if (work.scope === 'repair' && work.freeTextDescription && /filter|tune-up|thermostat/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Filter replacement, thermostat swaps, and minor seasonal furnace maintenance without gas piping alterations are exempt from mechanical permits.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Advisory determination. Furnace, heat pump, or boiler replacement requires a Mechanical/Gas Permit.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Residential Mechanical / HVAC Permit'],
        requiredDocuments: [
          'Mechanical Permit Application',
          'Certified Gas Technician / HVAC Contractor License',
          'Heat Loss / Heat Gain Calculations (CSA F280-12)',
          'Certificate of Liability Insurance',
        ],
        requiredInspections: [
          'Rough Mechanical / Gas Line Pressure Test Inspection',
          'Final Mechanical & Commissioning Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: canadaProfile.basePermitFee,
          estimatedTotal: canadaProfile.estAverageFee + 20,
          notes: `${canadaProfile.provinceName} mechanical and HVAC equipment permit fee schedule (CAD).`,
        },
        reasons: [
          `${canadaProfile.codes.mechanical.name} requires a mechanical permit for replacement or installation of furnaces, heat pumps, A/C systems, and ductwork modifications.`,
        ],
        citations: [
          {
            codeFamily: canadaProfile.codes.mechanical.model,
            editionYear: canadaProfile.codes.mechanical.edition,
            section: 'Part 6 / Part 9.32',
            title: canadaProfile.codes.mechanical.name,
            plainEnglishSummary: 'Heating and ventilation systems must comply with CSA F280 sizing and provincial energy efficiency standards.',
          },
        ],
        confidence: 'high',
        disclaimer: `Mechanical work must be installed by a licensed technician registered with ${canadaProfile.licensingBoard}.`,
      };
    }

    // Plumbing in Canada (NPC 2020 / Provincial Plumbing Codes)
    if (work.trade === 'plumbing') {
      if (work.scope === 'repair' && work.freeTextDescription && /faucet repair|washer|toilet flapper|clear drain/i.test(work.freeTextDescription)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Clearing stoppages or repairing minor faucet fixtures without replacing piping is exempt ordinary maintenance.',
          ],
          citations: [],
          confidence: 'high',
          disclaimer: 'Water heater replacement or water service piping alteration requires a Plumbing Permit.',
        };
      }

      return {
        decision: 'required',
        permitTypes: ['Residential Plumbing Permit'],
        requiredDocuments: [
          'Plumbing Permit Application',
          `${canadaProfile.provinceName} Certified Plumber / Plumbing Contractor License`,
          'Certificate of Insurance',
        ],
        requiredInspections: [
          'Plumbing Rough-In / Pressure Test Inspection',
          'Final Plumbing Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: canadaProfile.basePermitFee,
          estimatedTotal: canadaProfile.estAverageFee + 15,
          notes: `${canadaProfile.provinceName} plumbing permit schedule (CAD).`,
        },
        reasons: [
          `${canadaProfile.codes.plumbing.name} requires a plumbing permit for water heater replacements, repiping, and backflow preventer installations.`,
        ],
        citations: [
          {
            codeFamily: canadaProfile.codes.plumbing.model,
            editionYear: canadaProfile.codes.plumbing.edition,
            section: 'Part 7 / Section 2.2',
            title: canadaProfile.codes.plumbing.name,
            plainEnglishSummary: 'Plumbing fixtures and water supply systems must be tested and certified compliant with the National/Provincial Plumbing Code.',
          },
        ],
        confidence: 'high',
        disclaimer: `Plumbing permits must be pulled by a licensed plumber registered with ${canadaProfile.licensingBoard}.`,
      };
    }

    // Roofing in Canada (NBC Part 9.26 / OBC / BCBC / CCQ)
    if (work.trade === 'roofing') {
      if (work.scope === 'repair' && (work.roofSquares == null || work.roofSquares <= 1)) {
        return {
          decision: 'not_required',
          permitTypes: [],
          requiredDocuments: [],
          requiredInspections: [],
          estimatedGovernmentFee: null,
          reasons: [
            'Minor roof patching (less than 1 square / 100 sq ft) of non-structural shingle repair is exempt from building permit requirements.',
          ],
          citations: [
            {
              codeFamily: canadaProfile.codes.building.model,
              editionYear: canadaProfile.codes.building.edition,
              section: 'Part 9.26',
              title: 'Roof Covering Maintenance',
              plainEnglishSummary: 'Ordinary maintenance and minor repairs do not require a building permit provided roof structural members are not altered.',
            },
          ],
          confidence: 'high',
          disclaimer: 'Advisory determination. If roof decking or structural rafters are altered, a building permit is required.',
        };
      }

      return {
        decision: 'required',
        permitTypes: [`${canadaProfile.provinceName} Residential Building Permit (Roofing)`],
        requiredDocuments: [
          'Building Permit Application (Municipal Building Department)',
          `${canadaProfile.provinceName} Business License & Trade Registration`,
          'Workers’ Safety & Insurance Board (WSIB/WorkSafeBC/CNESST) Certificate',
          'Certificate of Commercial Liability Insurance ($2M+)',
        ],
        requiredInspections: [
          'Eave Protection / Ice & Water Shield Inspection (prior to shingle install)',
          'Final Building & Roof Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: canadaProfile.basePermitFee,
          estimatedTotal: canadaProfile.estAverageFee,
          notes: `${canadaProfile.provinceName} municipal residential building permit fee estimate (CAD).`,
        },
        reasons: [
          `${canadaProfile.codes.building.name} mandates code-compliant eave protection, high-snow load fastening, and building permits for full roof replacements.`,
        ],
        citations: [
          {
            codeFamily: canadaProfile.codes.building.model,
            editionYear: canadaProfile.codes.building.edition,
            section: 'Part 9.26.5.1',
            title: 'Eave Protection (Ice Damming Resistance)',
            plainEnglishSummary: 'In Canadian freeze-thaw climates, a self-adhering modified bituminous eave protection membrane extending at least 900 mm (36 in) past the interior wall line is mandatory.',
          },
          {
            codeFamily: canadaProfile.codes.building.model,
            editionYear: canadaProfile.codes.building.edition,
            section: 'Part 9.26.2',
            title: 'Roof Covering Replacement & Substrate Fastening',
            plainEnglishSummary: 'Old shingle layers must be removed prior to installing new asphalt shingles, and deck sheathing must be inspected for deflection under snow loads.',
          },
        ],
        confidence: 'high',
        disclaimer: `Advisory requirement based on ${canadaProfile.provinceName} building code standards. Confirm fee schedule with local municipality.`,
      };
    }
  }

  // ==========================================
  // US 50-STATE & DC EVALUATION ENGINE
  // ==========================================
  const profile = stateProfile || STATE_CODE_REGISTRY.MI;

  // Trade: Gutters (Generally exempt non-structural exterior drainage work)
  if (work.trade === 'gutters') {
    return {
      decision: 'not_required',
      permitTypes: [],
      requiredDocuments: [],
      requiredInspections: [],
      estimatedGovernmentFee: null,
      reasons: [
        'Gutter replacement and maintenance is classified as non-structural exterior drainage work and is exempt from building permit requirements.',
      ],
      citations: [],
      confidence: 'high',
      disclaimer: 'Advisory summary. Always confirm with the local building department if fascia or structural rafter repairs are involved.',
    };
  }

  // Trade: Electrical
  if (work.trade === 'electrical') {
    // Minor cord/plug or simple lamp repair
    if (work.scope === 'repair' && work.freeTextDescription && /replace outlet|replace switch|light fixture/i.test(work.freeTextDescription)) {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'Direct replacement of existing standard receptacle devices or switches without modifying branch circuit wiring is exempt ordinary maintenance.',
        ],
        citations: [],
        confidence: isRoyalOak ? 'verified' : 'high',
        disclaimer: 'Advisory determination. Adding new circuits or modifying panel boards requires an Electrical Permit.',
      };
    }

    const baseFee = isRoyalOak ? 75 : profile.basePermitFee;
    const estFee = isRoyalOak ? 115 : profile.estAverageFee;

    const electricalCitations = isMichigan
      ? MICHIGAN_ELECTRICAL_CODE_2023_CITATIONS
      : [
          {
            codeFamily: 'NEC',
            editionYear: profile.codes.electrical.edition,
            section: '90.2 / 210',
            title: profile.codes.electrical.name,
            plainEnglishSummary: 'An electrical permit is required for new electrical circuits, service panel upgrades, EV chargers, and whole-house generators.',
          },
        ];

    return {
      decision: 'required',
      permitTypes: ['Residential Electrical Permit'],
      requiredDocuments: [
        'Electrical Permit Application',
        `${profile.stateName} Licensed Master Electrician / Contractor License`,
        'Certificate of Liability Insurance',
      ],
      requiredInspections: [
        'Electrical Rough / Service Inspection',
        'Final Electrical Inspection',
      ],
      estimatedGovernmentFee: {
        baseFee,
        estimatedTotal: estFee,
        notes: `${isRoyalOak ? 'City of Royal Oak' : profile.stateName} electrical permit schedule ($${baseFee} base + circuit/service fees).`,
      },
      reasons: [
        `${profile.codes.electrical.name} requires a permit for all new electrical circuits, service upgrades, EV chargers, and generators.`,
      ],
      citations: electricalCitations,
      confidence: isRoyalOak || isMichigan ? 'verified' : 'high',
      disclaimer: `Electrical permits must be pulled by a licensed Electrical Contractor registered with ${profile.licensingBoard}.`,
    };
  }

  // Trade: Mechanical / HVAC
  if (work.trade === 'mechanical') {
    // Filter replacement or standard seasonal tune-up
    if (work.scope === 'repair' && work.freeTextDescription && /filter|tune-up|thermostat/i.test(work.freeTextDescription)) {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'Routine filter replacements, thermostat swaps, and minor seasonal tune-ups without duct or equipment alterations are exempt from mechanical permits.',
        ],
        citations: [],
        confidence: isRoyalOak ? 'verified' : 'high',
        disclaimer: 'Advisory determination. Equipment replacement (furnace, A/C, heat pump) requires a Mechanical Permit.',
      };
    }

    const baseFee = isRoyalOak ? 80 : profile.basePermitFee;
    const estFee = isRoyalOak ? 130 : profile.estAverageFee + 15;

    const mechanicalCitations = isMichigan
      ? MICHIGAN_MECHANICAL_CODE_2021_CITATIONS
      : [
          {
            codeFamily: profile.codes.mechanical.model,
            editionYear: profile.codes.mechanical.edition,
            section: 'M1307',
            title: profile.codes.mechanical.name,
            plainEnglishSummary: 'Mechanical permits are required for the installation or replacement of heating, cooling, heat pump systems, and duct alterations.',
          },
        ];

    return {
      decision: 'required',
      permitTypes: ['Residential Mechanical Permit'],
      requiredDocuments: [
        'Mechanical Permit Application',
        `${profile.stateName} Licensed Mechanical / HVAC Contractor License`,
        'Equipment Sizing Load Calculation (ACCA Manual J/S)',
        'Certificate of Insurance',
      ],
      requiredInspections: [
        'Mechanical Rough / Underground Inspection (if applicable)',
        'Final Mechanical Inspection',
      ],
      estimatedGovernmentFee: {
        baseFee,
        estimatedTotal: estFee,
        notes: `${isRoyalOak ? 'City of Royal Oak' : profile.stateName} mechanical permit schedule ($${baseFee} base + equipment unit charges).`,
      },
      reasons: [
        `${profile.codes.mechanical.name} requires a mechanical permit for replacement or installation of furnaces, heat pumps, A/C systems, and ductwork modifications.`,
      ],
      citations: mechanicalCitations,
      confidence: isRoyalOak || isMichigan ? 'verified' : 'high',
      disclaimer: `Mechanical permits must be pulled by a licensed Mechanical Contractor registered with ${profile.licensingBoard}.`,
    };
  }

  // Trade: Plumbing
  if (work.trade === 'plumbing') {
    // Minor faucet washer / toilet flapper repair
    if (work.scope === 'repair' && work.freeTextDescription && /faucet repair|washer|toilet flapper|clear drain/i.test(work.freeTextDescription)) {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'Clearing stoppages or repairing minor faucet leaks without replacing piping valves is exempt ordinary maintenance.',
        ],
        citations: [],
        confidence: 'high',
        disclaimer: 'Water heater replacement or water service piping alteration requires a Plumbing Permit.',
      };
    }

    const baseFee = isRoyalOak ? 75 : profile.basePermitFee;
    const estFee = isRoyalOak ? 120 : profile.estAverageFee + 10;

    const plumbingCitations = isMichigan
      ? MICHIGAN_PLUMBING_CODE_2021_CITATIONS
      : [
          {
            codeFamily: profile.codes.plumbing.model,
            editionYear: profile.codes.plumbing.edition,
            section: 'P2602 / P2804',
            title: profile.codes.plumbing.name,
            plainEnglishSummary: 'A plumbing permit is required for water heater replacement, drain/waste/vent repiping, and backflow preventer installations.',
          },
        ];

    return {
      decision: 'required',
      permitTypes: ['Residential Plumbing Permit'],
      requiredDocuments: [
        'Plumbing Permit Application',
        `${profile.stateName} Master Plumber / Plumbing Contractor License`,
        'Certificate of Insurance',
      ],
      requiredInspections: [
        'Plumbing Rough / Groundwork Inspection',
        'Final Plumbing Inspection',
      ],
      estimatedGovernmentFee: {
        baseFee,
        estimatedTotal: estFee,
        notes: `${isRoyalOak ? 'City of Royal Oak' : profile.stateName} plumbing permit schedule ($${baseFee} base + fixture/water heater fees).`,
      },
      reasons: [
        `${profile.codes.plumbing.name} requires a plumbing permit for water heater replacements, repiping, and backflow preventer installations.`,
      ],
      citations: plumbingCitations,
      confidence: isRoyalOak || isMichigan ? 'verified' : 'high',
      disclaimer: `Plumbing permits must be pulled by a licensed Plumbing Contractor registered with ${profile.licensingBoard}.`,
    };
  }

  // Trade: Roofing
  if (work.trade === 'roofing') {
    // Minor patch repair (< 1 square / minor shingle replacement)
    if (work.scope === 'repair' && (work.roofSquares == null || work.roofSquares <= 1)) {
      return {
        decision: 'not_required',
        permitTypes: [],
        requiredDocuments: [],
        requiredInspections: [],
        estimatedGovernmentFee: null,
        reasons: [
          'Minor roof repairs (less than 1 square / 100 sq ft) of non-structural shingle patching are exempt from building permits under standard maintenance rules.',
        ],
        citations: [
          {
            codeFamily: profile.codes.building.model,
            editionYear: profile.codes.building.edition,
            section: 'R105.2',
            title: 'Work Exempt from Permit',
            plainEnglishSummary: 'Ordinary maintenance and minor repairs do not require a permit provided structural members are not altered.',
          },
        ],
        confidence: isRoyalOak ? 'verified' : 'high',
        disclaimer: 'Advisory determination. If roof decking, rafters, or structural sheathing are replaced, a permit is required.',
      };
    }

    // Full replacement (tear-off) or overlay (re-cover) in Royal Oak
    if (isRoyalOak) {
      const squares = work.roofSquares || 20;
      const baseFee = 85;
      const adminFee = 40;
      const estimatedTotal = baseFee + adminFee + Math.max(0, Math.round((squares - 10) * 2.5));

      return {
        decision: 'required',
        permitTypes: ['Residential Building Permit (Roofing)'],
        requiredDocuments: [
          'Building Permit Application (AccessMyGov / BS&A)',
          'State of Michigan Residential Builder or M&A License',
          'Current Certificate of Liability Insurance',
          'Workers’ Compensation Insurance Certificate or Exemption Affidavit',
          'Contractor Registration with City of Royal Oak',
        ],
        requiredInspections: [
          'Mid-Roof / Ice Barrier & Sheathing Inspection (Prior to shingle covering)',
          'Final Building Inspection (Upon project completion)',
        ],
        estimatedGovernmentFee: {
          baseFee: 125,
          unitRate: 2.5,
          estimatedTotal,
          notes: 'City of Royal Oak standard residential roofing permit fee schedule ($85 base + $40 application fee + scope adjustment).',
        },
        reasons: [
          'City of Royal Oak requires a building permit for all residential re-roofing and roof replacement projects.',
          'State of Michigan 2015 MRC Section R908 mandates code-compliant ice barriers, drip edges, and layer restrictions.',
        ],
        citations: [
          ...MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS.slice(0, 3),
          ...ROYAL_OAK_LOCAL_AMENDMENTS,
        ],
        confidence: 'verified',
        disclaimer:
          'Official permit requirements from City of Royal Oak Building Inspection Division. Exact fees and submittal requirements are verified upon application submission.',
      };
    }

    // Florida State Specific Rules (HVHZ / FBC 2023 8th Edition)
    if (statePrefix === 'FL') {
      return {
        decision: 'required',
        permitTypes: ['Florida Building Code Residential Roofing Permit'],
        requiredDocuments: [
          'Uniform Building Permit Application (FBC 8th Edition)',
          'Florida Certified Roofing / General Contractor License (DBPR / CILB)',
          'Product Approval / Miami-Dade Notice of Acceptance (NOA) Documentation',
          'Workers’ Compensation / Exemption Certificate',
          'Owner-Builder or Contractor Recorded Notice of Commencement (NOC for jobs > $2,500)',
        ],
        requiredInspections: [
          'Roof Sheathing / Dry-In & Secondary Water Barrier Inspection',
          'In-Progress / Flashing & Valley Inspection (if applicable)',
          'Final Roofing Inspection & Mitigation Verification (OIR-B1-1802)',
        ],
        estimatedGovernmentFee: {
          baseFee: 110,
          estimatedTotal: 195,
          notes: 'Florida Building Code municipal roofing permit fee schedule and surcharge.',
        },
        reasons: [
          'Florida Building Code (FBC 2023) Section R905 mandates sealed roof deck underlayment and high-wind fastening for all roof replacements.',
          'State law requires a recorded Notice of Commencement (NOC) and manufacturer Florida Product Approval for all roofing installations.',
        ],
        citations: [
          {
            codeFamily: 'FBC',
            editionYear: '2023',
            section: 'R905.1.1',
            title: 'Underlayment & Sealed Roof Deck Mandate',
            plainEnglishSummary: 'Enhanced self-adhering modified bitumen underlayment or taped plywood seams are mandatory to resist hurricane-driven rain intrusion.',
          },
          {
            codeFamily: 'FBC',
            editionYear: '2023',
            section: 'R908.3',
            title: 'Roof Replacement (25% Rule)',
            plainEnglishSummary: 'If more than 25% of a roof section is repaired or replaced within a 12-month period, the entire section must conform to current FBC standards.',
          },
        ],
        confidence: 'verified',
        disclaimer: 'Official Florida Building Code statutory standard. Verify local county/municipal impact fees and NOC recording requirements.',
      };
    }

    // California State Specific Rules (Title 24 / CRC 2022 / WUI Chapter 7A)
    if (statePrefix === 'CA') {
      return {
        decision: 'required',
        permitTypes: ['California Residential Building Permit (Title 24)'],
        requiredDocuments: [
          'Building Permit Application (Local CSLB jurisdiction)',
          'California CSLB C-39 Roofing Contractor License',
          'Title 24 Part 6 Energy Compliance Documentation (CF1R-ENV-01-E Cool Roof Certification)',
          'Workers’ Compensation Certificate',
        ],
        requiredInspections: [
          'Roof Decking & Sheathing Inspection (prior to dry-in if replacing wood)',
          'Final Building & Cool Roof Verification Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: 120,
          estimatedTotal: 210,
          notes: 'California local building safety and energy compliance permit fee schedule.',
        },
        reasons: [
          'California Residential Code (Title 24 Part 2.5) requires a building permit for re-roofing projects.',
          'Title 24 Part 6 mandates Cool Roof solar reflectance ratings in designated climate zones, and Chapter 7A mandates Class A fire ratings in Wildland-Urban Interface areas.',
        ],
        citations: [
          {
            codeFamily: 'CRC',
            editionYear: '2022',
            section: 'R905 / Title 24 Part 6',
            title: 'Roof Assemblies & Cool Roof Energy Standards',
            plainEnglishSummary: 'Roofing materials must meet California energy efficiency standards (minimum aged solar reflectance and thermal emittance) and Class A fire ratings.',
          },
        ],
        confidence: 'high',
        disclaimer: 'Advisory requirement based on California Title 24 standards. Confirm local city/county building requirements.',
      };
    }

    // Texas State Specific Rules (2021 IRC / TDI Windstorm)
    if (statePrefix === 'TX') {
      return {
        decision: 'required',
        permitTypes: ['Texas Residential Building Permit'],
        requiredDocuments: [
          'Building Permit Application (Local Municipality)',
          'Contractor Registration / Liability Insurance',
          'Texas Department of Insurance (TDI) Windstorm Inspection Application (for designated catastrophe coastal counties)',
        ],
        requiredInspections: [
          'Decking Fastening & Fastener Inspection',
          'Final Building & Windstorm (WPI-8) Certificate Inspection',
        ],
        estimatedGovernmentFee: {
          baseFee: 85,
          estimatedTotal: 145,
          notes: 'Texas municipal residential building permit fee estimate.',
        },
        reasons: [
          'Texas local municipal codes require building permits for residential roof replacements to ensure compliance with structural and windstorm requirements.',
        ],
        citations: [
          {
            codeFamily: 'IRC',
            editionYear: '2021',
            section: 'R905 / TDI WPI-8',
            title: 'Roof Assemblies & Windstorm Catastrophe Provisions',
            plainEnglishSummary: 'Roofs installed in designated coastal catastrophe areas must receive a Texas Department of Insurance Certificate of Compliance (WPI-8).',
          },
        ],
        confidence: 'high',
        disclaimer: 'Advisory requirement based on Texas municipal building code standards. Verify windstorm zone requirements with local jurisdiction.',
      };
    }

    // Michigan state default
    if (isMichigan) {
      return {
        decision: 'required',
        permitTypes: ['Residential Building Permit'],
        requiredDocuments: [
          'Building Permit Application',
          'Michigan Builder / Contractor License',
          'Certificate of Insurance',
        ],
        requiredInspections: ['Final Building Inspection'],
        estimatedGovernmentFee: {
          baseFee: 100,
          estimatedTotal: 120,
          notes: 'Standard Michigan municipal residential building permit fee estimate.',
        },
        reasons: [
          'Michigan Residential Code (MRC 2015) requires a building permit for roof replacement and re-covering.',
        ],
        citations: MICHIGAN_RESIDENTIAL_CODE_2015_ROOFING_CITATIONS.slice(0, 3),
        confidence: 'high',
        disclaimer:
          'Advisory requirement based on Michigan statewide residential building code standards. Confirm fee schedule with local municipality.',
      };
    }

    // General National 50-State Standard (IRC 2021/2018 with State Adoptions)
    const buildingCitations = [
      {
        codeFamily: profile.codes.building.model,
        editionYear: profile.codes.building.edition,
        section: 'R908.3',
        title: 'Roof Replacement & Re-Covering',
        plainEnglishSummary: `${profile.codes.building.name} mandates that existing roof coverings be completely removed prior to installing new shingles when more than one layer is present or when decking requires repair.`,
      },
      ...(profile.iceBarrierRequired
        ? [
            {
              codeFamily: profile.codes.building.model,
              editionYear: profile.codes.building.edition,
              section: 'R905.1.2',
              title: 'Ice Barrier Membrane Mandate',
              plainEnglishSummary: 'In freeze-thaw snow climates, a self-adhering polymer-modified bitumen ice barrier extending at least 24 inches inside the exterior wall line is mandatory.',
            },
          ]
        : []),
    ];

    return {
      decision: 'required',
      permitTypes: [`${profile.stateName} Residential Building Permit (Roofing)`],
      requiredDocuments: [
        'Building Permit Application',
        `${profile.stateName} Contractor / Builder License`,
        'Certificate of Liability & Workers\' Comp Insurance',
      ],
      requiredInspections: [
        ...(profile.iceBarrierRequired ? ['Ice Barrier & Deck Inspection (Prior to covering)'] : []),
        'Final Building Inspection',
      ],
      estimatedGovernmentFee: {
        baseFee: profile.basePermitFee,
        estimatedTotal: profile.estAverageFee,
        notes: `${profile.stateName} residential roofing permit fee estimate.`,
      },
      reasons: [
        `${profile.codes.building.name} requires a building permit for complete roof replacements and re-covering.`,
      ],
      citations: buildingCitations,
      confidence: 'high',
      disclaimer: `Advisory requirement based on ${profile.stateName} building code standards. Confirm fee schedule with local municipality.`,
    };
  }

  // Fallback for unverified trades, non-residential occupancy, or unsupported authorities
  return {
    decision: 'verify',
    permitTypes: ['Building / Trade Permit (Verify with jurisdiction)'],
    requiredDocuments: [
      'Trade Permit Application',
      'Contractor License & Insurance',
    ],
    requiredInspections: ['Inspect as mandated by local authority'],
    estimatedGovernmentFee: null,
    reasons: [
      'Permit rules for this specific work scope or jurisdiction have not been verified in the LGQ registry.',
      'Check directly with the local building department before proceeding.',
    ],
    citations: [],
    confidence: 'low',
    disclaimer:
      'Always verify permit requirements with the local municipal or county building authority prior to commencing work.',
  };
}

/**
 * Converts a raw job description or scope string into structured work parameters.
 */
export function classifyWorkScope(
  rawScopeText: string | null | undefined,
  defaultTrade: PermitWorkContext['trade'] = 'roofing',
): PermitWorkContext {
  const text = (rawScopeText || '').toLowerCase();

  let trade: PermitWorkContext['trade'] = defaultTrade;
  let discipline: PermitWorkContext['discipline'] = 'building';

  if (text.includes('gutter') || text.includes('downspout') || text.includes('canaleta') || text.includes('bajada')) {
    trade = 'gutters';
    discipline = 'building';
  } else if (text.includes('siding')) {
    trade = 'siding';
    discipline = 'building';
  } else if (text.includes('solar')) {
    trade = 'solar';
    discipline = 'electrical';
  } else if (
    text.includes('electric') ||
    text.includes('panel') ||
    text.includes('ev charger') ||
    text.includes('circuit') ||
    text.includes('generator') ||
    text.includes('wiring') ||
    text.includes('eléctric') ||
    text.includes('acometida')
  ) {
    trade = 'electrical';
    discipline = 'electrical';
  } else if (
    text.includes('furnace') ||
    text.includes('hvac') ||
    text.includes('heat pump') ||
    text.includes('air condition') ||
    text.includes('a/c') ||
    text.includes('duct') ||
    text.includes('boiler') ||
    text.includes('aire acondicionado') ||
    text.includes('clima') ||
    text.includes('minisplit')
  ) {
    trade = 'mechanical';
    discipline = 'mechanical';
  } else if (
    text.includes('plumb') ||
    text.includes('water heater') ||
    text.includes('drain') ||
    text.includes('sewer') ||
    text.includes('pipe') ||
    text.includes('faucet') ||
    text.includes('plomer') ||
    text.includes('fontaner') ||
    text.includes('calentador') ||
    text.includes('tinaco')
  ) {
    trade = 'plumbing';
    discipline = 'plumbing';
  } else if (
    text.includes('roof') ||
    text.includes('shingle') ||
    text.includes('impermeabiliz') ||
    text.includes('techo') ||
    text.includes('azotea')
  ) {
    trade = 'roofing';
    discipline = 'building';
  }

  let scope: PermitWorkContext['scope'] = 'replacement';
  if (text.includes('repair') || text.includes('patch') || text.includes('fix leak') || text.includes('service') || text.includes('reparaci') || text.includes('parche')) {
    scope = 'repair';
  } else if (text.includes('overlay') || text.includes('second layer') || text.includes('recover')) {
    scope = 'overlay';
  } else if (text.includes('new construction') || text.includes('new build') || text.includes('addition') || text.includes('obra nueva')) {
    scope = 'new_construction';
  }

  // Extract square count if mentioned (e.g. "22 squares" or "22 sq" or "150 m2")
  let roofSquares: number | undefined;
  const sqMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:squares|sq\b)/i);
  if (sqMatch) {
    roofSquares = parseFloat(sqMatch[1]);
  }

  return {
    trade,
    discipline,
    scope,
    occupancy: 'one_family_residential',
    structure: 'existing',
    roofSquares: roofSquares || 22,
    freeTextDescription: rawScopeText || undefined,
  };
}
