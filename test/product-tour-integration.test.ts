import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('Product Tour Integration and Stable DOM Anchors', () => {
  it('verifies that all target IDs from the tour catalog exist in the codebase', () => {
    const appShell = readFileSync('src/components/app-shell.tsx', 'utf8');
    const homeScreen = readFileSync('src/app/dashboard/DashboardHomeScreen.tsx', 'utf8');
    const leadsPage = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8');
    const jobsPage = readFileSync('src/app/dashboard/jobs/page.tsx', 'utf8');
    const schedulePage = readFileSync('src/app/dashboard/schedule/page.tsx', 'utf8');
    const websiteBuilder = readFileSync('src/app/dashboard/sites/WebsiteBuilder.tsx', 'utf8');
    const automationsPage = readFileSync('src/app/dashboard/automations/page.tsx', 'utf8');

    // 1. Dashboard priority anchor
    expect(homeScreen).toContain('data-tour-id="dashboard:needs-attention"');

    // 2. Leads workspace anchor
    expect(leadsPage).toContain('data-tour-id="leads:workspace"');

    // 3. Jobs workspace anchor
    expect(jobsPage).toContain('data-tour-id="jobs:workspace"');

    // 4. Schedule workbench anchor
    expect(schedulePage).toContain('data-tour-id="schedule:workbench"');

    // 5. Website builder anchor
    expect(websiteBuilder).toContain('data-tour-id="website:builder"');

    // 6. Automations overview anchor
    expect(automationsPage).toContain('data-tour-id="automations:overview"');

    // 7. Navigation links anchors
    expect(appShell).toContain('data-tour-id={`nav:${href}`}');
    expect(appShell).toContain('data-tour-id="nav:/dashboard/sites"');
  });

  it('verifies onboarding checklist launcher and help page restart button are mounted', () => {
    const homeScreen = readFileSync('src/app/dashboard/DashboardHomeScreen.tsx', 'utf8');
    const helpPage = readFileSync('src/app/dashboard/help/page.tsx', 'utf8');

    expect(homeScreen).toContain('<ChecklistTourInvitation');
    expect(helpPage).toContain('<HelpTourRestartButton');
  });

  it('verifies dashboard layout mounts ProductTourRoot with server auth and progress', () => {
    const dashboardLayout = readFileSync('src/app/dashboard/layout.tsx', 'utf8');

    expect(dashboardLayout).toContain('ProductTourRoot');
    expect(dashboardLayout).toContain('filterStepsForUser');
    expect(dashboardLayout).toContain('LGQ_DASHBOARD_ORIENTATION_ENABLED');
    expect(dashboardLayout).toContain("from('product_tour_progress')");
  });

  it('verifies SQL migration exists and defines progress + events tables with RLS', () => {
    expect(existsSync('migrations/20260826120000_product_tours.sql')).toBe(true);
    const sql = readFileSync('migrations/20260826120000_product_tours.sql', 'utf8');

    expect(sql).toContain('create table if not exists public.product_tour_progress');
    expect(sql).toContain('create table if not exists public.product_tour_events');
    expect(sql).toContain('alter table public.product_tour_progress enable row level security');
    expect(sql).toContain('alter table public.product_tour_events enable row level security');
  });

  it('verifies public telemetry route is rate-limited and sanitizes incoming payloads', () => {
    expect(existsSync('src/app/api/demo-tour/events/route.ts')).toBe(true);
    const route = readFileSync('src/app/api/demo-tour/events/route.ts', 'utf8');

    expect(route).toContain('checkRateLimit');
    expect(route).toContain('sanitizeTourEventPayload');
    expect(route).toContain("from('product_tour_events')");
  });
});
