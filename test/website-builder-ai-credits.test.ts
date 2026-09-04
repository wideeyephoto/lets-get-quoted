import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const PAGE_CODE = read('src', 'app', 'dashboard', 'sites', 'page.tsx');
const ACTIONS_CODE = read('src', 'app', 'dashboard', 'sites', 'actions.ts');
const BUILDER_CODE = read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx');
const MODAL_CODE = read('src', 'app', 'dashboard', 'sites', 'AiLogoCreatorModal.tsx');
const CSS_CODE = read('src', 'app', 'dashboard', 'sites', 'SiteEditor.module.css');

describe('Website Builder AI Credits Display', () => {
  it('loads AI credit balances from Supabase in dashboard/sites/page.tsx', () => {
    expect(PAGE_CODE).toContain('workspace_usage_credit_balances');
    expect(PAGE_CODE).toContain('ai_intake_threads');
    expect(PAGE_CODE).toContain('ai_writing_drafts');
    expect(PAGE_CODE).toContain('aiCredits={aiCredits}');
  });

  it('provides getAvailableAiCreditsAction in actions.ts', () => {
    expect(ACTIONS_CODE).toContain('export async function getAvailableAiCreditsAction(): Promise<number | null>');
    expect(ACTIONS_CODE).toContain('ai_intake_threads');
    expect(ACTIONS_CODE).toContain('ai_writing_drafts');
  });

  it('handles 401 image generation permission and missing scope errors in actions.ts', () => {
    expect(ACTIONS_CODE).toContain('api.model.images.request');
    expect(ACTIONS_CODE).toContain('response.status === 401');
  });

  it('displays AI credits at all generate locations in WebsiteBuilder.tsx', () => {
    // Helper & imports
    expect(BUILDER_CODE).toContain('getAvailableAiCreditsAction');
    expect(BUILDER_CODE).toContain('function AiCreditIndicator');
    expect(BUILDER_CODE).toContain('availableAiCredits');

    // Header credit badge
    expect(BUILDER_CODE).toContain('headerCreditBadge');

    // Full site generation
    expect(BUILDER_CODE).toContain('handleGenerateText');
    expect(BUILDER_CODE).toContain('AiCreditIndicator credits={availableAiCredits} cost={1}');

    // AI Logo Studio launcher
    expect(BUILDER_CODE).toContain('setShowLogoStudio(true)');
    expect(BUILDER_CODE).toContain('AiCreditIndicator credits={availableAiCredits}');

    // Stock photos regeneration
    expect(BUILDER_CODE).toContain('handleRegenerateStockImages');

    // SEO copy regeneration
    expect(BUILDER_CODE).toContain('handleRegenerateSeo');

    // Passes aiCredits and onRefreshCredits to modal
    expect(BUILDER_CODE).toContain('aiCredits={availableAiCredits}');
    expect(BUILDER_CODE).toContain('onRefreshCredits={refreshAiCredits}');
  });

  it('displays AI credits at all generate locations in AiLogoCreatorModal.tsx', () => {
    // Header
    expect(MODAL_CODE).toContain('AI Logo &amp; Brand Studio');
    expect(MODAL_CODE).toContain('aiCredits.toLocaleString');

    // Tagline / Slogans generator
    expect(MODAL_CODE).toContain('handleTriggerAiSlogans');

    // AI Logo generator
    expect(MODAL_CODE).toContain('handleGenerateAiLogo');
    expect(MODAL_CODE).toContain('AI {aiCredits === 1 ? \'credit\' : \'credits\'} available');
  });

  it('includes complete CSS classes for AI credit indicators and top-up prompts', () => {
    expect(CSS_CODE).toContain('.aiCreditChip');
    expect(CSS_CODE).toContain('.aiCreditChipLow');
    expect(CSS_CODE).toContain('.aiCreditChipTopUp');
    expect(CSS_CODE).toContain('.headerCreditBadge');
    expect(CSS_CODE).toContain('.headerCreditBadgeLow');
    expect(CSS_CODE).toContain('.aiButtonGroup');
  });
});
