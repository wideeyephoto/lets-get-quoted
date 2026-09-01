import { describe, it, expect } from 'vitest';
import {
  isValidDomainFormat,
  checkCustomDomainDnsStatus,
} from '@/lib/website-domain-manager';
import { resolveTenantHost } from '@/lib/tenant-host';

describe('Custom-Domain Lifecycle & Tenant Isolation Audit', () => {
  describe('1. Domain Format & Syntax Validation', () => {
    it('accepts valid apex and subdomain contractor custom domains', () => {
      expect(isValidDomainFormat('austinroofingpro.com')).toBe(true);
      expect(isValidDomainFormat('estimates.proplumber.com')).toBe(true);
      expect(isValidDomainFormat('clean-coat-painting.co')).toBe(true);
      expect(isValidDomainFormat('texas-hvac.build')).toBe(true);
    });

    it('rejects invalid, malformed, or malicious domain inputs', () => {
      expect(isValidDomainFormat('')).toBe(false);
      expect(isValidDomainFormat('invalid_domain')).toBe(false);
      expect(isValidDomainFormat('http://austinroofingpro.com')).toBe(false);
      expect(isValidDomainFormat('austinroofingpro.com/path')).toBe(false);
      expect(isValidDomainFormat('-leadinghyphen.com')).toBe(false);
      expect(isValidDomainFormat('trailinghyphen-.com')).toBe(false);
      expect(isValidDomainFormat('a'.repeat(255) + '.com')).toBe(false);
    });
  });

  describe('2. DNS Record Generation & Status Inspection', () => {
    it('generates A and CNAME record requirements for apex domains', async () => {
      const status = await checkCustomDomainDnsStatus('austinroofingpro.com', 'acc_123456');

      expect(status.domain).toBe('austinroofingpro.com');
      expect(status.isConfigured).toBe(true);
      expect(status.sslStatus).toBe('active');
      expect(status.dnsRecords.length).toBe(2);

      const aRecord = status.dnsRecords.find(r => r.type === 'A');
      const cnameRecord = status.dnsRecords.find(r => r.type === 'CNAME');

      expect(aRecord).toBeDefined();
      expect(aRecord?.value).toBe('76.76.21.21');
      expect(cnameRecord).toBeDefined();
      expect(cnameRecord?.value).toBe('custom-sites.letsgetquoted.com');
    });

    it('generates CNAME record requirements for subdomain custom domains', async () => {
      const status = await checkCustomDomainDnsStatus('quotes.austinroofingpro.com', 'acc_123456');

      expect(status.domain).toBe('quotes.austinroofingpro.com');
      expect(status.dnsRecords.length).toBe(1);

      const cname = status.dnsRecords[0];
      expect(cname?.type).toBe('CNAME');
      expect(cname?.name).toBe('quotes');
      expect(cname?.value).toBe('custom-sites.letsgetquoted.com');
    });
  });

  describe('3. Edge Tenant Host Isolation & Hijack Resistance', () => {
    it('classifies custom contractor domains as customDomain', () => {
      const tenant = resolveTenantHost('austinroofingpro.com', 'letsgetquoted.com');
      expect(tenant.kind).toBe('customDomain');
      if (tenant.kind === 'customDomain') {
        expect(tenant.domain).toBe('austinroofingpro.com');
      }
    });

    it('protects platform apex, app, and Vercel preview domains from customDomain shadowing', () => {
      expect(resolveTenantHost('letsgetquoted.com', 'letsgetquoted.com').kind).toBe('platform');
      expect(resolveTenantHost('www.letsgetquoted.com', 'letsgetquoted.com').kind).toBe('platform');
      expect(resolveTenantHost('app.letsgetquoted.com', 'letsgetquoted.com').kind).toBe('platform');
      expect(resolveTenantHost('preview-1234.vercel.app', 'letsgetquoted.com').kind).toBe('platform');
      expect(resolveTenantHost('localhost', 'letsgetquoted.com').kind).toBe('platform');
    });
  });
});
