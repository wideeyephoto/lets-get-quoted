import { generateQrSvg } from '@/lib/equipment-qr';
import { daysBetween, todayKey } from '@/lib/warranties';

export type PropertyType = 'single_family' | 'condo' | 'townhouse' | 'multi_family' | 'commercial' | 'other';
export type EquipmentCategory =
  | 'hvac_heating'
  | 'hvac_cooling'
  | 'water_heater'
  | 'electrical_panel'
  | 'plumbing'
  | 'roofing'
  | 'generator'
  | 'filtration'
  | 'appliance'
  | 'other';

export type EquipmentCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'end_of_life';

export type EquipmentSpecs = {
  filterSize?: string;
  filterChangeIntervalMonths?: number;
  lastFilterChangedOn?: string | null;
  refrigerantType?: string;
  seerRating?: number;
  tonnage?: number;
  btuRating?: number;
  capacityGal?: number;
  fuelType?: 'gas' | 'electric' | 'oil' | 'propane' | 'hybrid' | 'solar';
  amperage?: number;
  voltage?: number;
  breakerCount?: number;
};

export type EquipmentPassportItem = {
  id: string;
  passportId: string;
  accountId: string;
  jobId: string | null;
  warrantyId: string | null;
  category: EquipmentCategory;
  name: string;
  brand: string;
  modelNumber: string | null;
  serialNumber: string | null;
  location: string | null;
  installedOn: string;
  expectedLifespanYears: number;
  estimatedAgeYears: number;
  condition: EquipmentCondition;
  specs: EquipmentSpecs;
  maintenanceIntervalMonths: number | null;
  lastServicedOn: string | null;
  nextServiceDue: string | null;
  manualUrl: string | null;
  photos: string[];
  notes: string | null;
  qrSvg?: string;
};

export type PassportLedgerEntryType =
  | 'installation'
  | 'tuneup'
  | 'repair'
  | 'filter_replacement'
  | 'inspection'
  | 'warranty_claim'
  | 'permit';

export type PassportLedgerEntry = {
  id: string;
  passportId: string;
  accountId: string;
  jobId: string | null;
  equipmentId?: string | null;
  type: PassportLedgerEntryType;
  date: string;
  title: string;
  summary: string;
  performedBy: string;
  cost: number | null;
  invoiceRef: string | null;
  documentUrls: Array<{ name: string; url: string }>;
};

export type HomeownerRecord = {
  name: string;
  phone: string | null;
  email: string | null;
  sinceDate: string;
};

export type OwnershipTransferHistory = {
  homeownerName: string;
  fromDate: string;
  toDate: string | null;
  note?: string;
};

export type PropertyHealthScore = {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  summaryText: string;
  factors: Array<{
    category: string;
    status: 'good' | 'warning' | 'critical';
    title: string;
    description: string;
    impactScore: number;
  }>;
};

