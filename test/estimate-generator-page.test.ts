import { describe, it, expect } from 'vitest';
import { metadata } from '@/app/tools/estimate-generator/page';
import fs from 'node:fs';
import path from 'node:path';

describe('Estimate Generator Route & Metadata Integrity', () => {
  const pagePath = path.resolve(__dirname, '../src/app/tools/estimate-generator/page.tsx');
  const clientPath = path.resolve(__dirname, '../src/app/tools/estimate-generator/EstimateGeneratorClient.tsx');
  const cssPath = path.resolve(__dirname, '../src/app/tools/tools.module.css');

  const pageSource = fs.readFileSync(pagePath, 'utf8');
  const clientSource = fs.readFileSync(clientPath, 'utf8');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  it('declares exact route-specific title and canonical metadata', () => {
    expect(metadata.title).toBe('Free Contractor Estimate Generator | Let’s Get Quoted');
    expect(metadata.alternates?.canonical).toBe('https://letsgetquoted.com/tools/estimate-generator');
    expect(metadata.openGraph?.title).toBe('Free Contractor Estimate Generator | Let’s Get Quoted');
    expect(metadata.openGraph?.url).toBe('https://letsgetquoted.com/tools/estimate-generator');
  });

  it('keeps page.tsx as a Server Component without use client', () => {
    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).toContain('export const metadata');
    expect(pageSource).toContain('EstimateGeneratorClient');
  });

  it('marks EstimateGeneratorClient as a Client Component', () => {
    expect(clientSource).toMatch(/^['"]use client['"]/m);
  });

  it('includes JSON-LD SoftwareApplication schema on server page', () => {
    expect(pageSource).toContain('SoftwareApplication');
    expect(pageSource).toContain('Free Contractor Quote & Estimate Generator');
    expect(pageSource).toContain('https://letsgetquoted.com/tools/estimate-generator');
  });

  it('provides comprehensive SEO educational sections below the tool', () => {
    expect(pageSource).toContain('How to Create a Professional Contractor Estimate in 4 Steps');
    expect(pageSource).toContain('What Every Trade Contractor Estimate Must Include');
    expect(pageSource).toContain('Estimate vs. Quote vs. Bid: What’s the Difference?');
    expect(pageSource).toContain('Contractor Tax &amp; Deposit Guidelines');
    expect(pageSource).toContain('/tools/hourly-rate-calculator');
    expect(pageSource).toContain('/tools/leakage-calculator');
    expect(pageSource).toContain('/pricing#savings-calculator');
  });

  it('implements responsive mobile card styles and eliminates table overflow', () => {
    expect(cssSource).toContain('.mobileItemList');
    expect(cssSource).toContain('.mobileItemCard');
    expect(cssSource).toContain('.cardRemoveBtn');
    expect(cssSource).toContain('@media (max-width: 768px)');
    expect(cssSource).toContain('.estimateTable');
  });

  it('implements dedicated print stylesheet with form border removal, clean header, and chrome suppression', () => {
    expect(cssSource).toContain('@media print');
    expect(cssSource).toContain('size: letter portrait;');
    expect(cssSource).toContain('margin: 0.35in;');
    expect(cssSource).toContain('.screenOnly');
    expect(cssSource).toContain('.printOnly');
    expect(cssSource).toContain('.hero');
    expect(cssSource).toContain('.editorHeaderBar');
    expect(cssSource).toContain('break-inside: avoid !important;');
    expect(cssSource).toContain('display: table !important;');
    expect(cssSource).toContain(':global(.public-topbar)');
    expect(cssSource).toContain(':global(.theme-fab)');
    expect(cssSource).toContain(':global(.marketing-footer)');
    expect(cssSource).toContain('.estimateTopRow');
    expect(cssSource).toContain('.estimateMetaGrid');
  });

  it('includes contextual quote conversion CTA with attributed link', () => {
    expect(clientSource).toContain('Save this estimate, text it for approval, and collect a deposit');
    expect(clientSource).toContain("goal: 'feature'");
    expect(clientSource).toContain("feature: 'quotes'");
    expect(clientSource).toContain("source: 'tools'");
  });

  it('supports Start Blank, Use Example, and draft persistence', () => {
    expect(clientSource).toContain('Start Blank');
    expect(clientSource).toContain('Use Example');
    expect(clientSource).toContain('Saved on this device');
    expect(clientSource).toContain('New Estimate');
    expect(clientSource).toContain('loadEstimateDraft');
    expect(clientSource).toContain('saveEstimateDraft');
  });

  it('includes professional client acceptance, signature block, and print footer', () => {
    expect(clientSource).toContain('acceptanceSection');
    expect(clientSource).toContain('Authorization &amp; Acceptance of Scope');
    expect(clientSource).toContain('Authorized Client / Homeowner Signature');
    expect(clientSource).toContain('Contractor Representative Signature');
    expect(clientSource).toContain('printFooter');
    expect(clientSource).toContain('Thank you for the opportunity to earn your business!');
    expect(cssSource).toContain('.acceptanceSection');
    expect(cssSource).toContain('.signatureGrid');
    expect(cssSource).toContain('.signatureLine');
    expect(cssSource).toContain('.printFooter');
  });

  it('provides dedicated print typography and clean metadata card without raw input artifacts', () => {
    expect(clientSource).toContain('printHeaderCompany');
    expect(clientSource).toContain('printMetaCard');
    expect(clientSource).toContain('printClientSection');
    expect(clientSource).toContain('printItemTitle');
    expect(clientSource).toContain('printCategoryPill');
    expect(clientSource).toContain('printTermsBlock');
    expect(cssSource).toContain('.printHeaderCompany');
    expect(cssSource).toContain('.printMetaCard');
    expect(cssSource).toContain('.printClientSection');
    expect(cssSource).toContain('.printCategoryPill');
  });
});
