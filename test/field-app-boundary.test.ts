import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The field app's boundary, checked against the SQL and the source that
// implement it.
//
// WHY THIS SHAPE. Every failure this file guards against has the same signature:
// the code is correct-looking, the types are fine, the unit tests pass, and the
// thing only breaks against a real database with real policies — which the
// hermetic suite does not have. The worst of them didn't even break. It
// SUCCEEDED, quietly, with the wrong answer:
//
//   getTimeClockMode(crewClient, accountId)
//
// reads `accounts`, crew hold no select policy on `accounts`, so PostgREST
// returned no row and no error, and the helper answered 'off'. An owner who had
// set clocking to REQUIRED got crew screens offering the manual hours box. No
// exception, no log line, no test failure — just a setting that silently didn't
// apply. Nothing about that is visible from inside a mocked client, so the
// checks below read the policies and the call sites directly.
//
// The live counterpart lives in test-staging/field-app-rls.test.ts, which runs
// a real crew session against real Postgres. This file is the one that runs in
// CI, offline, in under a second.

const ROOT = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/**
 * A file with its comments removed.
 *
 * Needed because several of these checks assert that a pattern is ABSENT, and
 * the code that fixed each bug explains the bug — quoting the very string being
 * searched for. Reading the comments as if they were code fails the test for
 * documenting the fix, which is precisely backwards.
 */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n');

const schema = read('schema.sql');
const migration = read('migrations/2026-08-22-field-app-hardening.sql');

