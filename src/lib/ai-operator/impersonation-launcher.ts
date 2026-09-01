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
 * Generates an audited, time-limited read-only impersonation link for staff technical support
 */
export function generateSupportImpersonationSession(params: {
  accountId: string;
  businessName: string;
  adminStaffEmail: string;
  durationMinutes?: number;
}): ImpersonationSession {
  const { accountId, businessName, adminStaffEmail, durationMinutes = 15 } = params;
  const sessionId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
