import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyDomain } from '@/lib/domains';

export interface CustomDomainStatus {
  domain: string;
  accountId: string;
  isConfigured: boolean;
  sslStatus: 'active' | 'pending' | 'failed' | 'unconfigured';
  cnameTarget: string;
  apexRecordIp: string;
  dnsRecords: Array<{
    type: 'CNAME' | 'A' | 'TXT';
    name: string;
    value: string;
    status: 'verified' | 'missing' | 'mismatched';
  }>;
  verifiedAt?: string;
}

export function isValidDomainFormat(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain.trim());
}

/** Read-only inspection: never fabricate successful DNS or SSL status. */
export async function checkCustomDomainDnsStatus(
  domain: string,
  accountId: string,
  _supabase?: SupabaseClient,
): Promise<CustomDomainStatus> {
  const cleanDomain = domain.trim().toLowerCase();
  const result = await verifyDomain(cleanDomain, { provision: false });
  const recordStatus = result.dnsVerified ? 'verified' : result.records.length ? 'mismatched' : 'missing';
  return {
    domain: cleanDomain,
    accountId,
    isConfigured: result.verified,
    sslStatus: result.sslStatus === 'issued' ? 'active' : result.sslStatus === 'error' ? 'failed' : result.sslStatus,
    cnameTarget: result.expectedCname,
    apexRecordIp: result.expectedIp || '',
    dnsRecords: [
      result.isApex
        ? { type: 'A', name: '@', value: result.expectedIp || '', status: recordStatus }
        : { type: 'CNAME', name: result.subdomain || 'www', value: result.expectedCname, status: recordStatus },
      ...result.verification.filter((record) => record.type === 'TXT').map((record) => ({
        type: 'TXT' as const, name: record.domain, value: record.value, status: 'missing' as const,
      })),
    ],
    ...(result.verified ? { verifiedAt: new Date().toISOString() } : {}),
  };
}
