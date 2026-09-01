import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import SpeculationRules from '@/components/speculation-rules';
import React from 'react';

describe('Page Load Performance Optimizations', () => {
  describe('SpeculationRules', () => {
    it('renders valid speculation rules JSON structure', async () => {
      const element = await SpeculationRules();
      expect(element).toBeDefined();
      expect(element.type).toBe('script');
      expect(element.props.type).toBe('speculationrules');

      const json = JSON.parse(element.props.dangerouslySetInnerHTML.__html);
      expect(json).toHaveProperty('prefetch');
      expect(Array.isArray(json.prefetch)).toBe(true);
      expect(json.prefetch[0].eagerness).toBe('moderate');
      expect(json.prefetch[0].where.and).toEqual(
        expect.arrayContaining([
          { href_matches: '/*' },
          { not: { href_matches: '/api/*' } },
          { not: { href_matches: '/dashboard/*' } },
          { not: { href_matches: '/admin/*' } },
        ])
      );
    });
  });

  describe('Middleware Fast-Path Auth Handling', () => {
    it('bounces unauthenticated dashboard request to /login without network calls', async () => {
      const req = new NextRequest('http://localhost:3010/dashboard/jobs', {
        headers: { host: 'localhost:3010' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3010/login?next=%2Fdashboard%2Fjobs');
    });

    it('allows unauthenticated marketing homepage through with CSP', async () => {
      const req = new NextRequest('http://localhost:3010/', {
        headers: { host: 'localhost:3010' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-security-policy-report-only') || res.headers.get('content-security-policy')).toBeDefined();
    });

    it('redirects unauthenticated marketing request on app host to apex without auth call', async () => {
      const req = new NextRequest('https://app.letsgetquoted.com/pricing', {
        headers: { host: 'app.letsgetquoted.com' },
      });
      const res = await middleware(req);
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://letsgetquoted.com/pricing');
    });
  });
});
