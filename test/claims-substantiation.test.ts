import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PRICING_FAQS, COMPARISON_ROWS } from '@/app/pricing/pricing-catalog';
import { BILLING_PLANS, platformFeePercent } from '@/lib/billing/catalog';
import { PLATFORM_CAMPAIGN_TEMPLATES } from '@/lib/platform-campaign-templates';
import { CONTRACTOR_LIFECYCLE_STEPS } from '@/lib/contractor-lifecycle-emails';

describe('Legal & Claims Substantiation Invariants', () => {
  it('prohibits unsubstantiated 100% deliverability or 100% compliance strings in src/', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const prohibitedPatterns = [
      /guarantees\s+100%\s+carrier\s+delivery/i,
      /100%\s+UPPA\s+compliant/i,
      /When\s+we\s+analyzed\s+the\s+contractors\s+with\s+the\s+highest\s+win\s+rates\s+on\s+Let's\s+Get\s+Quoted/i,
    ];

    function scanDirectory(dir: string): Array<{ file: string; match: string }> {
      const violations: Array<{ file: string; match: string }> = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip node_modules or build dirs if any
          if (!['node_modules', '.next'].includes(entry.name)) {
            violations.push(...scanDirectory(fullPath));
          }
        } else if (/\.(tsx?|jsx?|md|json)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of prohibitedPatterns) {
            const match = content.match(pattern);
            if (match) {
              violations.push({ file: fullPath, match: match[0] });
            }
          }
        }
      }
      return violations;
    }

    const findings = scanDirectory(srcDir);
    expect(findings).toEqual([]);
  });

  it('pricing catalog accurately qualifies AI Voice Receptionist as preview/rollout', () => {
    const aiVoiceFaq = PRICING_FAQS.find((faq) => faq.q.toLowerCase().includes('ai voice'));
    expect(aiVoiceFaq).toBeDefined();
    expect(aiVoiceFaq?.a).toContain('preview');
    expect(aiVoiceFaq?.a).toContain('Smart Intake');
    expect(aiVoiceFaq?.a).not.toContain('Yes, AI Voice is available! For customer-facing call reception');
  });

  it('platform campaign templates reference valid active dashboard routes', () => {
    const invalidRoutes = ['/dashboard/jobs/new', '/dashboard/billing'];
    for (const template of PLATFORM_CAMPAIGN_TEMPLATES) {
      if (template.ctaUrl) {
        for (const invalid of invalidRoutes) {
          expect(template.ctaUrl).not.toContain(invalid);
        }
      }
    }
  });

  it('contractor lifecycle steps reference valid active application routes', () => {
    const invalidRoutes = ['/dashboard/jobs/new', '/dashboard/billing'];
    for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
      if (step.ctaPath) {
        for (const invalid of invalidRoutes) {
          expect(step.ctaPath).not.toBe(invalid);
        }
        expect(step.ctaPath.startsWith('/dashboard')).toBe(true);
      }
    }
  });

  it('pricing comparison table quantitative parameters match BILLING_PLANS exactly', () => {
    const feeRow = COMPARISON_ROWS.find((row) => row[0] === 'LGQ platform fee');
    expect(feeRow).toBeDefined();
    expect(Number.parseFloat(feeRow?.[1] || '0')).toBe(platformFeePercent('flex'));
    expect(Number.parseFloat(feeRow?.[2] || '0')).toBe(platformFeePercent('solo'));
    expect(Number.parseFloat(feeRow?.[3] || '0')).toBe(platformFeePercent('growth'));
    expect(Number.parseFloat(feeRow?.[4] || '0')).toBe(platformFeePercent('scale'));

    const crewSeatsRow = COMPARISON_ROWS.find((row) => row[0] === 'Crew-only users');
    expect(crewSeatsRow).toBeDefined();
    expect(crewSeatsRow?.[1]).toBe(String(BILLING_PLANS.flex.allowances.crewUsers));
    expect(crewSeatsRow?.[2]).toBe(String(BILLING_PLANS.solo.allowances.crewUsers));
    expect(crewSeatsRow?.[3]).toBe(String(BILLING_PLANS.growth.allowances.crewUsers));
    expect(crewSeatsRow?.[4]).toBe(String(BILLING_PLANS.scale.allowances.crewUsers));
  });
});
