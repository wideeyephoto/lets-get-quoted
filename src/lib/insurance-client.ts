import type { SupabaseClient } from '@supabase/supabase-js';
import { clientSummary, showsToClient, type InsuranceRecord } from './insurance';
import { insuranceProofUrl } from './insurance-storage';

/**
 * The certificate as a homeowner sees it — or null.
 *
 * The single place the client-facing decision is made, so there is one answer
 * to "does this go in front of a customer" rather than one per surface. Returns
 * a summary line and a link, never the record: nothing downstream should be in
 * a position to render a policy number or an expired certificate by accident.
 */
export type ClientInsurance = { summary: string; url: string | null; filename: string | null };

export async function clientInsuranceFor(
  admin: SupabaseClient,
  accountId: string,
): Promise<ClientInsurance | null> {
  const { data } = await admin
    .from('accounts')
    .select('insurance_path, insurance_filename, insurance_carrier, insurance_coverage_amount, insurance_expires_on, insurance_show_on_quotes, timezone')
    .eq('id', accountId)
    .maybeSingle();
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const record: InsuranceRecord = {
    path: (row.insurance_path as string) ?? null,
    filename: (row.insurance_filename as string) ?? null,
    carrier: (row.insurance_carrier as string) ?? null,
    // Never read, and deliberately not selected above either — a policy number
    // has no reason to travel to a client-facing render at all.
    policyNumber: null,
    coverageAmount: row.insurance_coverage_amount != null ? Number(row.insurance_coverage_amount) : null,
    expiresOn: (row.insurance_expires_on as string) ?? null,
    showOnQuotes: row.insurance_show_on_quotes !== false,
  };

  // Expiry is a calendar question answered where the contractor is, not where
  // the server happens to be — a certificate should not lapse five hours early
  // for somebody in Michigan because the box runs on UTC.
  const todayKey = new Date().toLocaleDateString('en-CA', {
    timeZone: (row.timezone as string) || 'America/Detroit',
  });
  if (!showsToClient(record, todayKey)) return null;

  return {
    summary: clientSummary(record),
    url: await insuranceProofUrl(accountId, record.path),
    filename: record.filename,
  };
}