export type PropertyPassport = {
  id: string;
  accountId: string;
  clientId: string | null;
  passportCode: string;
  address: string;
  unitNumber: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  propertyType: PropertyType;
  yearBuilt: number | null;
  squareFeet: number | null;
  stories: number | null;
  heatingType: string | null;
  coolingType: string | null;
  waterHeaterType: string | null;
  electricalPanelAmps: number | null;
  roofType: string | null;
  accessNotes: string | null;
  currentHomeowner: HomeownerRecord;
  ownershipHistory: OwnershipTransferHistory[];
  equipment: EquipmentPassportItem[];
  ledger: PassportLedgerEntry[];
  healthScore: PropertyHealthScore;
  qrCodeSvg: string;
  passportPublicUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type PropertyPassportInput = {
  clientId?: string | null;
  address: string;
  unitNumber?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  propertyType?: PropertyType;
  yearBuilt?: number | null;
  squareFeet?: number | null;
  stories?: number | null;
  heatingType?: string | null;
  coolingType?: string | null;
  waterHeaterType?: string | null;
  electricalPanelAmps?: number | null;
  roofType?: string | null;
  accessNotes?: string | null;
  homeownerName: string;
  homeownerPhone?: string | null;
  homeownerEmail?: string | null;
};

export type EquipmentItemInput = {
  jobId?: string | null;
  warrantyId?: string | null;
  category: EquipmentCategory;
  name: string;
  brand: string;
  modelNumber?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  installedOn: string;
  expectedLifespanYears?: number;
  condition?: EquipmentCondition;
  specs?: EquipmentSpecs;
  maintenanceIntervalMonths?: number | null;
  lastServicedOn?: string | null;
  manualUrl?: string | null;
  photos?: string[];
  notes?: string | null;
};

/**
 * Deterministically generates a clean, readable passport code (e.g. `PROP-A8F2-7K99`)
 */
export function generatePassportCode(address: string, customSeed?: string): string {
  const clean = (address + (customSeed || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let hash = 5381;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) + hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  const part1 = Math.abs(hash).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  const part2 = Math.abs((hash * 31) ^ 0x5a5a5a5a).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  return `PROP-${part1}-${part2}`;
}

export const CATEGORY_LIFESPANS: Record<EquipmentCategory, number> = {
  hvac_heating: 18,
  hvac_cooling: 15,
  water_heater: 12,
  electrical_panel: 30,
  plumbing: 25,
  roofing: 25,
  generator: 20,
  filtration: 10,
  appliance: 10,
  other: 15,
};

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  hvac_heating: 'Heating System',
  hvac_cooling: 'Cooling / AC',
  water_heater: 'Water Heater',
  electrical_panel: 'Electrical Service Panel',
  plumbing: 'Plumbing & Drainage',
  roofing: 'Roofing System',
  generator: 'Standby Generator',
  filtration: 'Water Filtration / Treatment',
  appliance: 'Major Mechanical Appliance',
  other: 'Mechanical Equipment',
};

/**
 * Computes an algorithmic Property Health Score (0-100) based on equipment age vs lifespan,
 * maintenance currency, active warranty coverage, filter changes, and service history.
 */
export function calculatePropertyHealthScore(
  equipmentList: EquipmentPassportItem[],
  warrantiesCount = 0,
  today = todayKey(),
): PropertyHealthScore {
  let score = 100;
  const factors: PropertyHealthScore['factors'] = [];

  if (equipmentList.length === 0) {
    return {
      score: 85,
      grade: 'B',
      summaryText: 'Baseline passport initialized. Add installed equipment to unlock full precision scoring.',
      factors: [
        {
          category: 'Equipment',
          status: 'warning',
          title: 'Equipment Registry Pending',
          description: 'No major mechanical equipment registered yet.',
          impactScore: -15,
        },
      ],
    };
  }

  // 1. Equipment Age & Lifespan Evaluation
  let totalLifespanImpact = 0;
  for (const eq of equipmentList) {
    const lifespan = eq.expectedLifespanYears || CATEGORY_LIFESPANS[eq.category] || 15;
    const daysOld = daysBetween(eq.installedOn, today);
    const ageYears = daysOld !== null ? Math.max(0, daysOld / 365.25) : 0;
    const remainingRatio = (lifespan - ageYears) / lifespan;

    const conditionExtra = eq.condition === 'poor' ? 8 : eq.condition === 'end_of_life' ? 12 : 0;
    if (remainingRatio < 0 || eq.condition === 'end_of_life' || eq.condition === 'poor') {
      const penalty = Math.min(28, Math.round(16 + Math.abs(remainingRatio * 6) + conditionExtra));
      totalLifespanImpact += penalty;
      factors.push({
        category: 'Equipment Condition',
        status: 'critical',
        title: `${eq.name} (${CATEGORY_LABELS[eq.category]}) Past Expected Lifespan`,
        description: `Operating at ${Math.round(ageYears)} years of age (${lifespan} yr expected life). Replacement budgeting advised.`,
        impactScore: -penalty,
      });
    } else if (remainingRatio < 0.25 || eq.condition === 'fair') {
      const penalty = 10;
      totalLifespanImpact += penalty;
      factors.push({
        category: 'Equipment Aging',
        status: 'warning',
        title: `${eq.name} Approaching End of Normal Lifespan`,
        description: `At ${Math.round(ageYears)} of ${lifespan} years. In good working condition but monitor closely.`,
        impactScore: -penalty,
      });
    }
  }
  score -= Math.min(45, totalLifespanImpact);

  // 2. Overdue Maintenance / Tune-Ups
  let totalMaintenanceImpact = 0;
  for (const eq of equipmentList) {
    if (eq.nextServiceDue) {
      const daysUntilService = daysBetween(today, eq.nextServiceDue);
      if (daysUntilService !== null && daysUntilService < 0) {
        const daysPast = Math.abs(daysUntilService);
        const penalty = daysPast > 365 ? 15 : daysPast > 90 ? 10 : 5;
        totalMaintenanceImpact += penalty;
        factors.push({
          category: 'Maintenance',
          status: daysPast > 90 ? 'critical' : 'warning',
          title: `${eq.name} Service Overdue`,
          description: `Routine maintenance was due ${daysPast} days ago.`,
          impactScore: -penalty,
        });
      }
    }
  }
  score -= Math.min(30, totalMaintenanceImpact);

  // 3. Filter Change Currency
  let overdueFilterCount = 0;
  for (const eq of equipmentList) {
    if (eq.specs?.lastFilterChangedOn && eq.specs?.filterChangeIntervalMonths) {
      const daysSinceFilter = daysBetween(eq.specs.lastFilterChangedOn, today);
      const intervalDays = eq.specs.filterChangeIntervalMonths * 30;
      if (daysSinceFilter !== null && daysSinceFilter > intervalDays + 30) {
        overdueFilterCount++;
        const filterPenalty = 6;
        factors.push({
          category: 'Consumables',
          status: 'warning',
          title: `Filter Replacement Due for ${eq.name}`,
          description: `Filter (${eq.specs.filterSize || 'standard'}) last changed ${Math.round(daysSinceFilter / 30)} months ago.`,
          impactScore: -filterPenalty,
        });
      }
    }
  }
  score -= Math.min(15, overdueFilterCount * 6);

  // 4. Positive Warranty & Service Boost
  if (warrantiesCount > 0) {
    const bonus = Math.min(10, warrantiesCount * 4);
    score = Math.min(100, score + bonus);
    factors.unshift({
      category: 'Warranty Protection',
      status: 'good',
      title: `${warrantiesCount} Active Warranty Guarantee${warrantiesCount > 1 ? 's' : ''}`,
      description: 'Major mechanical installations are backed by active contractor warranty coverage.',
      impactScore: bonus,
    });
  }

  // All clear factor if no warnings
  if (factors.filter((f) => f.status !== 'good').length === 0) {
    factors.push({
      category: 'Overall Status',
      status: 'good',
      title: 'Systems Fully Maintained',
      description: 'All registered mechanical equipment and service schedules are up to date.',
      impactScore: 0,
    });
  }

  const finalScore = Math.max(20, Math.min(100, Math.round(score)));
  let grade: PropertyHealthScore['grade'] = 'A+';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 85) grade = 'A';
  else if (finalScore >= 75) grade = 'B';
  else if (finalScore >= 60) grade = 'C';
  else grade = 'D';

  let summaryText = 'Excellent property mechanical health.';
  if (grade === 'A+' || grade === 'A') {
    summaryText = 'Outstanding condition: all equipment is within prime operating lifespan with current service records.';
  } else if (grade === 'B') {
    summaryText = 'Good condition: systems are operational with minor maintenance or upcoming filter replacements needed.';
  } else if (grade === 'C') {
    summaryText = 'Moderate condition: one or more systems are aging or overdue for seasonal tune-ups.';
  } else {
    summaryText = 'Needs attention: multiple aging units or overdue maintenance items detected.';
  }

  return {
    score: finalScore,
    grade,
    summaryText,
    factors,
  };
}

