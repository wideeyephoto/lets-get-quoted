import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/app-origin';
import { validateAdReturnUrl, sanitizeAdAlertPhone } from '@/lib/ad-billing-shared';
import { parseVideoSource } from '@/lib/video-source';
import { ownedPhotoPaths } from '@/lib/job-photo-storage';
import { isSensitivePath } from '@/components/google-tag';
import { staffCan, type StaffRole, type Permission } from '@/lib/staff';

describe('External & Internal Penetration Testing Suite', () => {
  describe('Penetration Vector 1: Open Redirect & Phishing Defense', () => {
    it('blocks protocol-relative URLs (//evil.com) from redirect destinations', () => {
      const payloads = [
        '//evil.com',
        '///evil.com',
        '//attacker.org/login',
        '/\\evil.com',
        '\\evil.com',
        'https://attacker.com',
        'http://phishing.site',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      for (const payload of payloads) {
        const result = safeNextPath(payload, '/dashboard');
        expect(result, `Failed on payload: ${payload}`).toBe('/dashboard');
        expect(result.startsWith('//')).toBe(false);
        expect(result.startsWith('http:') || result.startsWith('https:')).toBe(false);
      }
    });

    it('validates and sanitizes ad return URLs, blocking foreign origins and schemes', () => {
      const attackUrls = [
        'https://evil.com/fake-stripe-return',
        'http://localhost.attacker.com',
        'javascript:alert(document.cookie)',
        '//google.com',
        'data:application/json,{}',
      ];

      for (const badUrl of attackUrls) {
        const sanitized = validateAdReturnUrl(badUrl);
        expect(sanitized).toBe('/dashboard/marketing/ads');
      }

      // Safe same-origin URLs or relative paths pass
      const safeRelative = '/dashboard/marketing/ads?session_id=cs_test_123';
      expect(validateAdReturnUrl(safeRelative)).toBe(safeRelative);

      const safeAbsolute = 'https://app.letsgetquoted.com/dashboard/marketing/ads';
      expect(validateAdReturnUrl(safeAbsolute)).toBe(safeAbsolute);
    });
  });

  describe('Penetration Vector 2: SSRF & Remote Media Injection', () => {
    it('sanitizes phone numbers and strips CRLF / injection characters', () => {
      const maliciousPhones = [
        '+15551234567\r\nBcc: victim@example.com',
        '+1 (555) 123-4567; DROP TABLE clients;',
        '<script>+15551234567</script>',
        '+15551234567%0A%0D',
      ];

      for (const phone of maliciousPhones) {
        const sanitized = sanitizeAdAlertPhone(phone);
        if (sanitized) {
          expect(sanitized).not.toContain('\r');
          expect(sanitized).not.toContain('\n');
          expect(sanitized).not.toContain(';');
          expect(sanitized).not.toContain('<');
          expect(sanitized).not.toContain('>');
        }
      }
    });

    it('restricts external video sources to safe protocols, rejecting non-video file schemes and SSRF endpoints', () => {
      const maliciousSources = [
        'file:///etc/passwd',
        'gopher://127.0.0.1:6379/_flushall',
        'http://169.254.169.254/latest/meta-data/', // AWS metadata SSRF (not video extension)
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      for (const source of maliciousSources) {
        const parsed = parseVideoSource(source);
        expect(parsed, `Payload ${source} should be rejected`).toBeNull();
      }
    });
  });

  describe('Penetration Vector 3: Path Traversal & Cross-Tenant Storage Exploits', () => {
    it('blocks directory traversal attempts in file path inputs', () => {
      const tenantId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
      const attackPaths = [
        `../etc/passwd`,
        `../../${tenantId}/file.jpg`,
        `${tenantId}/../../../secrets.env`,
        `${tenantId}/..%2f..%2fconfig.json`,
        `bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/file.jpg`, // IDOR cross-tenant target
      ];

      const validPaths = ownedPhotoPaths(tenantId, attackPaths);
      expect(validPaths).toEqual([]);
    });
  });

  describe('Penetration Vector 4: Sensitive Token & Credential Exposure on Analytics', () => {
    it('suppresses tracking and analytics on all sensitive, authenticated, and token-bearing routes', () => {
      const sensitiveEndpoints = [
        '/portal/magic-link-token-12345',
        '/portal?token=secret_portal_token',
        '/track/arrival-token-live',
        '/office-invite/accept?token=invite_secret',
        '/quick-stop/qs_tok_123',
        '/auth/callback?code=oauth_code',
        '/dashboard/settings',
        '/admin/accounts',
        '/unsubscribe?token=hmac_signed_unsub',
        '/invoice/inv_123/pay',
      ];

      for (const endpoint of sensitiveEndpoints) {
        expect(isSensitivePath(endpoint), `Route ${endpoint} must be flagged sensitive`).toBe(true);
      }

      // Public marketing pages should NOT be suppressed
      expect(isSensitivePath('/')).toBe(false);
      expect(isSensitivePath('/pricing')).toBe(false);
      expect(isSensitivePath('/features/ai-intake')).toBe(false);
    });
  });

  describe('Penetration Vector 5: Role Privilege Escalation & Granular Staff Capabilities', () => {
    it('denies inactive staff members access regardless of assigned permissions', () => {
      const inactiveStaff = {
        id: 'user-inactive',
        role: 'ops' as StaffRole,
        active: false,
      };

      expect(staffCan(inactiveStaff, 'account.export')).toBe(false);
      expect(staffCan(inactiveStaff, 'ops.manage')).toBe(false);
    });

    it('denies active staff members permissions not granted in their profile', () => {
      const supportStaff = {
        id: 'user-support',
        role: 'support' as StaffRole,
        active: true,
      };

      // Support staff cannot delete accounts or manage ops/money
      expect(staffCan(supportStaff, 'account.delete')).toBe(false);
      expect(staffCan(supportStaff, 'money.refund')).toBe(false);
      expect(staffCan(supportStaff, 'account.support')).toBe(true);
      expect(staffCan(supportStaff, 'account.export')).toBe(true);
    });

    it('denies unauthenticated / null user contexts from exercising permissions', () => {
      expect(staffCan(null, 'account.export')).toBe(false);
      expect(staffCan(undefined, 'account.export')).toBe(false);
    });
  });
});
