import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The owner's high-value lead alert carries a link to the lead. On 2026-08-22
 * the first ever delivered text arrived with a DEAD one:
 *
 *   https://thisisit.letsgetquoted.com/dashboard/leads/<id>
 *
 * because the public lead route derived it from `request.nextUrl.origin`. That
 * request arrives on the CONTRACTOR'S PUBLIC MARKETING HOST, which does not
 * serve /dashboard. The same value is passed to sendLeadNotificationEmail, so
 * every high-value lead email carried the same dead link.
 *
 * It is a source check rather than a route test on purpose: exercising the real
 * handler means standing up Supabase, the mailer, the SMS rail and the AI
 * estimator, and the defect is not in any of those — it is one expression
 * choosing the wrong origin. This asserts the choice.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

const LEAD_ROUTE = ['src', 'app', 'api', 'public', 'leads', 'route.ts'] as const;

describe('owner-facing dashboard links', () => {
  it('builds the lead link from APP_ORIGIN, not the request host', () => {
    const source = read(...LEAD_ROUTE);
    const assignments = [...source.matchAll(/dashboardUrl\s*=\s*([^;\n]+)/g)].map((m) => m[1]);

    // Non-vacuous: if the variable is ever renamed, this fails loudly rather
    // than passing over an empty match set.
    expect(assignments.length, 'no dashboardUrl assignment found — was it renamed?').toBeGreaterThan(0);

    for (const value of assignments) {
      expect(value).toContain('APP_ORIGIN');
      expect(value).not.toContain('nextUrl.origin');
    }
  });

  it('never derives any /dashboard link from the incoming request', () => {
    const source = read(...LEAD_ROUTE);
    // The tenant host is legitimate for redirects back to the public site, so
    // this pins the specific combination that was wrong: a request-derived
    // origin used to build a dashboard path.
    const dashboardFromRequest = /\$\{\s*request\.nextUrl\.origin\s*\}\/dashboard/;
    expect(dashboardFromRequest.test(source)).toBe(false);
  });

  it('agrees with booking.ts, which already had it right', () => {
    // booking.ts has always used APP_ORIGIN for the identical link. Pinning
    // both means the two cannot drift apart again with one silently wrong.
    const booking = read('src', 'lib', 'booking.ts');
    const links = [...booking.matchAll(/dashboardUrl:\s*`([^`]*dashboard\/leads[^`]*)`/g)].map((m) => m[1]);
    expect(links.length, 'booking.ts no longer builds a lead dashboard link').toBeGreaterThan(0);
    for (const link of links) expect(link).toContain('${APP_ORIGIN}');
  });
});
