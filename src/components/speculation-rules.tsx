import React from 'react';
import { cspNonce } from '@/lib/csp-nonce';

/**
 * Speculative Loading rules for modern browsers.
 *
 * Automatically prefetches marketing and public content pages when the user
 * hovers or focuses on navigation links with 'moderate' eagerness.
 *
 * Single-page app mutations, authenticated dashboard actions, and API endpoints
 * are strictly excluded from speculation.
 */
const SPECULATION_RULES = {
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: '/api/*' } },
          { not: { href_matches: '/auth/*' } },
          { not: { href_matches: '/dashboard/*' } },
          { not: { href_matches: '/admin/*' } },
          { not: { href_matches: '/site/*' } },
          { not: { href_matches: '/site-domain/*' } },
          { not: { href_matches: '/*\\?*(^|&)draft=*' } },
          { not: { selector_matches: '[rel~=nofollow]' } },
          { not: { selector_matches: '.no-speculate' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
};

export default function SpeculationRules() {
  const nonce = cspNonce();
  return (
    <script
      type="speculationrules"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(SPECULATION_RULES) }}
    />
  );
}
