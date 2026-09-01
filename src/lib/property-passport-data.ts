import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculatePropertyHealthScore,
  generatePassportCode,
  type EquipmentPassportItem,
  type EquipmentItemInput,
  type PassportLedgerEntry,
  type PropertyPassport,
  type PropertyPassportInput,
  CATEGORY_LIFESPANS,
} from '@/lib/property-passport';
import { generateQrSvg } from '@/lib/equipment-qr';
import { findOrCreateClientId } from '@/lib/clients';

type Row = Record<string, unknown>;

function shapeEquipmentItem(row: Row): EquipmentPassportItem {
  const specs = (row.specs as EquipmentPassportItem['specs']) || {};
  const installedOn = String(row.installed_on || new Date().toISOString().slice(0, 10));
  const category = (row.category as EquipmentPassportItem['category']) || 'other';
  const expectedLifespanYears = Number(row.expected_lifespan_years) || CATEGORY_LIFESPANS[category] || 15;

  const ageYears = Math.max(
    0,
    Math.round(((Date.now() - Date.parse(`${installedOn}T00:00:00Z`)) / (86_400_000 * 365.25)) * 10) / 10,
  );

  return {
    id: String(row.id),
    passportId: String(row.passport_id),
    accountId: String(row.account_id),
    jobId: (row.job_id as string | null) ?? null,
    warrantyId: (row.warranty_id as string | null) ?? null,
    category,
    name: String(row.name || 'Mechanical Equipment'),
    brand: String(row.brand || ''),
    modelNumber: (row.model_number as string | null) ?? null,
    serialNumber: (row.serial_number as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    installedOn,
    expectedLifespanYears,
    estimatedAgeYears: ageYears,
    condition: (row.condition as EquipmentPassportItem['condition']) || 'good',
    specs,
    maintenanceIntervalMonths: row.maintenance_interval_months ? Number(row.maintenance_interval_months) : null,
    lastServicedOn: (row.last_serviced_on as string | null) ?? null,
    nextServiceDue: (row.next_service_due as string | null) ?? null,
    manualUrl: (row.manual_url as string | null) ?? null,
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    notes: (row.notes as string | null) ?? null,
  };
}

function shapeLedgerEntry(row: Row): PassportLedgerEntry {
  return {
    id: String(row.id),
    passportId: String(row.passport_id),
    accountId: String(row.account_id),
    jobId: (row.job_id as string | null) ?? null,
    equipmentId: (row.equipment_id as string | null) ?? null,
    type: (row.type as PassportLedgerEntry['type']) || 'tuneup',
    date: String(row.date || new Date().toISOString().slice(0, 10)),
    title: String(row.title || 'Service Recorded'),
    summary: String(row.summary || ''),
    performedBy: String(row.performed_by || 'Technician'),
    cost: row.cost !== null && row.cost !== undefined ? Number(row.cost) : null,
    invoiceRef: (row.invoice_ref as string | null) ?? null,
    documentUrls: Array.isArray(row.document_urls) ? (row.document_urls as Array<{ name: string; url: string }>) : [],
  };
}

function shapePropertyPassport(
  row: Row,
  equipment: EquipmentPassportItem[] = [],
  ledger: PassportLedgerEntry[] = [],
  warrantiesCount = 0,
): PropertyPassport {
  const code = String(row.passport_code || generatePassportCode(String(row.address || '')));
  const publicUrl = `https://letsgetquoted.com/passport/${code}`;
  const healthScore = calculatePropertyHealthScore(equipment, warrantiesCount);

  return {
    id: String(row.id),
    accountId: String(row.account_id),
    clientId: (row.client_id as string | null) ?? null,
    passportCode: code,
    address: String(row.address || ''),
    unitNumber: (row.unit_number as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    country: String(row.country || 'USA'),
    propertyType: (row.property_type as PropertyPassport['propertyType']) || 'single_family',
    yearBuilt: row.year_built ? Number(row.year_built) : null,
    squareFeet: row.square_feet ? Number(row.square_feet) : null,
    stories: row.stories ? Number(row.stories) : null,
    heatingType: (row.heating_type as string | null) ?? null,
    coolingType: (row.cooling_type as string | null) ?? null,
    waterHeaterType: (row.water_heater_type as string | null) ?? null,
    electricalPanelAmps: row.electrical_panel_amps ? Number(row.electrical_panel_amps) : null,
    roofType: (row.roof_type as string | null) ?? null,
    accessNotes: (row.access_notes as string | null) ?? null,
    currentHomeowner: {
      name: String(row.homeowner_name || 'Homeowner'),
      phone: (row.homeowner_phone as string | null) ?? null,
      email: (row.homeowner_email as string | null) ?? null,
      sinceDate: String(row.homeowner_since || row.created_at || new Date().toISOString().slice(0, 10)),
    },
    ownershipHistory: Array.isArray(row.ownership_history)
      ? (row.ownership_history as PropertyPassport['ownershipHistory'])
      : [],
    equipment,
    ledger,
    healthScore,
    qrCodeSvg: generateQrSvg(publicUrl, 160),
    passportPublicUrl: publicUrl,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function listPropertyPassports(
  supabase: SupabaseClient,
  accountId: string,
  clientId?: string,
): Promise<PropertyPassport[]> {
  let query = supabase.from('property_passports').select('*').eq('account_id', accountId);
  if (clientId) query = query.eq('client_id', clientId);

  const { data: passportRows, error } = await query.order('created_at', { ascending: false });
  if (error || !passportRows) return [];

  const passportIds = passportRows.map((r) => String(r.id));
  if (passportIds.length === 0) return [];

  const [{ data: equipmentRows }, { data: ledgerRows }] = await Promise.all([
    supabase.from('equipment_passports').select('*').in('passport_id', passportIds),
    supabase.from('property_passport_ledger').select('*').in('passport_id', passportIds).order('date', { ascending: false }),
  ]);

  const eqByPassport = new Map<string, EquipmentPassportItem[]>();
  for (const eq of (equipmentRows ?? []).map(shapeEquipmentItem)) {
    const list = eqByPassport.get(eq.passportId) || [];
    list.push(eq);
    eqByPassport.set(eq.passportId, list);
  }

  const ledgerByPassport = new Map<string, PassportLedgerEntry[]>();
  for (const l of (ledgerRows ?? []).map(shapeLedgerEntry)) {
    const list = ledgerByPassport.get(l.passportId) || [];
    list.push(l);
    ledgerByPassport.set(l.passportId, list);
  }

  return passportRows.map((row) =>
    shapePropertyPassport(
      row,
      eqByPassport.get(String(row.id)) || [],
      ledgerByPassport.get(String(row.id)) || [],
    ),
  );
}

export async function getPropertyPassport(
  supabase: SupabaseClient,
  accountId: string,
  passportId: string,
): Promise<PropertyPassport | null> {
  const { data: row, error } = await supabase
    .from('property_passports')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', passportId)
    .maybeSingle();

  if (error || !row) return null;

  const [{ data: equipmentRows }, { data: ledgerRows }, { data: warranties }] = await Promise.all([
    supabase.from('equipment_passports').select('*').eq('passport_id', passportId),
    supabase.from('property_passport_ledger').select('*').eq('passport_id', passportId).order('date', { ascending: false }),
    supabase.from('warranties').select('id').eq('account_id', accountId),
  ]);

  const equipment = (equipmentRows ?? []).map(shapeEquipmentItem);
  const ledger = (ledgerRows ?? []).map(shapeLedgerEntry);

  return shapePropertyPassport(row, equipment, ledger, (warranties ?? []).length);
}

export async function getPropertyPassportByCode(
  supabase: SupabaseClient,
  passportCode: string,
): Promise<PropertyPassport | null> {
  const { data: row, error } = await supabase
    .from('property_passports')
    .select('*')
    .eq('passport_code', passportCode.trim().toUpperCase())
    .maybeSingle();

  if (error || !row) return null;

  const passportId = String(row.id);
  const accountId = String(row.account_id);

  const [{ data: equipmentRows }, { data: ledgerRows }, { data: warranties }] = await Promise.all([
    supabase.from('equipment_passports').select('*').eq('passport_id', passportId),
    supabase.from('property_passport_ledger').select('*').eq('passport_id', passportId).order('date', { ascending: false }),
    supabase.from('warranties').select('id').eq('account_id', accountId),
  ]);

  const equipment = (equipmentRows ?? []).map(shapeEquipmentItem);
  const ledger = (ledgerRows ?? []).map(shapeLedgerEntry);

  return shapePropertyPassport(row, equipment, ledger, (warranties ?? []).length);
}

export async function createPropertyPassport(
  supabase: SupabaseClient,
  accountId: string,
  input: PropertyPassportInput,
): Promise<PropertyPassport> {
  let clientId = input.clientId;
  if (!clientId && input.homeownerName) {
    clientId = await findOrCreateClientId(supabase, accountId, {
      name: input.homeownerName,
      phone: input.homeownerPhone,
      email: input.homeownerEmail,
      address: input.address,
    });
  }

  const passportCode = generatePassportCode(input.address);
  const payload = {
    account_id: accountId,
    client_id: clientId ?? null,
    passport_code: passportCode,
    address: input.address.trim(),
    unit_number: input.unitNumber?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    country: input.country || 'USA',
    property_type: input.propertyType || 'single_family',
    year_built: input.yearBuilt || null,
    square_feet: input.squareFeet || null,
    stories: input.stories || null,
    heating_type: input.heatingType || null,
    cooling_type: input.coolingType || null,
    water_heater_type: input.waterHeaterType || null,
    electrical_panel_amps: input.electricalPanelAmps || null,
    roof_type: input.roofType || null,
    access_notes: input.accessNotes || null,
    homeowner_name: input.homeownerName.trim(),
    homeowner_phone: input.homeownerPhone?.trim() || null,
    homeowner_email: input.homeownerEmail?.trim() || null,
    homeowner_since: new Date().toISOString().slice(0, 10),
    ownership_history: [],
  };

  const { data, error } = await supabase
    .from('property_passports')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not create property passport.');
  }

  return shapePropertyPassport(data, [], []);
}

export async function addEquipmentToPassport(
  supabase: SupabaseClient,
  accountId: string,
  passportId: string,
  input: EquipmentItemInput,
): Promise<EquipmentPassportItem> {
  const category = input.category || 'other';
  const lifespan = input.expectedLifespanYears || CATEGORY_LIFESPANS[category] || 15;

  const payload = {
    passport_id: passportId,
    account_id: accountId,
    job_id: input.jobId || null,
    warranty_id: input.warrantyId || null,
    category,
    name: input.name.trim(),
    brand: input.brand.trim(),
    model_number: input.modelNumber?.trim() || null,
    serial_number: input.serialNumber?.trim() || null,
    location: input.location?.trim() || null,
    installed_on: input.installedOn || new Date().toISOString().slice(0, 10),
    expected_lifespan_years: lifespan,
    condition: input.condition || 'good',
    specs: input.specs || {},
    maintenance_interval_months: input.maintenanceIntervalMonths || null,
    last_serviced_on: input.lastServicedOn || null,
    manual_url: input.manualUrl || null,
    photos: input.photos || [],
    notes: input.notes || null,
  };

  const { data, error } = await supabase
    .from('equipment_passports')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not add equipment to passport.');
  }

  // Also log installation to maintenance ledger
  await addPassportLedgerEntry(supabase, accountId, passportId, {
    equipmentId: String(data.id),
    jobId: input.jobId,
    type: 'installation',
    date: payload.installed_on,
    title: `Installed ${input.name}`,
    summary: `${input.brand}${input.modelNumber ? ` (Model ${input.modelNumber})` : ''} installed at ${input.location || 'property'}.`,
    performedBy: 'Installation Crew',
  });

  return shapeEquipmentItem(data);
}

export async function addPassportLedgerEntry(
  supabase: SupabaseClient,
  accountId: string,
  passportId: string,
  input: {
    equipmentId?: string | null;
    jobId?: string | null;
    type: PassportLedgerEntry['type'];
    date: string;
    title: string;
    summary?: string;
    performedBy?: string;
    cost?: number | null;
    invoiceRef?: string | null;
    documentUrls?: Array<{ name: string; url: string }>;
  },
): Promise<PassportLedgerEntry> {
  const payload = {
    passport_id: passportId,
    account_id: accountId,
    equipment_id: input.equipmentId || null,
    job_id: input.jobId || null,
    type: input.type,
    date: input.date || new Date().toISOString().slice(0, 10),
    title: input.title.trim().slice(0, 160),
    summary: (input.summary || '').trim().slice(0, 2000),
    performed_by: (input.performedBy || 'Technician').trim().slice(0, 120),
    cost: input.cost !== undefined ? input.cost : null,
    invoice_ref: input.invoiceRef || null,
    document_urls: input.documentUrls || [],
  };

  const { data, error } = await supabase
    .from('property_passport_ledger')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Could not record passport ledger entry.');
  }

  return shapeLedgerEntry(data);
}

/**
 * Transfer property passport to a new homeowner when a property is sold.
 * Preserves 100% of equipment passports, maintenance ledger history, filter sizes,
 * and service records while archiving the previous homeowner in ownership history.
 */
export async function transferPropertyPassport(
  supabase: SupabaseClient,
  accountId: string,
  passportId: string,
  newHomeowner: {
    name: string;
    phone?: string | null;
    email?: string | null;
  },
  transferNote?: string,
): Promise<PropertyPassport> {
  const current = await getPropertyPassport(supabase, accountId, passportId);
  if (!current) throw new Error('Property passport not found.');

  const today = new Date().toISOString().slice(0, 10);
  const updatedHistory = [
    ...current.ownershipHistory,
    {
      homeownerName: current.currentHomeowner.name,
      fromDate: current.currentHomeowner.sinceDate,
      toDate: today,
      note: transferNote || 'Property ownership transferred to new buyer.',
    },
  ];

  const newClientId = await findOrCreateClientId(supabase, accountId, {
    name: newHomeowner.name,
    phone: newHomeowner.phone,
    email: newHomeowner.email,
    address: current.address,
  });

  const { data, error } = await supabase
    .from('property_passports')
    .update({
      client_id: newClientId,
      homeowner_name: newHomeowner.name.trim(),
      homeowner_phone: newHomeowner.phone?.trim() || null,
      homeowner_email: newHomeowner.email?.trim() || null,
      homeowner_since: today,
      ownership_history: updatedHistory,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', passportId)
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to transfer property passport.');
  }

  // Record transfer event in the durable ledger
  await addPassportLedgerEntry(supabase, accountId, passportId, {
    type: 'inspection',
    date: today,
    title: 'Property Passport Transferred',
    summary: `Passport ownership transferred from ${current.currentHomeowner.name} to ${newHomeowner.name}. All equipment history and filter specs preserved.`,
    performedBy: 'System Administrator',
  });

  return shapePropertyPassport(data, current.equipment, current.ledger);
}
