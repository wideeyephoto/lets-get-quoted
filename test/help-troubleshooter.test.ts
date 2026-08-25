import { describe, expect, it } from 'vitest';
import {
  matchTroubleshooter,
  scoreIntent,
  normalizeQuery,
  TROUBLESHOOTER_INTENTS
} from '@/lib/help/troubleshooter';
import {
  KNOWLEDGE_BASE,
  LEGAL_TEMPLATES_DISCLAIMER,
  COMMON_FIX_ARTICLES
} from '@/components/help-center/help-center-data';
import { readFileSync } from 'fs';

describe('Pure Troubleshooter Matcher', () => {
  it('matches "my quote won\'t send" to quote-send', () => {
    const res = matchTroubleshooter("my quote won't send");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('quote-send');
    expect(res.intent?.articleId).toBe('art-quote-send-troubleshooting');
  });

  it('matches "customer texts are pending" to sms-delivery', () => {
    const res = matchTroubleshooter("customer texts are pending");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('sms-delivery');
    expect(res.intent?.articleId).toBe('art-sms-delivery-troubleshooting');
  });

  it('matches "where is my stripe deposit" to payout-missing', () => {
    const res = matchTroubleshooter("where is my stripe deposit");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('payout-missing');
    expect(res.intent?.articleId).toBe('art-stripe-payout-troubleshooting');
  });

  it('matches "godaddy website is offline" to domain-offline', () => {
    const res = matchTroubleshooter("godaddy website is offline");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('domain-offline');
    expect(res.intent?.articleId).toBe('art-domain-offline-troubleshooting');
  });

  it('matches "employee cannot log in" to team-access', () => {
    const res = matchTroubleshooter("employee cannot log in");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('team-access');
    expect(res.intent?.articleId).toBe('art-team-access-troubleshooting');
  });

  it('matches "job is not on calendar" to schedule-missing', () => {
    const res = matchTroubleshooter("job is not on calendar");
    expect(res.matched).toBe(true);
    expect(res.intent?.id).toBe('schedule-missing');
    expect(res.intent?.articleId).toBe('art-schedule-sync-troubleshooting');
  });

  it('unrelated query returns matched=false and provides 3 suggested articles', () => {
    const res = matchTroubleshooter("how to bake sourdough bread", COMMON_FIX_ARTICLES);
    expect(res.matched).toBe(false);
    expect(res.suggestedArticles).toBeDefined();
    expect(res.suggestedArticles?.length).toBe(3);
  });
});

describe('Help Center Data & Section Grounding', () => {
  const helpComponentSource = readFileSync('src/components/help-center/HelpCenter.tsx', 'utf8');

  it('contains id="ai-troubleshooter" in the hero', () => {
    expect(helpComponentSource).toContain('id="ai-troubleshooter"');
  });

  it('contains id="contact-support" in the support section', () => {
    expect(helpComponentSource).toContain('id="contact-support"');
  });

  it('derives total guide counts dynamically from data and does not have hardcoded "120+"', () => {
    const total = KNOWLEDGE_BASE.reduce((sum, cat) => sum + cat.articles.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(helpComponentSource).not.toContain('120+');
  });

  it('includes mandatory legal disclaimer for contractor templates', () => {
    expect(LEGAL_TEMPLATES_DISCLAIMER).toContain('These templates are starting points, not legal advice');
    expect(helpComponentSource).toContain('LEGAL_TEMPLATES_DISCLAIMER');
  });

  it('contains all 6 common fix articles', () => {
    expect(COMMON_FIX_ARTICLES.length).toBe(6);
    const ids = COMMON_FIX_ARTICLES.map(a => a.id);
    expect(ids).toContain('art-quote-send-troubleshooting');
    expect(ids).toContain('art-sms-delivery-troubleshooting');
    expect(ids).toContain('art-stripe-payout-troubleshooting');
    expect(ids).toContain('art-domain-offline-troubleshooting');
    expect(ids).toContain('art-team-access-troubleshooting');
    expect(ids).toContain('art-schedule-sync-troubleshooting');
  });
});
