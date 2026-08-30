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

describe('API Route Posture Audit', () => {
  const apiDir = join(process.cwd(), 'src/app/api');
  const routeFiles = findRouteFiles(apiDir);

  it('finds all API routes and asserts each has an established security/auth posture', () => {
    expect(routeFiles.length).toBeGreaterThan(10);

    const unprotected: string[] = [];

    for (const filePath of routeFiles) {
      const rel = relative(apiDir, filePath).replace(/\\/g, '/');
      const content = readFileSync(filePath, 'utf8');

      const isCron = rel.startsWith('cron/') || content.includes('cronRoute') || content.includes('CRON_SECRET');
      const isWebhook = rel.includes('webhook') || content.includes('validateWebhookSignature') || content.includes('verifyWebhookSignature') || content.includes('stripe.webhooks.constructEvent') || content.includes('svix') || content.includes('validateRequest') || content.includes('verifySignature') || content.includes('validateTwilio') || content.includes('validateSignalWire') || content.includes('verifyVoice') || content.includes('verifySms') || content.includes('verifySignalwire');
      const isAuthGuarded = content.includes('requireAdmin') || content.includes('requireDashboardShellContext') || content.includes('requireOwnerContext') || content.includes('requireOfficeContext') || content.includes('requireStaffContext') || content.includes('requireStaff') || content.includes('auth.getUser()') || content.includes('getClaims(') || content.includes('verifiedUser') || content.includes('requireCrewContext') || content.includes('loadCrewContext');
      const isRateLimited = content.includes('checkRateLimit') || content.includes('checkRateLimitStrict') || content.includes('rateLimit');
      const isSignedTokenGuarded = content.includes('verifyToken') || content.includes('parseUnsubscribeToken') || content.includes('verifyUnsubscribeToken') || content.includes('verifyContinuationToken') || content.includes('verifyOtp') || content.includes('verifyHmac') || content.includes('token_hash') || content.includes('timingSafeEqual') || content.includes('verifyPortalToken') || content.includes('verifySigned');
      const isPublicUtility = rel.startsWith('tools/') || rel.startsWith('rebates/') || rel.startsWith('permits/') || rel.startsWith('health') || rel.startsWith('email/track');
      const isReExport = content.includes("from '@/app/api/") || content.includes('from "@/app/api/');

      const hasDeclaredPosture = isCron || isWebhook || isAuthGuarded || isRateLimited || isSignedTokenGuarded || isPublicUtility || isReExport;

      if (!hasDeclaredPosture) {
        unprotected.push(rel);
      }
    }

    expect(unprotected, `Unprotected API routes found: ${unprotected.join(', ')}`).toEqual([]);
  });
});
