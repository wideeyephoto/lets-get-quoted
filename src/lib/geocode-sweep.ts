import { createAdminClient } from '@/lib/auth';
import { backfillJobCoordinates } from '@/lib/jobs';
import { backfillLeadCoordinates } from '@/lib/leads';

// Repairs jobs and leads that have an address but no coordinates.
//
// Both are normally geocoded at write time, so this only ever picks up the
// leftovers: rows created while the geocoder was down or out of quota, and rows
// that predate geocoding entirely. It used to run inside page renders — every
// dashboard, schedule and route-plan load fired up to 24 geocode lookups plus
// writes, billed on a GET, in the critical path of first paint, and duplicated
// whenever two tabs loaded at once. A repair job belongs on a schedule.
//
// Only touches accounts that actually have something to fix, so a healthy
// database costs two index lookups and nothing else.

export type GeocodeSweepSummary = {
  accountsScanned: number;
  jobsFixed: number;
  leadsFixed: number;
};

// Per-account cap keeps one pathological account (a big CRM import, say) from
// eating the whole run; the next sweep picks up where this one left off.
const PER_ACCOUNT_LIMIT = 25;
const MAX_ACCOUNTS_PER_RUN = 200;

// The accounts with at least one un-geocoded row, so the sweep can skip everyone
// else instead of walking the whole table.
async function accountsNeedingGeocode(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const ids = new Set<string>();
  for (const table of ['jobs', 'leads'] as const) {
    const { data } = await admin
      .from(table)
      .select('account_id')
      .is('geocoded_at', null)
      .not('address', 'is', null)
      .limit(2000);
    for (const row of (data ?? []) as Array<{ account_id: string | null }>) {
      if (row.account_id) ids.add(row.account_id);
    }
  }
  return [...ids].slice(0, MAX_ACCOUNTS_PER_RUN);
}

export async function runGeocodeSweep(): Promise<GeocodeSweepSummary> {
  const admin = createAdminClient();
  const accountIds = await accountsNeedingGeocode(admin);

  let jobsFixed = 0;
  let leadsFixed = 0;
  for (const accountId of accountIds) {
    // One account's bad address must not abandon the rest of the sweep.
    try {
      jobsFixed += await backfillJobCoordinates(admin, accountId, PER_ACCOUNT_LIMIT);
      leadsFixed += await backfillLeadCoordinates(admin, accountId, PER_ACCOUNT_LIMIT);
    } catch (error) {
      console.error(`Geocode sweep failed for account ${accountId}:`, error instanceof Error ? error.message : error);
    }
  }

  return { accountsScanned: accountIds.length, jobsFixed, leadsFixed };
}
