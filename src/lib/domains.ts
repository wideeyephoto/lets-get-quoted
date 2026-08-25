import { resolve4, resolveCname } from 'dns/promises';
import {
  addDomainToVercel,
  getVercelDomainConfig,
  isVercelDomainProvisioningConfigured,
  verifyVercelDomain,
} from '@/lib/vercel-domains';

export type DomainVerification = {
  verified: boolean;
  records: string[];
  expectedCname: string;
  expectedIp: string | null;
  isApex: boolean;
  apexDomain: string;
  subdomain: string | null;
  sslStatus: 'issued' | 'pending' | 'error' | 'unconfigured';
  vercelConfigured: boolean;
};

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

export function parseDomainParts(domainValue: string) {
  const domain = normalizeDomain(domainValue);
  const parts = domain.split('.');
  const isApex = parts.length === 2;
  const apexDomain = isApex ? domain : parts.slice(-2).join('.');
  const subdomain = isApex ? null : parts.slice(0, -2).join('.');
  return { domain, isApex, apexDomain, subdomain };
}

export async function verifyDomain(domainValue: string): Promise<DomainVerification> {
  const domain = normalizeDomain(domainValue);
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Enter a valid domain such as www.yourbusiness.com or yourbusiness.com.');
  }

  const { isApex, apexDomain, subdomain } = parseDomainParts(domain);

  const expectedCname = (process.env.CUSTOM_DOMAIN_CNAME_TARGET || 'domains.letsgetquoted.com').toLowerCase().replace(/\.$/, '');
  const expectedIp = process.env.CUSTOM_DOMAIN_A_RECORD || '76.76.21.21';
  const records: string[] = [];

  try { records.push(...(await resolveCname(domain)).map((record) => record.toLowerCase().replace(/\.$/, ''))); } catch {}
  try { records.push(...await resolve4(domain)); } catch {}

  const dnsMatchesCname = records.includes(expectedCname);
  const dnsMatchesIp = Boolean(expectedIp && records.includes(expectedIp));
  const dnsVerified = dnsMatchesCname || dnsMatchesIp;

  let sslStatus: 'issued' | 'pending' | 'error' | 'unconfigured' = 'unconfigured';
  const vercelConfigured = isVercelDomainProvisioningConfigured();

  if (vercelConfigured) {
    try {
      // Auto-register with Vercel if needed
      await addDomainToVercel(domain);
      if (dnsVerified) {
        await verifyVercelDomain(domain);
      }
      const config = await getVercelDomainConfig(domain);
      if (config?.ssl?.status && config.ssl.status !== 'none') {
        sslStatus = config.ssl.status;
      } else {
        sslStatus = dnsVerified ? 'issued' : 'pending';
      }
    } catch {
      sslStatus = dnsVerified ? 'issued' : 'pending';
    }
  } else if (dnsVerified) {
    sslStatus = 'issued';
  }

  return {
    verified: dnsVerified,
    records,
    expectedCname,
    expectedIp,
    isApex,
    apexDomain,
    subdomain,
    sslStatus,
    vercelConfigured,
  };
}