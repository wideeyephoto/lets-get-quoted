import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Mobile Matrix & Cross-Device Compliance (iOS Safari & Android Chrome)', () => {
  const rootDir = process.cwd();
  const globalsCss = readFileSync(join(rootDir, 'src/app/globals.css'), 'utf8');
  const globalsLiteCss = readFileSync(join(rootDir, 'src/app/globals-lite.css'), 'utf8');
  const layoutTsx = readFileSync(join(rootDir, 'src/app/layout.tsx'), 'utf8');

  describe('1. Viewport & Safe-Area Configuration (iOS Safari Dynamic Insets)', () => {
    it('configures layout.tsx viewport with device-width, initialScale 1, and viewportFit cover', () => {
      expect(layoutTsx).toContain("width: 'device-width'");
      expect(layoutTsx).toContain('initialScale: 1');
      expect(layoutTsx).toContain("viewportFit: 'cover'");
    });

    it('declares env(safe-area-inset-bottom) on .payment-shell and .cbrand-foot to clear Safari bottom toolbar', () => {
      expect(globalsCss).toMatch(/\.payment-shell[\s\S]*?env\(safe-area-inset-bottom/);
      expect(globalsLiteCss).toMatch(/\.payment-shell[\s\S]*?env\(safe-area-inset-bottom/);

      expect(globalsCss).toMatch(/\.cbrand-foot[\s\S]*?env\(safe-area-inset-bottom/);
      expect(globalsLiteCss).toMatch(/\.cbrand-foot[\s\S]*?env\(safe-area-inset-bottom/);
    });

    it('declares env(safe-area-inset-top) on .cbrand sticky header for notch and Dynamic Island clearance', () => {
      expect(globalsCss).toMatch(/\.cbrand[\s\S]*?env\(safe-area-inset-top/);
      expect(globalsLiteCss).toMatch(/\.cbrand[\s\S]*?env\(safe-area-inset-top/);
    });

    it('declares scroll-margin-top on customer heroes to prevent sticky header occlusion during anchor scroll', () => {
      expect(globalsCss).toMatch(/\.payment-hero[\s\S]*?scroll-margin-top:\s*calc\(72px\s*\+\s*env\(safe-area-inset-top/);
      expect(globalsLiteCss).toMatch(/\.payment-hero[\s\S]*?scroll-margin-top:\s*calc\(72px\s*\+\s*env\(safe-area-inset-top/);
    });
  });

  describe('2. Touch Target Heights (44px Minimum for iOS Safari & Android Chrome)', () => {
    it('guarantees min-height: 44px on all .btn controls in base stylesheet', () => {
      expect(globalsCss).toMatch(/\.btn\s*\{[\s\S]*?min-height:\s*44px/);
      expect(globalsLiteCss).toMatch(/\.btn\s*\{[\s\S]*?min-height:\s*44px/);
    });

    it('guarantees 48px height on payment submit buttons on mobile viewports (<= 640px)', () => {
      expect(globalsCss).toMatch(/\.payment-shell \.workspace-actions \.btn[\s\S]*?min-height:\s*48px/);
      expect(globalsLiteCss).toMatch(/\.payment-shell \.workspace-actions \.btn[\s\S]*?min-height:\s*48px/);
    });
  });

  describe('3. Payment Element & Apple Pay Button Width Sizing', () => {
    it('forces .payment-shell actions and buttons to span 100% width on mobile viewports', () => {
      expect(globalsCss).toMatch(/\.payment-shell \.actions\.workspace-actions[\s\S]*?width:\s*100%/);
      expect(globalsCss).toMatch(/\.payment-shell \.workspace-actions \.btn[\s\S]*?width:\s*100%/);

      expect(globalsLiteCss).toMatch(/\.payment-shell \.actions\.workspace-actions[\s\S]*?width:\s*100%/);
      expect(globalsLiteCss).toMatch(/\.payment-shell \.workspace-actions \.btn[\s\S]*?width:\s*100%/);
    });

    it('wraps payment accepted methods cleanly without fixed overflow boundaries', () => {
      const payPageTsx = readFileSync(join(rootDir, 'src/app/pay/[id]/page.tsx'), 'utf8');
      expect(payPageTsx).toContain("flexWrap: 'wrap'");
      expect(payPageTsx).toContain('Apple Pay');
      expect(payPageTsx).toContain('Google Pay');
    });
  });

  describe('4. Token Surface Consistency Across Customer Routes', () => {
    const tokenPages = [
      'src/app/pay/[id]/page.tsx',
      'src/app/invoice/[id]/page.tsx',
      'src/app/portal/view/[token]/page.tsx',
      'src/app/review/[token]/page.tsx',
      'src/app/quick-stop/[id]/page.tsx',
      'src/app/client/jobs/[token]/page.tsx',
    ];

    it('verifies that all customer payment and token pages import ContractorBrandBar or payment-shell', () => {
      for (const relPath of tokenPages) {
        const content = readFileSync(join(rootDir, relPath), 'utf8');
        const usesBrandBar = content.includes('ContractorBrandBar');
        const usesPaymentShell = content.includes('payment-shell');
        expect(
          usesBrandBar || usesPaymentShell,
          `Customer route ${relPath} must use ContractorBrandBar or payment-shell for brand & viewport consistency`,
        ).toBe(true);
      }
    });

    it('ensures customer token pages reject search index crawlers (robots: noindex)', () => {
      const sensitiveTokenPages = [
        'src/app/portal/view/[token]/page.tsx',
        'src/app/review/[token]/page.tsx',
        'src/app/track/[token]/page.tsx',
      ];

      for (const relPath of sensitiveTokenPages) {
        const content = readFileSync(join(rootDir, relPath), 'utf8');
        expect(content, `Page ${relPath} must declare robots noindex`).toMatch(/robots:\s*\{\s*index:\s*false/);
      }
    });
  });
});
