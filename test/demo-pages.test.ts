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
import { loadRecipients, listCampaigns, loadListHealth } from '@/lib/campaigns';
import { listRebookCandidates } from '@/lib/rebook';
import { buildRecurringView } from '@/lib/recurring-view';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { resolvePayrollRange } from '@/lib/payroll';

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

  it('marketing campaigns, list health, and recommendations', async () => {
    const [recipients, campaigns, listHealth] = await Promise.all([
      loadRecipients(demoSupabase, DEMO_ACCOUNT_ID),
      listCampaigns(demoSupabase, DEMO_ACCOUNT_ID),
      loadListHealth(demoSupabase, DEMO_ACCOUNT_ID),
    ]);
    expect(Array.isArray(recipients)).toBe(true);
    expect(Array.isArray(campaigns)).toBe(true);
    expect(listHealth).toBeDefined();
    await expect(listRebookCandidates(demoSupabase, DEMO_ACCOUNT_ID)).resolves.toBeDefined();
  });

  it('recurring', async () => {
    await expect(buildRecurringView(demoSupabase, DEMO_ACCOUNT_ID, '2026-08-07')).resolves.toBeDefined();
  });

  it('blog workspace', async () => {
    await expect(loadBlogWorkspace(demoSupabase, DEMO_ACCOUNT_ID, ROOT_DOMAIN)).resolves.toBeDefined();
  });

  it('payroll period resolutions', () => {
    const periods = ['this-week', 'last-week', 'this-month', 'last-month'] as const;
    for (const p of periods) {
      const res = resolvePayrollRange(p);
      expect(res.startIso).toBeTruthy();
      expect(res.endIso).toBeTruthy();
      expect(res.label).toBeTruthy();
    }
  });

  it('demo tour structure and step continuity', async () => {
    const { TOUR_STEPS, DEMO_SHOWCASE_WORKFLOW } = await import('@/lib/demo-tour-data');
    expect(TOUR_STEPS.length).toBe(6);
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const step = TOUR_STEPS[i];
      expect(step.step).toBe(i + 1);
      expect(step.href).toBe(`/demo/tour/${step.slug}`);
      if (i > 0) {
        expect(step.prevHref).toBe(TOUR_STEPS[i - 1].href);
      } else {
        expect(step.prevHref).toBeNull();
      }
      if (i < TOUR_STEPS.length - 1) {
        expect(step.nextHref).toBe(TOUR_STEPS[i + 1].href);
      } else {
        expect(step.nextHref).toBeNull();
      }
    }
    expect(DEMO_SHOWCASE_WORKFLOW.company.name).toBe('Broke Pipes Plumbing');
    expect(DEMO_SHOWCASE_WORKFLOW.job.lineItems.length).toBeGreaterThan(0);
  });

  it('demo client detail and statements', async () => {
    const { getClient, getClientStatement } = await import('@/lib/clients');
    const client = await getClient(demoSupabase, DEMO_ACCOUNT_ID, 'demo-client-1');
    expect(client).toBeDefined();
    expect(client?.name).toBe('Karen Whitfield');
    const statement = await getClientStatement(demoSupabase, DEMO_ACCOUNT_ID, 'demo-client-1');
    expect(statement).toBeDefined();
  });

  it('demo site subdomain resolution for evergreenlawn', async () => {
    const { getPublicSiteBySubdomain } = await import('@/lib/sites');
    const site = await getPublicSiteBySubdomain(demoSupabase, 'evergreenlawn');
    expect(site).toBeDefined();
    expect(site?.company_name).toBe('Evergreen Lawn & Landscape');
    expect(site?.subdomain).toBe('evergreenlawn');
  });
});
