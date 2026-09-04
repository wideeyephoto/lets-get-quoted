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
const PROMPT_CODE = read('src', 'lib', 'logo-image-prompt.ts');

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

  it('renders animated studio loading state with exact copy and phase milestones in AiLogoCreatorModal.tsx', () => {
    // Exact user-specified copy
    expect(MODAL_CODE).toContain('Your AI art director is building a fresh identity');
    expect(MODAL_CODE).toContain(
      'Concept, silhouette, typography, and transparent production artwork are being resolved together. This can take up to two minutes.'
    );

    // Studio animations & keyframes
    expect(MODAL_CODE).toContain('aiLogoPulseGlow');
    expect(MODAL_CODE).toContain('aiLogoSpinSlow');
    expect(MODAL_CODE).toContain('aiLogoSparkPulse');
    expect(MODAL_CODE).toContain('aiLogoShimmerBar');

    // Live elapsed timer & phase tracking
    expect(MODAL_CODE).toContain('formatElapsed');
    expect(MODAL_CODE).toContain('CREATIVE_PHASES');
    expect(MODAL_CODE).toContain('AiArtDirectorLoadingState');

    // Milestones
    expect(MODAL_CODE).toContain('Bespoke Concept');
    expect(MODAL_CODE).toContain('Vector Silhouette');
    expect(MODAL_CODE).toContain('Brand Typography');
    expect(MODAL_CODE).toContain('Transparent PNG');
  });

  it('includes complete CSS classes for AI credit indicators and top-up prompts', () => {
    expect(CSS_CODE).toContain('.aiCreditChip');
    expect(CSS_CODE).toContain('.aiCreditChipLow');
    expect(CSS_CODE).toContain('.aiCreditChipTopUp');
    expect(CSS_CODE).toContain('.headerCreditBadge');
    expect(CSS_CODE).toContain('.headerCreditBadgeLow');
    expect(CSS_CODE).toContain('.aiButtonGroup');
  });

  it('preserves AI logos and pending generation across general site updates', async () => {
    const { preserveAiLogos } = await import('../src/lib/site-content');
    const stored = {
      ai_logos: [{ id: 'logo-1', url: 'https://example.com/logo-1.png', prompt: 'test' }],
      pending_ai_logo: { id: 'pending-1', startedAt: '2026-09-04T12:00:00Z', status: 'pending' },
    };
    const incomingWithoutLogos = {
      trade: 'plumber',
    };
    const merged = preserveAiLogos(stored, incomingWithoutLogos);
    expect(merged.ai_logos).toEqual(stored.ai_logos);
    expect(merged.pending_ai_logo).toEqual(stored.pending_ai_logo);
  });

  it('supports AI logo retrieval, auto-save, and deletion in actions.ts', () => {
    expect(ACTIONS_CODE).toContain('export async function getAiLogosAction()');
    expect(ACTIONS_CODE).toContain('export async function deleteAiLogoAction(');
    expect(ACTIONS_CODE).toContain('preserveAiLogos');
    expect(ACTIONS_CODE).toContain('pending_ai_logo');
    expect(ACTIONS_CODE).toContain('deleteSiteImage');
  });

  it('supports AI logo deletion and background generation in AiLogoCreatorModal.tsx', () => {
    expect(MODAL_CODE).toContain('handleDeleteAiLogo');
    expect(MODAL_CODE).toContain('🗑 Delete');
    expect(MODAL_CODE).toContain('savedLogos');
    expect(MODAL_CODE).toContain('pendingGeneration');
    expect(MODAL_CODE).toContain('getAiLogosAction');
  });

  it('supports background AI logo generation and notifications in WebsiteBuilder.tsx', () => {
    expect(BUILDER_CODE).toContain('pendingAiLogo');
    expect(BUILDER_CODE).toContain('getAiLogosAction');
    expect(BUILDER_CODE).toContain('AI Art Director is building your logo');
    expect(BUILDER_CODE).toContain('AI Art Director is generating your logo in the background');
    expect(BUILDER_CODE).toContain('savedLogos={aiLogos}');
    expect(BUILDER_CODE).toContain('pendingGeneration={pendingAiLogo}');
  });

  it('allocates sufficient timeout headroom for AI image generation without premature 30s abort', () => {
    const aiModelCode = read('src', 'lib', 'ai-model-call.ts');
    const pageCode = read('src', 'app', 'dashboard', 'sites', 'page.tsx');
    const actionsCode = read('src', 'app', 'dashboard', 'sites', 'actions.ts');

    // Default image model timeout must be at least 180,000ms (3 mins) instead of the previous 30,000ms
    expect(aiModelCode).toContain("endpoint === 'images/generations' ? 180000 : 45000");
    expect(aiModelCode).toContain('timeoutMs?: number');

    // Actions pass extended timeout
    expect(actionsCode).toContain('timeoutMs: 180000');

    // Page exports maxDuration = 180
    expect(pageCode).toContain('export const maxDuration = 180');
  });

  it('supports AI logo prompt revision instructions and parent prompt grounding', async () => {
    const { buildAiLogoPrompt } = await import('../src/lib/logo-image-prompt');
    expect(PROMPT_CODE).toContain('revisionInstructions?: string | null');
    expect(PROMPT_CODE).toContain('parentPrompt?: string | null');
    expect(PROMPT_CODE).toContain('CREATIVE REVISION INSTRUCTIONS:');
    expect(PROMPT_CODE).toContain('Reference prior design concept:');

    const prompt = buildAiLogoPrompt({
      businessName: 'BrokePipes Plumbers',
      trade: 'Plumbing',
      direction: 'bold_symbol',
      parentPrompt: 'Vintage pipe wrench with water drop',
      revisionInstructions: 'Make the typography bolder and switch secondary color to vivid orange',
    });

    expect(prompt).toContain('Reference prior design concept: "Vintage pipe wrench with water drop"');
    expect(prompt).toContain('CREATIVE REVISION INSTRUCTIONS: Maintain the core design silhouette, metaphor, and visual DNA of the referenced concept');
    expect(prompt).toContain('Make the typography bolder and switch secondary color to vivid orange');
  });

  it('supports saving canvas-adjusted logos in actions.ts', () => {
    expect(ACTIONS_CODE).toContain('export async function saveAdjustedAiLogoAction(');
    expect(ACTIONS_CODE).toContain('parentLogoId?: string | null');
    expect(ACTIONS_CODE).toContain('revisionInstructions?: string | null');
    expect(ACTIONS_CODE).toContain('base64Png: string');
  });

  it('provides Tweak with AI and Quick Adjust buttons and overlays in AiLogoCreatorModal.tsx', () => {
    expect(MODAL_CODE).toContain('🪄 Tweak with AI');
    expect(MODAL_CODE).toContain('🎨 Quick Adjust');
    expect(MODAL_CODE).toContain('handleGenerateRemixLogo');
    expect(MODAL_CODE).toContain('handleSaveAdjustedCanvasLogo');
    expect(MODAL_CODE).toContain('handleDownloadAdjustedCanvas');
    expect(MODAL_CODE).toContain('⚪ White Vinyl Decal');
    expect(MODAL_CODE).toContain('⚫ Black Silhouette');
    expect(MODAL_CODE).toContain('Quick Adjust & Decal Studio');
    expect(MODAL_CODE).toContain('Tweak Logo with AI');
  });

  it('hides emblem inspo unless using editable vectors, and restricts editable vectors to when AI is offline or broke', () => {
    // Emblem inspo only when activeTab === 'concepts'
    expect(MODAL_CODE).toContain("activeTab === 'concepts' &&");
    expect(MODAL_CODE).toContain('Trade Emblem / Icon');

    // Editable vectors visibility condition
    expect(MODAL_CODE).toContain('isAiOfflineOrBroken');
    expect(MODAL_CODE).toContain('showEditableVectors');
    expect(MODAL_CODE).toContain('Offline Fallback');
    expect(MODAL_CODE).toContain('AI generator is offline. You can use Editable Vectors');
  });

  it('wires up Tagline / Slogan generator with resilient error handling and OpenAI Responses API compliance', () => {
    // Modal wires up AI slogans button and tagline input
    expect(MODAL_CODE).toContain('Tagline / Slogan');
    expect(MODAL_CODE).toContain('handleTriggerAiSlogans');
    expect(MODAL_CODE).toContain('taglineError');
    expect(MODAL_CODE).toContain('suggestedTaglines');
    expect(MODAL_CODE).toContain('Pick an AI Slogan:');

    // Actions implementation uses buildTaglinePromptInput and getFallbackTaglines
    const ACTIONS_CODE = readFileSync(
      join(__dirname, '../src/app/dashboard/sites/actions.ts'),
      'utf-8',
    );
    expect(ACTIONS_CODE).toContain('generateLogoTaglinesAction');
    expect(ACTIONS_CODE).toContain('buildTaglinePromptInput');
    expect(ACTIONS_CODE).toContain('getFallbackTaglines');
  });
});
