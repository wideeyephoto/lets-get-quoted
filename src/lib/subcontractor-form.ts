/**
 * Reading a subcontractor out of a form, in one place.
 *
 * IN ITS OWN MODULE FOR THE SAME REASON lib/crew-add-state IS: a 'use server'
 * file may only export async functions, and the seed lists below are arrays.
 * Keeping them here also means the drawer (a client component) can render the
 * same trade list the action validates against without dragging the action's
 * whole dependency graph into the browser bundle.
 *
 * Pure: FormData in, a typed object out. No database, no auth.
 */

import {
  normalizeAgreementStatus,
  normalizeRatePreference,
  normalizeSubStatus,
  normalizeW9Status,
  type AgreementStatus,
  type RatePreference,
  type SubStatus,
  type W9Status,
} from '@/lib/subcontractors';

/**
 * Trades offered before an account has typed any of its own.
 *
 * Seeds only, exactly like AddCrewDrawer's SEED_ROLES: the list an owner sees is
 * these plus every trade already on their own subs, so a shop that has been
 * running a year picks from its own vocabulary.
 */
export const SEED_TRADES = [
  'Plumbing',
  'Gas fitting',
  'Electrical',
  'HVAC',
  'Roofing',
  'Drywall',
  'Painting',
  'Carpentry',
  'Concrete',
  'Excavation',
  'Landscaping',
  'Flooring',
  'Tiling',
  'Masonry',
  'Insulation',
  'Septic',
  'Well pump',
  'Appliance install',
  'Handyman',
  'Cleaning',
];

export type SubcontractorFormValues = {
  name: string;
  companyName: string | null;
  phone: string;
  email: string | null;
  trades: string[];
  skills: string[];
  tags: string[];
  serviceArea: string | null;
  travelRadiusMiles: number | null;
  availabilityNote: string | null;
  emergencyAvailable: boolean;
  ratePreference: RatePreference;
  hourlyRate: number;
  dayRate: number | null;
  minimumCharge: number | null;
  licenseNumber: string | null;
  licenseExpiresOn: string | null;
  insuranceCarrier: string | null;
  insuranceExpiresOn: string | null;
  w9Status: W9Status;
  agreementStatus: AgreementStatus;
  paymentTerms: string | null;
  internalNotes: string | null;
  subStatus: SubStatus;
};

function text(form: FormData, key: string): string {
  return (form.get(key) ?? '').toString().trim();
}

function optional(form: FormData, key: string): string | null {
  return text(form, key) || null;
}

function list(form: FormData, key: string): string[] {
  // Accepts both shapes the UI produces: repeated checkbox values, and a single
  // comma-separated field. Deduplicated case-insensitively so "HVAC" ticked and
  // "hvac" typed do not become two trades that never match each other.
  const values = form.getAll(key).flatMap((entry) => entry.toString().split(','));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function amount(form: FormData, key: string): number | null {
  const raw = text(form, key);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** A yyyy-mm-dd from a date input, or null. Anything else is dropped. */
function isoDate(form: FormData, key: string): string | null {
  const raw = text(form, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function readSubcontractorForm(form: FormData): SubcontractorFormValues {
  const ratePreference = normalizeRatePreference(form.get('ratePreference'));
  return {
    name: text(form, 'name'),
    companyName: optional(form, 'companyName'),
    phone: text(form, 'phone'),
    email: optional(form, 'email')?.toLowerCase() ?? null,
    trades: list(form, 'trades'),
    skills: list(form, 'skills'),
    tags: list(form, 'tags'),
    serviceArea: optional(form, 'serviceArea'),
    travelRadiusMiles: amount(form, 'travelRadiusMiles'),
    availabilityNote: optional(form, 'availabilityNote'),
    emergencyAvailable: form.get('emergencyAvailable') !== null,
    ratePreference,
    hourlyRate: amount(form, 'hourlyRate') ?? 0,
    dayRate: amount(form, 'dayRate'),
    minimumCharge: amount(form, 'minimumCharge'),
    licenseNumber: optional(form, 'licenseNumber'),
    licenseExpiresOn: isoDate(form, 'licenseExpiresOn'),
    insuranceCarrier: optional(form, 'insuranceCarrier'),
    insuranceExpiresOn: isoDate(form, 'insuranceExpiresOn'),
    w9Status: normalizeW9Status(form.get('w9Status')),
    agreementStatus: normalizeAgreementStatus(form.get('agreementStatus')),
    paymentTerms: optional(form, 'paymentTerms'),
    internalNotes: optional(form, 'internalNotes'),
    subStatus: normalizeSubStatus(form.get('subStatus')),
  };
}

/** Why this subcontractor cannot be saved, or null when they can. */
export function subcontractorProblem(values: SubcontractorFormValues): string | null {
  if (!values.name) return 'Enter a contact name — somebody has to answer the phone.';
  if (!values.phone) return 'Enter a mobile number. A job offer is a text, so a sub with no number is never asked.';
  if (values.phone.replace(/\D/g, '').length < 10) {
    return 'That number is too short to text. Enter all ten digits.';
  }
  if (values.trades.length === 0) {
    return 'Pick at least one trade. It is what decides which jobs they get offered.';
  }
  return null;
}

/** The columns this form writes, ready for an insert or an update. */
export function subcontractorColumns(values: SubcontractorFormValues): Record<string, unknown> {
  return {
    worker_type: 'subcontractor',
    name: values.name,
    company_name: values.companyName,
    phone: values.phone,
    email: values.email,
    trades: values.trades,
    skills: values.skills,
    tags: values.tags,
    service_area: values.serviceArea,
    travel_radius_miles: values.travelRadiusMiles,
    availability_note: values.availabilityNote,
    emergency_available: values.emergencyAvailable,
    rate_preference: values.ratePreference,
    // hourly_rate stays the COSTING rate every job-margin calculation already
    // reads, exactly as it does for a crew member — see lib/pay-types. A sub
    // priced per job still costs a job something per hour, and zero is a
    // legitimate answer here because a fixed price is not hours.
    hourly_rate: values.hourlyRate,
    day_rate: values.dayRate,
    minimum_charge: values.minimumCharge,
    license_number: values.licenseNumber,
    license_expires_on: values.licenseExpiresOn,
    insurance_carrier: values.insuranceCarrier,
    insurance_expires_on: values.insuranceExpiresOn,
    w9_status: values.w9Status,
    agreement_status: values.agreementStatus,
    payment_terms: values.paymentTerms,
    internal_notes: values.internalNotes,
    sub_status: values.subStatus,
    // A subcontractor is not on the payroll. pay_type stays 'hourly' so the
    // existing crew_pay_amount_check constraint is satisfied without inventing
    // a fourth pay type that payroll export would then have to understand.
    role_label: values.trades[0] ?? 'Subcontractor',
  };
}
