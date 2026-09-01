import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.isFile() && (entry.name === 'route.ts' || entry.name === 'route.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('All-Route Security & Auth Posture Audit', () => {
  const appDir = join(process.cwd(), 'src/app');
  const routeFiles = findRouteFiles(appDir);

  it('finds all routes across src/app and asserts each has an established security/auth posture', () => {
    expect(routeFiles.length).toBeGreaterThan(100);

    const unprotected: string[] = [];

    for (const filePath of routeFiles) {
      const rel = relative(appDir, filePath).replace(/\\/g, '/');
      const content = readFileSync(filePath, 'utf8');

      const isCron = rel.includes('cron') || content.includes('cronRoute') || content.includes('CRON_SECRET');
      const isWebhook = rel.includes('webhook') || content.includes('validateWebhookSignature') || content.includes('verifyWebhookSignature') || content.includes('stripe.webhooks.constructEvent') || content.includes('svix') || content.includes('validateRequest') || content.includes('verifySignature') || content.includes('validateTwilio') || content.includes('validateSignalWire') || content.includes('verifyVoice') || content.includes('verifySms') || content.includes('verifySignalwire');
      const isAuthGuarded = content.includes('requireAdmin') || content.includes('requirePermission') || content.includes('requireDashboardShellContext') || content.includes('requireOwnerContext') || content.includes('requireOfficeContext') || content.includes('requireStaffContext') || content.includes('requireStaff') || content.includes('auth.getUser()') || content.includes('getClaims(') || content.includes('verifiedUser') || content.includes('requireCrewContext') || content.includes('loadCrewContext') || content.includes('auth.signOut()') || content.includes('authenticateApiKey') || content.includes('requirePublicApiAuth') || rel.startsWith('api/v1/');
      const isRateLimited = content.includes('checkRateLimit') || content.includes('checkRateLimitStrict') || content.includes('rateLimit');
      const isSignedTokenGuarded = content.includes('verifyToken') || content.includes('params.token') || content.includes('parseUnsubscribeToken') || content.includes('verifyUnsubscribeToken') || content.includes('verifyContinuationToken') || content.includes('verifyOtp') || content.includes('verifyHmac') || content.includes('token_hash') || content.includes('timingSafeEqual') || content.includes('verifyPortalToken') || content.includes('verifySigned');
      const isPublicUtility = rel.startsWith('api/tools/') || rel.startsWith('api/rebates/') || rel.startsWith('api/permits/') || rel.startsWith('api/health') || rel.startsWith('api/email/track') || rel.startsWith('api/og') || rel.startsWith('demo/') || rel.startsWith('api/demo/') || rel.includes('robots.txt') || rel.includes('sitemap.xml') || rel === 'client/portal/route.ts';
      const isReExport = content.includes("from '@/app/api/") || content.includes('from "@/app/api/');

      const hasDeclaredPosture = isCron || isWebhook || isAuthGuarded || isRateLimited || isSignedTokenGuarded || isPublicUtility || isReExport;


      if (!hasDeclaredPosture) {
        unprotected.push(rel);
      }
    }

    expect(unprotected, `Unprotected routes found: ${unprotected.join(', ')}`).toEqual([]);
  });
});

