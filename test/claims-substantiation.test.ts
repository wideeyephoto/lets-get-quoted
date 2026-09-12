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
      // There is no trial, and there cannot be one without a price-contract
      // change: `trial_period_days` is rejected outright by
      // stripe-plan-prices.ts and top-up-purchase.ts, and a Price carrying one
      // fails the whole six-binding load rather than starting a trial. Flex is
      // $0/month with no card and is the default plan for every new workspace,
      // so "trial" both misdescribes the offer and implies an expiry that does
      // not exist. Five CTAs carried this string until 2026-09-08 while nothing
      // in test/ asserted anything about the word, so nothing stopped it
      // returning. "Trial by jury" in terms/page.tsx is unaffected by both.
      /\bfree\s+(platform\s+)?trial\b/i,
      /\btrial\s+period\b/i,
      /\bstart\s+(free\s+)?(platform\s+)?trial\b/i,
      /\bplatform\s+trial\b/i,
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

  it('prohibits unsubstantiated copy claims in lifecycle email and campaign templates', () => {
    const prohibitedCopyPatterns = [
      /activate\s+a\s+new\s+dedicated\s+local\s+line\s+with\s+1\s+click/i,
      /Custom\s+Domain\s+Setup/i,
      /80%\s+of\s+homeowners\s+who\s+(?:hit|reach)\s+(?:a\s+)?voicemail/i,
    ];

    for (const step of CONTRACTOR_LIFECYCLE_STEPS) {
      const combined = `${step.subject} ${step.preheader} ${step.heading} ${step.body}`;
      for (const pattern of prohibitedCopyPatterns) {
        expect(combined).not.toMatch(pattern);
      }
    }

    for (const template of PLATFORM_CAMPAIGN_TEMPLATES) {
      const combined = `${template.subject} ${template.preheader} ${template.heading} ${template.body}`;
      for (const pattern of prohibitedCopyPatterns) {
        expect(combined).not.toMatch(pattern);
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
  
  it('requires AI tier claim evidence artifact if the privacy page claims it is verified', () => {
    const privacyPagePath = path.resolve(process.cwd(), 'src/app/privacy/page.tsx');
    if (fs.existsSync(privacyPagePath)) {
      const content = fs.readFileSync(privacyPagePath, 'utf8');
      if (content.includes('verified: Google Cloud Billing active on Gemini API project')) {
        const evidenceDir = path.resolve(process.cwd(), 'docs/evidence');
        expect(fs.existsSync(evidenceDir)).toBe(true);
        const evidenceFiles = fs.readdirSync(evidenceDir);
        const hasAiTierEvidence = evidenceFiles.some(f => f.startsWith('ai-tier-inspection') && f.endsWith('.txt'));
        expect(hasAiTierEvidence).toBe(true);
      }
    }
  });
});
