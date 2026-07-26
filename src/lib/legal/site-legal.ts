import type { Site } from '@/lib/sites';
import { getSiteContent } from '@/lib/site-content';
import { generatePrivacyPolicy, generateTermsOfService, resolveLegalDoc, type LegalInput } from './legal-copy';

// Thin Site adapter over the pure legal-copy generator (mirrors lib/seo/site-seo).
export type LegalKind = 'privacy' | 'terms';

function legalInput(site: Site): LegalInput {
  return {
    companyName: site.company_name || '',
    location: site.service_area || '',
    // Site is passed through withPublicContact on public routes, so phone is
    // already null when the owner chose to hide it.
    phone: site.phone || '',
    updated: getSiteContent(site.content).legal.updated,
  };
}

export type ResolvedLegal = { enabled: boolean; title: string; body: string };

export function resolveSiteLegal(site: Site, kind: LegalKind): ResolvedLegal {
  const legal = getSiteContent(site.content).legal;
  const input = legalInput(site);
  if (kind === 'privacy') {
    return {
      enabled: legal.privacyEnabled,
      title: 'Privacy Policy',
      body: resolveLegalDoc(legal.privacyBody, generatePrivacyPolicy(input)),
    };
  }
  return {
    enabled: legal.termsEnabled,
    title: 'Terms of Service',
    body: resolveLegalDoc(legal.termsBody, generateTermsOfService(input)),
  };
}

// Whether the footer should show each legal link (used by SiteFooter).
export function siteLegalLinks(site: Site): { privacy: boolean; terms: boolean } {
  const legal = getSiteContent(site.content).legal;
  return { privacy: legal.privacyEnabled, terms: legal.termsEnabled };
}
