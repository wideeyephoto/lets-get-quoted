import type { SupabaseClient } from '@supabase/supabase-js';

export type MembershipTierLevel = 1 | 2 | 3 | 4;

export type MembershipBenefits = {
  /** Percentage discount applied to standard repairs, diagnostics and services (e.g. 10 = 10% off) */
  discountPercentage: number;
  /** Included routine maintenance / seasonal tune-ups per year */
  includedTuneupsPerYear: number;
  /** Priority dispatch and scheduling (front-of-line booking) */
  priorityScheduling: boolean;
  /** Discount percentage on emergency / after-hours dispatch fee (100 = fee waived) */
  emergencyDispatchDiscount: number;
  /** Multiplier on standard labor/workmanship warranty duration (e.g. 2.0 = 2x warranty) */
  warrantyMultiplier: number;
  /** Number of complimentary replacement filters or consumables included per year */
  freeFilterReplacements: number;
  /** Dedicated account concierge / technician preference */
  dedicatedConcierge: boolean;
  /** Membership and equipment history stays with the property upon sale */
  transferableToHomeowner: boolean;
  /** Custom perk bullet points for marketing and portal display */
  customPerks: string[];
};

export type MembershipTier = {
  id: string;
  accountId: string;
  name: string;
  tierLevel: MembershipTierLevel;
  badgeColor: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  tradeCategory: 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'general' | 'custom';
  benefits: MembershipBenefits;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MembershipTierInput = {
  name: string;
  tierLevel?: MembershipTierLevel;
  badgeColor?: string;
  description?: string;
  monthlyPrice: number;
  annualPrice?: number;
  tradeCategory?: 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'general' | 'custom';
  benefits?: Partial<MembershipBenefits>;
  isActive?: boolean;
};

export const DEFAULT_BENEFITS: MembershipBenefits = {
  discountPercentage: 10,
  includedTuneupsPerYear: 1,
  priorityScheduling: true,
  emergencyDispatchDiscount: 50,
  warrantyMultiplier: 1.5,
  freeFilterReplacements: 1,
  dedicatedConcierge: false,
  transferableToHomeowner: true,
  customPerks: [],
};

/**
 * Standard preset club tiers by trade category so contractors can deploy
 * high-converting memberships in one click without designing from scratch.
 */
export const DEFAULT_MEMBERSHIP_TIERS: Record<string, Omit<MembershipTier, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>[]> = {
  hvac: [
    {
      name: 'Bronze Comfort Plan',
      tierLevel: 1,
      badgeColor: '#94a3b8',
      description: 'Annual heating or cooling safety tune-up and standard repair savings.',
      monthlyPrice: 14.99,
      annualPrice: 159,
      tradeCategory: 'hvac',
      benefits: {
        discountPercentage: 5,
        includedTuneupsPerYear: 1,
        priorityScheduling: false,
        emergencyDispatchDiscount: 25,
        warrantyMultiplier: 1.0,
        freeFilterReplacements: 1,
        dedicatedConcierge: false,
        transferableToHomeowner: true,
        customPerks: ['1 Comprehensive Annual HVAC Tune-Up', '5% Off All Repairs & Parts', '1 Standard Furnace Filter Replacement'],
      },
      isActive: true,
    },
    {
      name: 'Silver Seasonal Care Club',
      tierLevel: 2,
      badgeColor: '#38bdf8',
      description: 'Bi-annual AC + Heating tune-ups with priority booking and 10% repair savings.',
      monthlyPrice: 24.99,
      annualPrice: 269,
      tradeCategory: 'hvac',
      benefits: {
        discountPercentage: 10,
        includedTuneupsPerYear: 2,
        priorityScheduling: true,
        emergencyDispatchDiscount: 50,
        warrantyMultiplier: 1.5,
        freeFilterReplacements: 2,
        dedicatedConcierge: false,
        transferableToHomeowner: true,
        customPerks: ['2 Seasonal Tune-Ups (Spring AC + Fall Heating)', '10% Off All Repairs & Diagnostics', '50% Off Emergency Dispatch Fees', '2 High-Efficiency Filter Replacements'],
      },
      isActive: true,
    },
    {
      name: 'Gold VIP Protection Club',
      tierLevel: 3,
      badgeColor: '#eab308',
      description: 'Complete peace of mind: bi-annual tune-ups, waived emergency fees, and 2x warranty.',
      monthlyPrice: 39.99,
      annualPrice: 429,
      tradeCategory: 'hvac',
      benefits: {
        discountPercentage: 15,
        includedTuneupsPerYear: 2,
        priorityScheduling: true,
        emergencyDispatchDiscount: 100,
        warrantyMultiplier: 2.0,
        freeFilterReplacements: 4,
        dedicatedConcierge: true,
        transferableToHomeowner: true,
        customPerks: ['2 Seasonal Tune-Ups + 1 Water Heater Safety Check', '15% Off All Repairs & Services', '100% Waived Emergency Dispatch Fee', '2x Workmanship Warranty Coverage', '4 Free Annual Filter Changes', 'VIP Front-of-Line Scheduling Guarantee'],
      },
      isActive: true,
    },
    {
      name: 'Platinum Whole-Home Diamond',
      tierLevel: 4,
      badgeColor: '#a855f7',
      description: 'Ultimate white-glove protection: quarterly inspections, 20% off, and lifetime warranty.',
      monthlyPrice: 59.99,
      annualPrice: 649,
      tradeCategory: 'hvac',
      benefits: {
        discountPercentage: 20,
        includedTuneupsPerYear: 4,
        priorityScheduling: true,
        emergencyDispatchDiscount: 100,
        warrantyMultiplier: 3.0,
        freeFilterReplacements: 6,
        dedicatedConcierge: true,
        transferableToHomeowner: true,
        customPerks: ['Quarterly Comprehensive System Inspections', '20% Off All Repairs & System Replacements', 'Zero Dispatch / Diagnostic Fees Always', 'Lifetime Workmanship Warranty while Enrolled', 'Dedicated Senior Master Technician Preference', 'Transferable Property Passport included'],
      },
      isActive: true,
    },
  ],
  plumbing: [
    {
      name: 'Silver Pipe & Drain Guard',
      tierLevel: 2,
      badgeColor: '#38bdf8',
      description: 'Annual whole-home plumbing inspection, water heater flush, and 10% repair savings.',
      monthlyPrice: 19.99,
      annualPrice: 219,
      tradeCategory: 'plumbing',
      benefits: {
        discountPercentage: 10,
        includedTuneupsPerYear: 1,
        priorityScheduling: true,
        emergencyDispatchDiscount: 50,
        warrantyMultiplier: 1.5,
        freeFilterReplacements: 0,
        dedicatedConcierge: false,
        transferableToHomeowner: true,
        customPerks: ['Annual Whole-Home Plumbing & Fixture Audit', 'Annual Water Heater Tank Flush & Anode Check', '10% Off All Plumbing Repairs & Fixture Installs'],
      },
      isActive: true,
    },
    {
      name: 'Gold Flow & Fixture VIP',
      tierLevel: 3,
      badgeColor: '#eab308',
      description: 'Complete plumbing protection: 2 inspections/yr, waived emergency fees, drain camera sweep.',
      monthlyPrice: 34.99,
      annualPrice: 379,
      tradeCategory: 'plumbing',
      benefits: {
        discountPercentage: 15,
        includedTuneupsPerYear: 2,
        priorityScheduling: true,
        emergencyDispatchDiscount: 100,
        warrantyMultiplier: 2.0,
        freeFilterReplacements: 2,
        dedicatedConcierge: true,
        transferableToHomeowner: true,
        customPerks: ['2 Annual Inspections (Plumbing + Sump Pump / Sewer Camera)', '15% Off All Repairs & Replacements', 'Waived Emergency & Weekend Dispatch Fees', 'Free Annual Water Filter Cartridge Change'],
      },
      isActive: true,
    },
  ],
  general: [
    {
      name: 'Home Care Club Member',
      tierLevel: 2,
      badgeColor: '#38bdf8',
      description: 'Scheduled preventive maintenance visits, priority service queue, and 10% member discount.',
      monthlyPrice: 29.99,
      annualPrice: 329,
      tradeCategory: 'general',
      benefits: {
        discountPercentage: 10,
        includedTuneupsPerYear: 2,
        priorityScheduling: true,
        emergencyDispatchDiscount: 50,
        warrantyMultiplier: 1.5,
        freeFilterReplacements: 2,
        dedicatedConcierge: false,
        transferableToHomeowner: true,
        customPerks: ['2 Annual Preventive Property Inspections', '10% Off All Repair & Project Labor', 'Priority Emergency Dispatch', 'Durable Home Passport Record'],
      },
      isActive: true,
    },
    {
      name: 'VIP Home Master Club',
      tierLevel: 3,
      badgeColor: '#eab308',
      description: 'Comprehensive property protection with 15% discount, waived dispatch fees, and 2x warranty.',
      monthlyPrice: 49.99,
      annualPrice: 539,
      tradeCategory: 'general',
      benefits: {
        discountPercentage: 15,
        includedTuneupsPerYear: 3,
        priorityScheduling: true,
        emergencyDispatchDiscount: 100,
        warrantyMultiplier: 2.0,
        freeFilterReplacements: 4,
        dedicatedConcierge: true,
        transferableToHomeowner: true,
        customPerks: ['3 Seasonal Property & Mechanical Audits per year', '15% Off All Work & Change Orders', 'Zero Dispatch Fees on Service Calls', '2x Workmanship Warranty Coverage'],
      },
      isActive: true,
    },
  ],
};

/**
 * Calculates member pricing and savings for a quote, estimate, or invoice
 * based on the active membership tier.
 */
export function calculateMemberDiscount(
  benefits: MembershipBenefits | null | undefined,
  originalAmount: number,
  isEmergencyOrDiagnostic = false,
): {
  originalAmount: number;
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
  savingsLabel: string;
} {
  const safeOriginal = Math.max(0, originalAmount);
  if (!benefits) {
    return {
      originalAmount: safeOriginal,
      discountPercentage: 0,
      discountAmount: 0,
      finalAmount: safeOriginal,
      savingsLabel: '',
    };
  }

  let effectiveDiscount = benefits.discountPercentage || 0;
  if (isEmergencyOrDiagnostic && benefits.emergencyDispatchDiscount > 0) {
    effectiveDiscount = Math.max(effectiveDiscount, benefits.emergencyDispatchDiscount);
  }

  const discountAmount = Math.round((safeOriginal * (effectiveDiscount / 100)) * 100) / 100;
  const finalAmount = Math.max(0, Math.round((safeOriginal - discountAmount) * 100) / 100);

  return {
    originalAmount: safeOriginal,
    discountPercentage: effectiveDiscount,
    discountAmount,
    finalAmount,
    savingsLabel: discountAmount > 0 ? `Member savings: $${discountAmount.toFixed(2)} (${effectiveDiscount}% off)` : '',
  };
}

export type MemberBenefitsSummary = {
  tierName: string;
  tierLevel: MembershipTierLevel;
  badgeColor: string;
  discountPercentage: number;
  includedTuneupsPerYear: number;
  tuneupsUsedThisYear: number;
  tuneupsRemainingThisYear: number;
  isEligibleForFreeTuneup: boolean;
  priorityScheduling: boolean;
  emergencyFeeWaived: boolean;
  warrantyMultiplier: number;
  freeFiltersPerYear: number;
  membershipStatus: 'active' | 'past_due' | 'paused' | 'cancelled';
  statusLabel: string;
  annualSavingsEstimate: number;
};

/**
 * Summarizes the active member's real-time benefits, including consumed
 * seasonal tune-ups vs allowance, remaining tune-ups, and priority status.
 */
export function getMemberBenefitsSummary(
  tier: Pick<MembershipTier, 'name' | 'tierLevel' | 'badgeColor' | 'benefits'>,
  active = true,
  tuneupsCompletedInPlanYear = 0,
): MemberBenefitsSummary {
  const benefits = tier.benefits || DEFAULT_BENEFITS;
  const included = Math.max(0, benefits.includedTuneupsPerYear || 1);
  const used = Math.max(0, tuneupsCompletedInPlanYear);
  const remaining = Math.max(0, included - used);

  return {
    tierName: tier.name,
    tierLevel: tier.tierLevel,
    badgeColor: tier.badgeColor || '#38bdf8',
    discountPercentage: benefits.discountPercentage || 0,
    includedTuneupsPerYear: included,
    tuneupsUsedThisYear: used,
    tuneupsRemainingThisYear: remaining,
    isEligibleForFreeTuneup: active && remaining > 0,
    priorityScheduling: Boolean(benefits.priorityScheduling),
    emergencyFeeWaived: (benefits.emergencyDispatchDiscount || 0) >= 100,
    warrantyMultiplier: benefits.warrantyMultiplier || 1.0,
    freeFiltersPerYear: benefits.freeFilterReplacements || 0,
    membershipStatus: active ? 'active' : 'paused',
    statusLabel: active ? 'Active Club Member' : 'Membership Paused',
    annualSavingsEstimate: (benefits.discountPercentage * 18) + (included * 149) + (benefits.freeFilterReplacements * 25),
  };
}

function shapeMembershipTier(row: Record<string, unknown>): MembershipTier {
  const benefitsRaw = row.benefits as Partial<MembershipBenefits> | undefined;
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    name: String(row.name || 'Service Club Tier'),
    tierLevel: (Number(row.tier_level) || 1) as MembershipTierLevel,
    badgeColor: String(row.badge_color || '#38bdf8'),
    description: String(row.description || ''),
    monthlyPrice: Number(row.monthly_price) || 0,
    annualPrice: Number(row.annual_price) || Number(row.monthly_price) * 11 || 0,
    tradeCategory: (row.trade_category as MembershipTier['tradeCategory']) || 'general',
    benefits: {
      ...DEFAULT_BENEFITS,
      ...(benefitsRaw || {}),
      customPerks: Array.isArray(benefitsRaw?.customPerks) ? benefitsRaw.customPerks : [],
    },
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

/**
 * List all configured membership tiers for an account. If no tiers have been created yet,
 * falls back to default HVAC & General tiers so the UI is immediately functional.
 */
export async function listMembershipTiers(
  supabase: SupabaseClient,
  accountId: string,
): Promise<MembershipTier[]> {
  const { data, error } = await supabase
    .from('membership_tiers')
    .select('*')
    .eq('account_id', accountId)
    .order('tier_level', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    // Return virtual default tiers if not yet customized/migrated
    const defaults = DEFAULT_MEMBERSHIP_TIERS.hvac.concat(DEFAULT_MEMBERSHIP_TIERS.general.slice(0, 1));
    return defaults.map((item, idx) => ({
      ...item,
      id: `default_tier_${idx + 1}`,
      accountId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  return data.map(shapeMembershipTier);
}

export async function getMembershipTier(
  supabase: SupabaseClient,
  accountId: string,
  tierId: string,
): Promise<MembershipTier | null> {
  if (tierId.startsWith('default_tier_')) {
    const list = await listMembershipTiers(supabase, accountId);
    return list.find((t) => t.id === tierId) ?? null;
  }

  const { data, error } = await supabase
    .from('membership_tiers')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', tierId)
    .maybeSingle();

  if (error || !data) return null;
  return shapeMembershipTier(data);
}

export async function createMembershipTier(
  supabase: SupabaseClient,
  accountId: string,
  input: MembershipTierInput,
): Promise<MembershipTier> {
  const benefits: MembershipBenefits = {
    ...DEFAULT_BENEFITS,
    ...(input.benefits || {}),
  };

  const payload = {
    account_id: accountId,
    name: input.name.trim().slice(0, 120),
    tier_level: input.tierLevel || 1,
    badge_color: input.badgeColor || '#38bdf8',
    description: (input.description || '').trim().slice(0, 500),
    monthly_price: Math.max(0, input.monthlyPrice),
    annual_price: input.annualPrice ? Math.max(0, input.annualPrice) : Math.max(0, input.monthlyPrice * 11),
    trade_category: input.tradeCategory || 'general',
    benefits,
    is_active: input.isActive !== false,
  };

  const { data, error } = await supabase
    .from('membership_tiers')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not create membership tier.');
  }

  return shapeMembershipTier(data);
}

export async function updateMembershipTier(
  supabase: SupabaseClient,
  accountId: string,
  tierId: string,
  input: Partial<MembershipTierInput>,
): Promise<MembershipTier> {
  const current = await getMembershipTier(supabase, accountId, tierId);
  if (!current) throw new Error('Membership tier not found.');

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) patch.name = input.name.trim().slice(0, 120);
  if (input.tierLevel !== undefined) patch.tier_level = input.tierLevel;
  if (input.badgeColor !== undefined) patch.badge_color = input.badgeColor;
  if (input.description !== undefined) patch.description = input.description.trim().slice(0, 500);
  if (input.monthlyPrice !== undefined) patch.monthly_price = Math.max(0, input.monthlyPrice);
  if (input.annualPrice !== undefined) patch.annual_price = Math.max(0, input.annualPrice);
  if (input.tradeCategory !== undefined) patch.trade_category = input.tradeCategory;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.benefits !== undefined) {
    patch.benefits = {
      ...current.benefits,
      ...input.benefits,
    };
  }

  const { data, error } = await supabase
    .from('membership_tiers')
    .update(patch)
    .eq('account_id', accountId)
    .eq('id', tierId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not update membership tier.');
  }

  return shapeMembershipTier(data);
}

export async function deleteMembershipTier(
  supabase: SupabaseClient,
  accountId: string,
  tierId: string,
): Promise<void> {
  await supabase
    .from('membership_tiers')
    .delete()
    .eq('account_id', accountId)
    .eq('id', tierId);
}
