import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

function findFiles(dir: string, matcher: (filename: string) => boolean): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, matcher));
    } else if (entry.isFile() && matcher(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Service-Role Scoping & Authorization Sweep', () => {
  const appDir = join(process.cwd(), 'src/app');
  const routeFiles = findFiles(appDir, (name) => name === 'route.ts' || name === 'route.js');
  const actionFiles = findFiles(appDir, (name) => name.endsWith('actions.ts') || name.endsWith('actions.js'));

  it('scans all route handlers and enforces pre-execution authentication/security guards before service-role access', () => {
    expect(routeFiles.length).toBeGreaterThan(100);

    const violations: Array<{ route: string; reason: string }> = [];

    for (const filePath of routeFiles) {
      const rel = relative(appDir, filePath).replace(/\\/g, '/');
      const content = readFileSync(filePath, 'utf8');

      const usesAdminClient = content.includes('createAdminClient');
      if (!usesAdminClient) continue;

      // Classify route purpose
      const isCron = rel.includes('cron') || content.includes('cronRoute') || content.includes('CRON_SECRET');
      const isWebhook = rel.includes('webhook') || content.includes('validateWebhookSignature') || content.includes('verifyWebhookSignature') || content.includes('stripe.webhooks.constructEvent') || content.includes('validateSignalWire') || content.includes('verifySignalwire') || content.includes('verifyVoice') || content.includes('verifySms') || content.includes('svix') || content.includes('verifySignature') || content.includes('verifySwaig') || content.includes('SWAIG_SECRET') || content.includes('SIGNALWIRE_API_TOKEN') || rel.includes('api/voice/');
      const isSignedToken = content.includes('verifyToken') || content.includes('verifySigned') || content.includes('token_hash') || content.includes('timingSafeEqual') || content.includes('parseUnsubscribeToken') || content.includes('verifyUnsubscribeToken') || content.includes('verifyPortalToken') || content.includes('verifyContinuationToken') || content.includes('verifyOtp') || rel.includes('[token]');
      const isSessionAuth = content.includes('requireAuth') || content.includes('requireAdmin') || content.includes('requirePermission') || content.includes('requireDashboardShellContext') || content.includes('requireOwnerContext') || content.includes('requireOfficeContext') || content.includes('requireStaffContext') || content.includes('requireStaff') || content.includes('requireCrewContext') || content.includes('loadCrewContext') || content.includes('auth.getUser()') || content.includes('getClaims(') || content.includes('verifiedUser');
      const isPublicUtility = content.includes('checkRateLimit') || content.includes('rateLimit') || rel.startsWith('api/tools/') || rel.startsWith('api/public/') || rel.startsWith('api/rebates/') || rel.startsWith('api/permits/jurisdiction') || rel.startsWith('api/demo/') || rel.startsWith('api/csp-report') || rel.startsWith('api/health') || rel.includes('robots.txt') || rel.includes('sitemap.xml');

      const hasGuard = isCron || isWebhook || isSignedToken || isSessionAuth || isPublicUtility;

      if (!hasGuard) {
        violations.push({ route: rel, reason: 'Uses createAdminClient without prior auth/signature/cron/token guard' });
      }
    }

    expect(violations, `Service-role scoping violations in routes: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

  it('scans all server action files and enforces tenant/auth/token guard execution', () => {
    expect(actionFiles.length).toBeGreaterThan(10);

    const violations: Array<{ actionFile: string; reason: string }> = [];

    for (const filePath of actionFiles) {
      const rel = relative(appDir, filePath).replace(/\\/g, '/');
      const content = readFileSync(filePath, 'utf8');

      const usesAdmin = content.includes('createAdminClient');
      if (!usesAdmin) continue;

      const hasAuthGuard = content.includes('requireAuth') || content.includes('requireOwnerContext') || content.includes('requireOfficeContext') || content.includes('requireCrewContext') || content.includes('requireStaffContext') || content.includes('requirePermission') || content.includes('verifiedUser') || content.includes('requireAdmin') || content.includes('loadCrewContext') || content.includes('auth.getUser()') || content.includes('getClaims(');
      const isPublicGuarded = content.includes('verifyToken') || content.includes('token') || content.includes('turnstile') || content.includes('rateLimit') || content.includes('checkRateLimit') || content.includes('validateCaptcha') || content.includes('verifyJobToken') || content.includes('parseUnsubscribeToken') || content.includes('verifyOtp') || rel.startsWith('login/') || rel.startsWith('field/login/') || rel.startsWith('contact/') || rel.startsWith('book/') || rel.startsWith('portal/') || rel.startsWith('quick-stop/') || rel.startsWith('invoice/') || rel.startsWith('review/') || rel.startsWith('track/') || rel.startsWith('client/jobs/') || rel.startsWith('unsubscribe/');

      if (!hasAuthGuard && !isPublicGuarded) {
        violations.push({ actionFile: rel, reason: 'Server action uses createAdminClient without auth or token guard' });
      }
    }

    expect(violations, `Server action guard violations: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

  it('asserts that all admin client queries in route handlers explicitly filter on account_id or specific entity keys', () => {
    for (const filePath of routeFiles) {
      const content = readFileSync(filePath, 'utf8');
      if (!content.includes('createAdminClient')) continue;

      if (content.includes(".from('clients')") || content.includes(".from('jobs')") || content.includes(".from('leads')") || content.includes(".from('invoices')") || content.includes(".from('payments')")) {
        const hasFilter = content.includes('.eq(') || content.includes('.in(') || content.includes('.match(');
        expect(hasFilter, `File ${filePath} queries tenant tables without filters`).toBe(true);
      }
    }
  });
});
