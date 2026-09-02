import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import sitemap from '@/app/sitemap';
import { MANUAL_ARTICLES } from '@/lib/help/user-manual';
import { demoSupabase } from '@/lib/demo-rows';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { getClient, getClientStatement } from '@/lib/clients';
import { getPublicSiteBySubdomain } from '@/lib/sites';

describe('Public Link and Destination Integrity Suite', () => {
  describe('High Priority Conversion CTAs & Feature Pages', () => {
    it('AI Ads page uses canonical start URL and has no fake #demo link', () => {
      const aiAdsSource = readFileSync('src/app/features/ai-ads/page.tsx', 'utf8');
      expect(aiAdsSource).toContain('https://app.letsgetquoted.com/start?goal=build_site&source=feature_page');
      expect(aiAdsSource).not.toContain('/signup?source=ai_ads_feature');

      const simSource = readFileSync('src/app/features/ai-ads/AiAdsSimulator.tsx', 'utf8');
      expect(simSource).not.toContain('<a href="#demo"');
    });

    it('AI Voice, AI Vision, and Sparky feature pages have canonical platform signup CTAs', () => {
      const voiceSource = readFileSync('src/app/features/ai-voice/page.tsx', 'utf8');
      expect(voiceSource).toContain('https://app.letsgetquoted.com/start?goal=feature&feature=ai_intake&source=feature_page');

      const visionSource = readFileSync('src/app/features/ai-vision/page.tsx', 'utf8');
      expect(visionSource).toContain('https://app.letsgetquoted.com/start?goal=feature&feature=ai_intake&source=feature_page');

      const sparkySource = readFileSync('src/app/features/sparky/page.tsx', 'utf8');
      expect(sparkySource).toContain('https://app.letsgetquoted.com/start?goal=feature&source=feature_page');
    });

    it('AI Vision inspection photos exist and are embedded in VisionInspectorSimulator', () => {
      const visionSource = readFileSync('src/app/features/ai-vision/page.tsx', 'utf8');
      expect(visionSource).toContain('/images/ai-vision/furnace-rating-plate.jpg');
      expect(visionSource).toContain('/images/ai-vision/secondary-coil-rust.jpg');
      expect(existsSync('public/images/ai-vision/furnace-rating-plate.jpg')).toBe(true);
      expect(existsSync('public/images/ai-vision/secondary-coil-rust.jpg')).toBe(true);
    });

    it('CompanionHUD and HighTechShowcase use valid section anchors', () => {
      const hudSource = readFileSync('src/app/features/CompanionHUD.tsx', 'utf8');
      expect(hudSource).toContain('href="#software-sprawl-calculator"');
      expect(hudSource).not.toContain('href="#sprawl-calculator"');

      const showcaseSource = readFileSync('src/components/marketing/HighTechShowcase.tsx', 'utf8');
      expect(showcaseSource).toContain('/features/ai-intake#sandbox');
      expect(showcaseSource).toContain('/features/website-builder#video-studio');
    });

    it('Trade page links template previews to /demo/sites', () => {
      const tradeSource = readFileSync('src/app/for/[trade]/page.tsx', 'utf8');
      expect(tradeSource).toContain('href="/demo/sites"');
    });

    it('Resources guides point to correct dedicated feature pages', () => {
      const resourcesSource = readFileSync('src/lib/resources.ts', 'utf8');
      expect(resourcesSource).toContain("href: '/features/client-portal', label: 'Two-way SMS platform'");
      expect(resourcesSource).toContain("href: '/features/ai-voice', label: '24/7 AI Receptionist'");
    });

    it('Marketing AI Assistant chatbot recommendation links point to correct sub-targets', () => {
      const botSource = readFileSync('src/components/marketing/MarketingAiAssistant.tsx', 'utf8');
      expect(botSource).toContain("ctaHref: '/features/ai-intake#sandbox'");
      expect(botSource).toContain("ctaHref: '/features/ai-voice'");
    });
  });

  describe('Demo Routes & Mock Data Resolution', () => {
    it('demo client detail screen can resolve all 15 demo clients', async () => {
      for (let i = 1; i <= 15; i++) {
        const id = `demo-client-${i}`;
        const client = await getClient(demoSupabase, DEMO_ACCOUNT_ID, id);
        expect(client, `Client ${id} should resolve`).toBeDefined();
        expect(client?.id).toBe(id);

        const statement = await getClientStatement(demoSupabase, DEMO_ACCOUNT_ID, id);
        expect(statement, `Statement for ${id} should resolve`).toBeDefined();
        expect(statement.jobs).toBeDefined();
      }
    });

    it('demo site subdomain evergreenlawn resolves DEMO_SITE_ROW with blog posts', async () => {
      const site = await getPublicSiteBySubdomain(demoSupabase, 'evergreenlawn');
      expect(site).toBeDefined();
      expect(site?.subdomain).toBe('evergreenlawn');
      expect(site?.company_name).toBe('Evergreen Lawn & Landscape');
      const content = site?.content as { blog?: { posts?: unknown[] } };
      expect(content?.blog?.posts?.length).toBeGreaterThan(0);
    });

    it('demo marketing route files exist', () => {
      expect(existsSync('src/app/demo/clients/[id]/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/marketing/links/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/marketing/blog/[id]/page.tsx')).toBe(true);
      expect(existsSync('src/app/demo/marketing/email-theme/page.tsx')).toBe(true);
    });
  });

  describe('User Manual & Support Navigation Integrity', () => {
    it('manual landing and article pages use public /help#contact-support', () => {
      const manualLanding = readFileSync('src/app/help/manual/page.tsx', 'utf8');
      expect(manualLanding).toContain('href="/help#contact-support"');
      expect(manualLanding).not.toContain('href="/dashboard/help"');

      const manualArticle = readFileSync('src/app/help/manual/[slug]/page.tsx', 'utf8');
      expect(manualArticle).toContain('href="/help#contact-support"');
      expect(manualArticle).not.toContain('href="/dashboard/help"');
    });

    it('user manual articles all define non-empty sections and valid routes', () => {
      expect(MANUAL_ARTICLES.length).toBeGreaterThanOrEqual(59);
      for (const article of MANUAL_ARTICLES) {
        expect(article.slug).toBeTruthy();
        expect(article.title).toBeTruthy();
        expect(article.sections.length).toBeGreaterThan(0);
        for (const route of article.routes) {
          expect(route.href.startsWith('/dashboard') || route.href.startsWith('/help')).toBe(true);
        }
      }
    });
  });

  describe('Apex-to-App Authentication Deep-Link Handoff', () => {
    it('middleware preserves next query parameter on dashboard redirect', () => {
      const middlewareSource = readFileSync('src/middleware.ts', 'utf8');
      expect(middlewareSource).toContain('/login?next=');
    });
  });

  describe('Sitemap & Social Card Coverage', () => {
    it('sitemap includes /help/manual and all manual articles', async () => {
      const entries = await sitemap();
      const urls = new Set(entries.map((e) => e.url));

      expect(urls.has('https://letsgetquoted.com/help/manual')).toBe(true);
      for (const article of MANUAL_ARTICLES) {
        expect(urls.has(`https://letsgetquoted.com/help/manual/${article.slug}`), `Missing manual article in sitemap: ${article.slug}`).toBe(true);
      }
    });

    it('all feature social card assets exist on disk in public/features/', () => {
      const requiredCards = [
        'og-website-builder.jpg',
        'og-ai-intake.jpg',
        'og-quick-stops.jpg',
        'og-client-portal.jpg',
        'og-back-office.jpg',
        'og-quotes.jpg',
        'og-scheduling.jpg',
        'og-crew.jpg',
        'og-payments.jpg',
        'og-recurring.jpg',
        'og-cash-flow.jpg',
        'og-reviews.jpg',
        'og-ai-ads.jpg',
        'og-ai-vision.jpg',
        'og-ai-voice.jpg',
        'og-dispatch.jpg',
        'og-text-to-job.jpg',
      ];

      for (const card of requiredCards) {
        expect(existsSync(`public/features/${card}`), `Missing card: public/features/${card}`).toBe(true);
      }
    });
  });
});
