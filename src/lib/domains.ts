import { resolve4, resolveCname } from 'dns/promises';

export type DomainVerification = {
  verified: boolean;
  records: string[];
  expectedCname: string;
  expectedIp: string | null;
};

export function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

export async function verifyDomain(domainValue: string): Promise<DomainVerification> {
  const domain = normalizeDomain(domainValue);
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error('Enter a valid domain such as www.yourbusiness.com.');
  }

  const expectedCname = (process.env.CUSTOM_DOMAIN_CNAME_TARGET || 'domains.letsgetquoted.com').toLowerCase().replace(/\.$/, '');
  const expectedIp = process.env.CUSTOM_DOMAIN_A_RECORD || null;
  const records: string[] = [];
  try { records.push(...(await resolveCname(domain)).map((record) => record.toLowerCase().replace(/\.$/, ''))); } catch {}
  try { records.push(...await resolve4(domain)); } catch {}

  return {
    verified: records.includes(expectedCname) || Boolean(expectedIp && records.includes(expectedIp)),
    records,
    expectedCname,
    expectedIp,
  };
}