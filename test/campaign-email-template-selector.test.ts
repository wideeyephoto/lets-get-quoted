import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMAIL_THEMES, normalizeEmailTheme } from '@/emails/brand';

const modalCss = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'marketing', 'campaigns', 'EmailTemplatePickerModal.module.css'),
  'utf8'
);

const campaignsScreenCode = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'marketing', 'campaigns', 'CampaignsScreen.tsx'),
  'utf8'
);

const campaignComposerCode = readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'marketing', 'CampaignComposer.tsx'),
  'utf8'
);

describe('EmailTemplatePickerModal CSS contrast & token safety', () => {
  it('does not use unsafe white surface fallbacks that break dark mode', () => {
    expect(modalCss).not.toContain('var(--surface, #fff)');
    expect(modalCss).not.toContain('var(--surface, #ffffff)');
    expect(modalCss).not.toContain('var(--surface)');
  });

  it('contains proper modal architecture styles', () => {
    expect(modalCss).toContain('.overlay');
    expect(modalCss).toContain('.modal');
    expect(modalCss).toContain('.cardSelected');
    expect(modalCss).toContain('.closeBtn');
    expect(modalCss).toContain('.saveBtn');
    expect(modalCss).toContain('color: var(--on-accent, #180c02);');
  });
});

describe('Email template picker integration on Campaigns page (?test=1)', () => {
  it('contains 5 selectable email themes defined in brand system', () => {
    expect(EMAIL_THEMES).toHaveLength(5);
    const themeIds = EMAIL_THEMES.map((t) => t.id);
    expect(themeIds).toEqual(['studio', 'letterhead', 'neighborly', 'blueprint', 'spotlight']);
    expect(normalizeEmailTheme('invalid')).toBe('studio');
    expect(normalizeEmailTheme('blueprint')).toBe('blueprint');
  });

  it('CampaignsScreen includes change email template button on test email flash banner', () => {
    expect(campaignsScreenCode).toContain("searchParams.test === '1'");
    expect(campaignsScreenCode).toContain('Change email template');
    expect(campaignsScreenCode).toContain('EmailTemplatePickerModal');
    expect(campaignsScreenCode).toContain('setIsEmailTemplateModalOpen(true)');
  });

  it('CampaignComposer includes template selector trigger button in campaign actions and preview head', () => {
    expect(campaignComposerCode).toContain('Template: <strong>');
    expect(campaignComposerCode).toContain('Change email design template');
    expect(campaignComposerCode).toContain('Change starter template');
    expect(campaignComposerCode).toContain('Browse templates');
    expect(campaignComposerCode).toContain('EmailTemplatePickerModal');
    expect(campaignComposerCode).toContain('CampaignStarterPickerModal');
  });
});
