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
  const helpComponentSource = readFileSync('src/components/help-center/HelpCenter.tsx', 'utf8').replace(/\r\n/g, '\n');

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

  it('does not render non-functional contractor templates', () => {
    expect(helpComponentSource).not.toContain('id="contractor-templates"');
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

  it('submits support tickets using submitContactMessage server action with full form state', () => {
    expect(helpComponentSource).toContain('submitContactMessage');
    expect(helpComponentSource).toContain('handleTicketSubmit');
    expect(helpComponentSource).toContain('id="ticket-name"');
    expect(helpComponentSource).toContain('htmlFor="ticket-name"');
    expect(helpComponentSource).toContain('id="ticket-email"');
    expect(helpComponentSource).toContain('htmlFor="ticket-email"');
    expect(helpComponentSource).toContain('id="ticket-subject"');
    expect(helpComponentSource).toContain('htmlFor="ticket-subject"');
    expect(helpComponentSource).toContain('id="ticket-message"');
    expect(helpComponentSource).toContain('htmlFor="ticket-message"');
    expect(helpComponentSource).toContain('name="company"'); // honeypot
  });

  it('verifies honest live system status from /api/health with ET timezone timestamp', () => {
    expect(helpComponentSource).toContain('/api/health');
    expect(helpComponentSource).toContain('fetchSystemStatus');
    expect(helpComponentSource).toContain('timeZone: \'America/New_York\'');
    expect(helpComponentSource).toContain('statusRefreshBtn');
  });

  it('uses semantic button elements with aria-haspopup for all guide and common fix cards', () => {
    expect(helpComponentSource).toContain('button\n              type="button"\n              key={art.id}\n              className={styles.commonFixCard}');
    expect(helpComponentSource).toContain('aria-haspopup="dialog"');
  });

  it('manages dialog focus trapping and accessibility attributes', () => {
    expect(helpComponentSource).toContain('role="dialog"');
    expect(helpComponentSource).toContain('aria-modal="true"');
    expect(helpComponentSource).toContain('aria-labelledby="article-modal-title"');
    expect(helpComponentSource).toContain('aria-labelledby="status-modal-title"');
    expect(helpComponentSource).toContain('aria-labelledby="drawer-title"');
  });

  it('ensures timezones use standard ET instead of EST across help data', () => {
    const helpDataSource = readFileSync('src/components/help-center/help-center-data.ts', 'utf8');
    expect(helpDataSource).not.toContain('EST');
    expect(helpDataSource).toContain('5:00 PM ET');
    expect(helpDataSource).toContain('8:00 PM ET');
  });

  it('ensures page metadata has single non-duplicated brand title', () => {
    const pageSource = readFileSync('src/app/help/page.tsx', 'utf8');
    expect(pageSource).toContain("title: 'Help Center & Troubleshooting'");
    expect(pageSource).not.toContain("title: 'Help Center & Troubleshooting | Let’s Get Quoted'");
  });
});
