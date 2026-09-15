/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';
import { axe } from 'vitest-axe';
import { renderToString } from 'react-dom/server';
import React from 'react';
import QuoteRequestForm from '@/components/quote-request-form';
import HeroQuickForm from '@/lib/templates/HeroQuickForm';

expect.extend(matchers);

describe('Quote Form Accessibility', () => {
  const mockSite = {
    id: 'test-site',
    content: {
      quoteForm: { enabled: true }
    },
  };

  it('QuoteRequestForm has no axe violations', async () => {
    const html = renderToString(<main><QuoteRequestForm site={{...mockSite, content: { quoteForm: { enabled: true } }} as any} /></main>);
    const results = await axe(html);
    // @ts-ignore
    expect(results).toHaveNoViolations();
  });

  it('HeroQuickForm has no axe violations', async () => {
    const html = renderToString(<main><HeroQuickForm site={mockSite as any} /></main>);
    const results = await axe(html);
    // @ts-ignore
    expect(results).toHaveNoViolations();
  });
});
