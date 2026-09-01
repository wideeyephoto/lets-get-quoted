import { randomUUID } from 'node:crypto';

export interface ImpersonationSession {
  sessionId: string;
  accountId: string;
  businessName: string;
  adminStaffEmail: string;
  impersonationUrl: string;
  expiresAt: string;
  isReadOnly: boolean;
}

/**
 * Generates an audited, time-limited read-only impersonation link for staff technical support.
 * 
 * SECURITY NOTE: URL parameters (`&read_only=1`, `?impersonate=`) are presentation-level only.
 * When an active server consumer is built, session validation MUST verify the `sessionId`
 * server-side against an audited store with cryptographic signing and staff permission checks.
 */
export function generateSupportImpersonationSession(params: {
  accountId: string;
  businessName: string;
  adminStaffEmail: string;
  durationMinutes?: number;
}): ImpersonationSession {
  const { accountId, businessName, adminStaffEmail, durationMinutes = 15 } = params;
  const sessionId = `imp_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const impersonationUrl = `https://app.letsgetquoted.com/dashboard?impersonate=${encodeURIComponent(sessionId)}&account=${encodeURIComponent(accountId)}&read_only=1`;

  return {
    sessionId,
    accountId,
    businessName,
    adminStaffEmail,
    impersonationUrl,
    expiresAt,
    isReadOnly: true,
  };
}
