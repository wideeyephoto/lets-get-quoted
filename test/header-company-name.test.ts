import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSiteContent, shouldHideHeaderCompanyName } from '@/lib/site-content';

describe('hideHeaderCompanyName in site-content', () => {
  it('defaults to false when unset so existing sites keep their company name in the header', () => {
    expect(getSiteContent({}).hideHeaderCompanyName).toBe(false);
    expect(getSiteContent(null).hideHeaderCompanyName).toBe(false);
    expect(getSiteContent(undefined).hideHeaderCompanyName).toBe(false);
    expect(shouldHideHeaderCompanyName({})).toBe(false);
    expect(shouldHideHeaderCompanyName(null)).toBe(false);
  });

  it('correctly parses hideHeaderCompanyName: true', () => {
    const parsed = getSiteContent({ hideHeaderCompanyName: true });
    expect(parsed.hideHeaderCompanyName).toBe(true);
    expect(shouldHideHeaderCompanyName({ hideHeaderCompanyName: true })).toBe(true);
  });

  it('correctly parses hideHeaderCompanyName: false', () => {
    const parsed = getSiteContent({ hideHeaderCompanyName: false });
    expect(parsed.hideHeaderCompanyName).toBe(false);
    expect(shouldHideHeaderCompanyName({ hideHeaderCompanyName: false })).toBe(false);
  });

  it('supports boolean aliases like hideHeaderBusinessName and hideHeaderName', () => {
    expect(getSiteContent({ hideHeaderBusinessName: true }).hideHeaderCompanyName).toBe(true);
    expect(getSiteContent({ hideHeaderName: true }).hideHeaderCompanyName).toBe(true);
    expect(shouldHideHeaderCompanyName({ hideHeaderBusinessName: true })).toBe(true);
    expect(shouldHideHeaderCompanyName({ hideHeaderName: true })).toBe(true);
  });
});

describe('Contractor site templates header company name visibility', () => {
  const root = process.cwd();
  const readTemplate = (name: string) => readFileSync(join(root, 'src', 'lib', 'templates', `${name}.tsx`), 'utf8');

  const templates = ['coat', 'fixit', 'forge', 'handy', 'modern', 'professional', 'reno', 'shine'];

  for (const templateName of templates) {
    it(`${templateName}.tsx conditionally renders the header company name based on hideHeaderCompanyName`, () => {
      const code = readTemplate(templateName);
      expect(code).toContain('!content.hideHeaderCompanyName');
      expect(code).toContain('WordmarkName');
      expect(code).toContain("data-header-name={content.hideHeaderCompanyName ? 'hidden' : undefined}");
      expect(code).toContain('aria-label={`${site.company_name} home`}');
    });
  }

  it('professional.tsx preserves license display even when company name is hidden', () => {
    const code = readTemplate('professional');
    expect(code).toContain('(!content.hideHeaderCompanyName || site.license)');
    expect(code).toContain('site.license ? <small data-edit="bizLicense">{site.license}</small> : null');
  });

  it('SiteBlogArticle.tsx respects hideHeaderCompanyName in blog chrome header', () => {
    const code = readTemplate('SiteBlogArticle');
    expect(code).toContain('!content.hideHeaderCompanyName && <strong>{site.company_name}</strong>');
    expect(code).toContain('aria-label={`${site.company_name} home`}');
  });
});

describe('WebsiteBuilder UI controls for header company name visibility', () => {
  const root = process.cwd();
  const builderCode = readFileSync(join(root, 'src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx'), 'utf8');

  it('provides the toggle in Typography & buttons section', () => {
    expect(builderCode).toContain('checked={!siteContent.hideHeaderCompanyName}');
    expect(builderCode).toContain('updateSiteContent({ hideHeaderCompanyName: !event.target.checked })');
    expect(builderCode).toContain('Show company name in header');
    expect(builderCode).toContain('Text company name is currently hidden in the header');
  });

  it('provides the toggle in Logo & brand icon section', () => {
    expect(builderCode).toContain('Show text company name in header');
  });

  it('provides the toggle in Page tab Header section', () => {
    expect(builderCode).toContain('pinnedHeaderReorder()');
    expect(builderCode).toContain('Display your text business name next to your logo or icon');
  });
});
