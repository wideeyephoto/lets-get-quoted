import { describe, it, expect } from 'vitest';
import { demoSupabase } from '@/lib/demo-rows';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { buildDashboardHome } from '@/lib/dashboard-home-data';
import { listClientsWithStats } from '@/lib/clients';
import { clientPins } from '@/lib/client-map';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { listJobs } from '@/lib/jobs';
import { getMapPins } from '@/lib/map-pins';
import { getReviewsSummary } from '@/lib/reviews';
import { loadRecipients } from '@/lib/campaigns';
import { listRebookCandidates } from '@/lib/rebook';
import { buildRecurringView } from '@/lib/recurring-view';
import { loadBlogWorkspace } from '@/lib/site-blog';

/**
 * The demo runs the REAL builders against a fixture client, which is the whole
 * point of it — when a card is redesigned the demo gets the redesign for free.
 * The cost of that design is that a builder can acquire a query the fixture
 * client cannot answer, and nothing in the type system notices: createDemoSupabase
 * returns `client as unknown as SupabaseClient`, so every method is assumed present.
 *
 * That is exactly what happened. `fa3993b` added `.or(...)` to a reviews count
 * the dashboard home reads; the fixture client had no `or()`; /demo answered 500
 * in production from 2026-08-03 for four days, and the only thing that would
 * have caught it was somebody opening the page.
 *
 * So this is that somebody. Every builder a /demo/** page calls gets called here
 * the way the page calls it. It asserts almost nothing about the RESULTS — the
 * builders have their own tests — only that the fixture client can answer them.
 */

const ROOT_DOMAIN = DEMO_SITE_HOST.split('.').slice(1).join('.');

describe('every builder the demo runs can be answered by the fixture client', () => {
  // The regression itself, called exactly as src/app/demo/page.tsx calls it.
  it('dashboard home — the page that was returning 500', async () => {
    const home = await buildDashboardHome(demoSupabase, DEMO_ACCOUNT_ID, {
      rootDomain: ROOT_DOMAIN,
      basePath: '/demo',
    });
    expect(home).toBeTruthy();
  });

  it('clients', async () => {
    await expect(listClientsWithStats(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
    await expect(clientPins(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
  });

  it('jobs, crew and assignments', async () => {
    const jobs = await listJobs(demoSupabase, DEMO_ACCOUNT_ID);
    expect(Array.isArray(jobs)).toBe(true);
    await expect(listCrew(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
    await expect(listCrew(demoSupabase, DEMO_ACCOUNT_ID, { activeOnly: true })).resolves.toBeDefined();
    await expect(
      listCrewAssignmentsForJobs(demoSupabase, DEMO_ACCOUNT_ID, jobs.map((job) => job.id)),
    ).resolves.toBeDefined();
  });

  it('map pins', async () => {
    await expect(getMapPins(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
  });

  it('reviews — the module the missing or() lived in', async () => {
    await expect(getReviewsSummary(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
  });

  it('marketing recipients and rebook candidates', async () => {
    await expect(loadRecipients(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
    await expect(listRebookCandidates(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
  });

  it('recurring', async () => {
    await expect(buildRecurringView(demoSupabase, DEMO_ACCOUNT_ID, '2026-08-07')).resolves.toBeDefined();
  });

  it('blog workspace', async () => {
    await expect(loadBlogWorkspace(demoSupabase, DEMO_ACCOUNT_ID, ROOT_DOMAIN)).resolves.toBeDefined();
  });
});