/** schema.sql with its comment lines removed — policies, not prose about them. */
const sql = schema
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('crew cannot read the accounts table', () => {
  it('has no crew select policy on accounts', () => {
    const policies = sql.match(/create policy \w+\s+on accounts[^;]*;/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/is_owner\(/);
      expect(policy).not.toMatch(/is_crew\(|crew_on_job\(|crew_owns_crew_row\(/);
    }
  });

  it('so no field-app file asks the crew client for the clock mode', () => {
    // The regression, in one line. getTimeClockMode against a crew-scoped
    // client always answers 'off', which is also what "the migration hasn't
    // run" looks like — indistinguishable, and wrong in the direction that
    // switches an owner's enforcement off.
    for (const file of [
      'src/app/field/page.tsx',
      'src/app/field/jobs/[id]/page.tsx',
      'src/app/field/jobs/[id]/actions.ts',
      'src/app/field/api/queue/route.ts',
    ]) {
      expect(code(file), file).not.toMatch(/getTimeClockMode\s*\(\s*supabase/);
    }
  });

  it('and the context resolves it admin-side instead', () => {
    const crewAuth = read('src/lib/crew-auth.ts');
    expect(crewAuth).toMatch(/timeClockMode/);
    expect(crewAuth).toMatch(/time_clock_mode/);
    // Read through the admin client, in the account read it was already doing.
    expect(crewAuth).toMatch(/loadFieldAccountRow/);
  });

  it('and getTimeClockMode itself says so, so this is not re-learned', () => {
    expect(read('src/lib/time-clock-data.ts')).toMatch(/OWNER-SCOPED/);
  });
});

describe('crew cannot write to jobs', () => {
  it('has no crew update policy on jobs', () => {
    // It existed, it granted every column on an assigned job, and a trigger had
    // to claw it back — which is what broke Start work.
    expect(sql).not.toMatch(/create policy job_crew_update/);
    expect(migration).toMatch(/drop policy if exists job_crew_update on jobs/);
  });

  it('keeps crew read on their assigned jobs', () => {
    expect(sql).toMatch(/create policy job_crew_read\s+on jobs for select using \( crew_on_job\(id\) \)/);
  });

  it('replaces it with a function that checks assignment itself', () => {
    const fn = sql.slice(sql.indexOf('function crew_set_job_status'));
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/crew_on_job\(j\)/);
    // Two transitions, whitelisted. 'archived' and 'new_lead' are the owner's.
    expect(fn).toMatch(/new_status not in \('in_progress', 'complete'\)/);
    // Stamped once and never re-dated.
    expect(fn).toMatch(/started_at = coalesce\(jobs\.started_at, now\(\)\)/);
  });

  it('grants that function to authenticated and to nobody else', () => {
    expect(sql).toMatch(/revoke all on function crew_set_job_status\(uuid, text\) from public/);
    expect(sql).toMatch(/grant execute on function crew_set_job_status\(uuid, text\) to authenticated/);
  });

  it('and the field action calls it rather than updating the table', () => {
    const actions = code('src/app/field/jobs/[id]/actions.ts');
    const statusAction = actions.slice(
      actions.indexOf('export async function setFieldJobStatusAction'),
      actions.indexOf('export async function sendArrivalFieldAction'),
    );
    expect(statusAction).toMatch(/setCrewJobStatus\(/);
    expect(statusAction).not.toMatch(/\.from\('jobs'\)[\s\S]{0,200}\.update\(/);
    expect(read('src/lib/crew-job-status.ts')).toMatch(/rpc\('crew_set_job_status'/);
  });

  it('leaves the column guard in place, and lets only the function past it', () => {
    const guard = sql.slice(sql.indexOf('function crew_jobs_update_guard'), sql.indexOf('function crew_set_job_status'));
    expect(guard).toMatch(/current_setting\('app\.crew_job_write', true\)/);
    expect(guard).toMatch(/crew may only change job status/);
    // The flag is set by the function and by nothing else.
    expect(sql).toMatch(/perform set_config\('app\.crew_job_write', 'on', true\)/);
  });
});

describe('crew cannot set their own pay rate', () => {
  it('has no rate field on the field app\'s time form', () => {
    const page = code('src/app/field/jobs/[id]/page.tsx');
    // From the JSX, not the import line above it.
    const form = page.slice(page.indexOf('logFieldTimeAction.bind'), page.indexOf('logFieldMaterialAction.bind'));
    expect(form).toMatch(/name="hours"/);
    expect(form).not.toMatch(/name="rate"/);
  });

  it('and the action does not read one even if a form posts it', () => {
    const actions = code('src/app/field/jobs/[id]/actions.ts');
    const action = actions.slice(
      actions.indexOf('export async function logFieldTimeAction'),
      actions.indexOf('export async function logFieldMaterialAction'),
    );
    expect(action).not.toMatch(/formData\.get\('rate'\)/);
    expect(action).toMatch(/crew\.hourly_rate/);
  });

  it('nor does the offline queue endpoint', () => {
    const route = code('src/app/field/api/queue/route.ts');
    expect(route).not.toMatch(/payload\.rate/);
    expect(route).toMatch(/rate: Number\(crew\.hourly_rate\)/);
  });

  it('and the database refuses a labor cost carrying any other figure', () => {
    const guard = sql.slice(sql.indexOf('function crew_costs_guard'));
    expect(guard).toMatch(/crew may not set their own pay rate/);
    // The amount has to be the arithmetic too, or the rate check is decoration.
    expect(guard).toMatch(/labor amount must be hours x the rate on file/);
    expect(sql).toMatch(/create trigger crew_costs_guard before insert or update on costs/);
  });

  it('while still allowing a rate snapshotted at clock-in', () => {
    // An owner who changes the rate mid-afternoon must not make clocking out
    // fail. time_entries.rate is itself pinned, so the chain stays closed.
    const guard = sql.slice(sql.indexOf('function crew_costs_guard'));
    expect(guard).toMatch(/from time_entries t/);
  });
});

describe('crew time entries are narrower than the policy', () => {
  it('pins the rate on the way in', () => {
    const guard = sql.slice(sql.indexOf('function crew_time_entries_guard'));
    expect(guard).toMatch(/new\.rate := coalesce\(pinned, 0\)/);
  });

  it('permits only the three columns clocking out writes', () => {
    const guard = sql.slice(sql.indexOf('function crew_time_entries_guard'));
    expect(guard).toMatch(/'ended_at' - 'cost_id' - 'note'/);
    expect(guard).toMatch(/crew may only close their own shift/);
    // started_at, job_id and closed_by_owner are therefore all refused.
    expect(guard).toMatch(/that shift is already closed/);
  });

  it('leaves owners alone — closing a forgotten shift is their job', () => {
    const guard = sql.slice(sql.indexOf('function crew_time_entries_guard'));
    expect(guard).toMatch(/if not is_crew\(new\.account_id\) then return new; end if;/);
  });
});

describe('the rest of the day is on the route', () => {
  it('lets crew read the day\'s unassigned stops as well as their own', () => {
    const policy = sql.match(/create policy route_stop_crew_read[^;]*;/)?.[0] ?? '';
    expect(policy).toMatch(/crew_id is null or crew_owns_crew_row\(crew_id\)/);
    // The old rule, which hid every unassigned dump run from every phone.
    expect(policy).not.toMatch(/crew_id is not null/);
  });

  it('and the field home page actually reads them', () => {
    const page = read('src/app/field/page.tsx');
    expect(page).toMatch(/listDayRouteStops/);
    // Merged into one numbered list, in time order — not a second section
    // underneath, which would still leave the tech reading two days.
    expect(page).toMatch(/routeItems/);
    expect(page).toMatch(/byTimeAsc/);
  });
});

describe('installability does not depend on push', () => {
  it('registers the service worker whenever service workers exist', () => {
    const pwa = read('src/app/field/FieldPwa.tsx');
    const effect = pwa.slice(pwa.indexOf('useEffect(() => {'), pwa.indexOf('const enable'));
    // The registration call must come BEFORE any push capability check.
    const registerAt = effect.indexOf("navigator.serviceWorker.register('/sw.js'");
    const pushCheckAt = effect.indexOf('pushSupported()');
    expect(registerAt).toBeGreaterThan(-1);
    expect(pushCheckAt).toBeGreaterThan(registerAt);
  });

  it('keeps VAPID out of the registration decision entirely', () => {
    const pwa = read('src/app/field/FieldPwa.tsx');
    const effect = pwa.slice(pwa.indexOf('useEffect(() => {'), pwa.indexOf('const enable'));
    const registration = effect.slice(0, effect.indexOf("navigator.serviceWorker.register('/sw.js'"));
    expect(registration).not.toMatch(/VAPID_PUBLIC_KEY|PushManager/);
  });
});

describe('one person, two contractors', () => {
  it('resolves the crew row for a chosen business rather than the first row', () => {
    const crew = read('src/lib/crew.ts');
    expect(crew).toMatch(/export async function listCrewForUser/);
    const crewAuth = read('src/lib/crew-auth.ts');
    expect(crewAuth).toMatch(/readFieldAccount\(\)/);
    // No choice recorded and more than one roster: ask, never guess.
    expect(crewAuth).toMatch(/reason: 'choose-business'/);
  });

  it('re-checks membership when the choice is made, because a POST body is not proof', () => {
    const action = read('src/app/field/choose/actions.ts');
    expect(action).toMatch(/listCrewForUser/);
    expect(action).toMatch(/not-yours/);
  });

  it('honours a business-specific invitation, but only for a roster they are on', () => {
    const callback = read('src/app/auth/crew-callback/route.ts');
    expect(callback).toMatch(/linked\.includes\(invitedAccount\)/);
  });
});

describe('revoked access actually revokes', () => {
  it('stops the magic-link linker re-linking them', () => {
    expect(read('src/lib/crew-auth.ts')).toMatch(/filter\(\(row\) => !row\.access_revoked_at\)/);
  });

  it('stops the session guard resolving them', () => {
    // Filtered inside listCrewForUser rather than at each call site: a filter
    // that has to be remembered is a filter that gets forgotten.
    expect(read('src/lib/crew.ts')).toMatch(/filter\(\(member\) => !member\.access_revoked_at\)/);
  });

  it('survives an un-migrated database instead of locking everyone out', () => {
    const crew = code('src/lib/crew.ts');
    // `.is('access_revoked_at', null)` in the query would 42703 pre-migration
    // and take every crew member's session with it.
    expect(crew).not.toMatch(/\.is\('access_revoked_at', null\)/);
  });
});

describe('offline writes are safe to replay', () => {
  it('claims each submission with a unique index rather than a read-then-write', () => {
    expect(sql).toMatch(/create unique index if not exists field_submissions_key_unique/);
    const lib = read('src/lib/field-submissions.ts');
    expect(lib).toMatch(/error\.code === '23505'/);
  });

  it('gives the claim back when the work behind it fails', () => {
    // Otherwise a submission that blew up mid-write is remembered as done for
    // ever, and the retry that would fix it is answered "already handled".
    expect(read('src/app/field/api/queue/route.ts')).toMatch(/releaseSubmission/);
  });

  it('answers a background replay with a status, never a redirect', () => {
    const route = code('src/app/field/api/queue/route.ts');
    expect(route).toMatch(/loadCrewContext/);
    expect(route).not.toMatch(/redirect\(/);
  });

  it('leaves the online path completely untouched', () => {
    // Offline support that reroutes the normal submit breaks the normal submit,
    // and the normal submit runs thousands of times a day.
    expect(read('src/lib/field-offline-client.ts')).toMatch(/if \(!looksOffline\(\)\)|looksOffline/);
    expect(read('src/app/field/FieldOfflineForm.tsx')).toMatch(/if \(!looksOffline\(\)\) return;/);
  });
});

describe('photo paths arriving from a client are validated', () => {
  it('accepts only this account\'s own uploaded shape', () => {
    const storage = read('src/lib/job-photo-storage.ts');
    expect(storage).toMatch(/export function ownedPhotoPaths/);
    expect(storage).toMatch(/\^\$\{accountId\}\//);
  });

  it('and both actions that take paths use it', () => {
    expect(read('src/app/field/jobs/[id]/milestone-actions.ts')).toMatch(/ownedPhotoPaths\(accountId/);
    expect(read('src/app/field/jobs/[id]/change-order-actions.ts')).toMatch(/ownedPhotoPaths\(accountId/);
  });

  it('checks assignment on the upload endpoint, not just a session', () => {
    expect(read('src/app/field/api/photo/route.ts')).toMatch(/isJobAssignedToCrew/);
  });

  it('shrinks a camera frame before it leaves the phone', () => {
    const photos = read('src/app/field/FieldPhotos.tsx');
    expect(photos).toMatch(/createImageBitmap/);
    // EXIF orientation, or every portrait "before" shot lands sideways.
    expect(photos).toMatch(/imageOrientation: 'from-image'/);
    expect(photos).toMatch(/toBlob/);
  });

  it('keeps a failed upload so nothing has to be re-photographed', () => {
    const photos = read('src/app/field/FieldPhotos.tsx');
    expect(photos).toMatch(/status: 'failed'/);
    expect(photos).toMatch(/Retry/);
    expect(photos).toMatch(/upload\.onprogress/);
  });
});

describe('the migration and the schema agree', () => {
  const both = [
    'crew_set_job_status',
    'crew_time_entries_guard',
    'crew_costs_guard',
    'field_submissions',
    'access_revoked_at',
    'invite_expires_at',
  ];

  it.each(both)('%s exists in schema.sql as well as the migration', (needle) => {
    // schema.sql is what builds a new environment; the migration is what an
    // existing database takes. A change that lands in one and not the other
    // works in production and not in staging, or the reverse.
    expect(migration).toContain(needle);
    expect(schema).toContain(needle);
  });
});