/**
 * Builds a printable physical QR Placard (3.5x5") for the mechanical room wall
 * or electrical breaker panel.
 */
export function buildPropertyPassportPlacardHtml(
  passport: Pick<PropertyPassport, 'passportCode' | 'address' | 'equipment' | 'passportPublicUrl'>,
  brand: { businessName: string; phone?: string | null; siteUrl?: string | null },
): string {
  const qrSvg = generateQrSvg(passport.passportPublicUrl, 160);
  const equipmentSummary = passport.equipment
    .slice(0, 5)
    .map(
      (eq) => `
      <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed #e2e8f0;">
        <span style="font-weight: 600; color: #0f172a;">${escapeHtml(eq.name)}</span>
        <span style="color: #64748b;">${eq.specs?.filterSize ? `Filter: ${escapeHtml(eq.specs.filterSize)}` : escapeHtml(eq.brand || '')}</span>
      </div>
    `,
    )
    .join('');

  return `
<div class="property-passport-placard" style="width: 360px; padding: 18px; border: 2px solid #0f172a; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #ffffff; color: #0f172a; box-sizing: border-box;">
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px;">
    <div>
      <span style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.05em; text-transform: uppercase;">Durable Home Passport</span>
      <h2 style="margin: 4px 0 0; font-size: 15px; font-weight: 800;">${escapeHtml(brand.businessName)}</h2>
      <p style="margin: 2px 0 0; font-size: 11px; color: #475569;">${escapeHtml(passport.address)}</p>
    </div>
    <div style="text-align: right;">
      <span style="font-size: 10px; font-weight: 700; color: #64748b;">PASSPORT ID</span>
      <p style="margin: 2px 0 0; font-family: monospace; font-size: 12px; font-weight: 800; color: #0f172a;">${escapeHtml(passport.passportCode)}</p>
    </div>
  </div>

  <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 14px;">
    <div style="flex-shrink: 0; border: 1.5px solid #e2e8f0; padding: 4px; border-radius: 6px; background: #fff;">
      ${qrSvg}
      <p style="margin: 4px 0 0; font-size: 9px; text-align: center; color: #475569; font-weight: 700;">SCAN FOR SPECS &amp; SERVICE</p>
    </div>
    <div style="flex: 1; font-size: 11px; line-height: 1.4;">
      <p style="margin: 0 0 6px; font-weight: 700; color: #0369a1;">Physical Mechanical Record</p>
      <p style="margin: 0 0 4px; color: #334155;">Scan with any phone camera to access filter specs, warranty status, maintenance ledger, and request priority service.</p>
      ${brand.phone ? `<p style="margin: 6px 0 0; font-weight: 700; color: #0f172a;">24/7 Service: ${escapeHtml(brand.phone)}</p>` : ''}
    </div>
  </div>

  ${passport.equipment.length > 0 ? `
    <div style="background: #f8fafc; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px;">
      <p style="margin: 0 0 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">Installed Mechanical Systems</p>
      ${equipmentSummary}
    </div>
  ` : ''}

  <div style="text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 6px;">
    Affix to main electrical panel or mechanical room wall. Transferable to next homeowner.
  </div>
</div>
`.trim();
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
