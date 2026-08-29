import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import {
  getSiteContent,
  getPublishedQuickStop,
  REORDERABLE_SECTIONS,
  DEFAULT_QUICK_STOP_EYEBROW,
  DEFAULT_QUICK_STOP_TITLE,
  DEFAULT_QUICK_STOP_INTRO,
  DEFAULT_QUICK_STOP_BADGE,
  DEFAULT_QUICK_STOP_FEE_NOTE,
  DEFAULT_QUICK_STOP_CTA,
  DEFAULT_QUICK_STOP_ITEMS,
  type SiteQuickStopContent,
} from '@/lib/site-content';
import SiteQuickStopSection from '@/lib/templates/SiteQuickStopSection';

describe('Quick Stop Website Builder Section Schema', () => {
  it('provides sensible defaults when quickStop is absent from content', () => {
    const content = getSiteContent({});
    expect(content.quickStop).toBeDefined();
    expect(content.quickStop.enabled).toBe(false);
    expect(content.quickStop.style).toBe('cards');
    expect(content.quickStop.eyebrow).toBe(DEFAULT_QUICK_STOP_EYEBROW);
    expect(content.quickStop.title).toBe(DEFAULT_QUICK_STOP_TITLE);
    expect(content.quickStop.intro).toBe(DEFAULT_QUICK_STOP_INTRO);
    expect(content.quickStop.badgeText).toBe(DEFAULT_QUICK_STOP_BADGE);
    expect(content.quickStop.feeNote).toBe(DEFAULT_QUICK_STOP_FEE_NOTE);
    expect(content.quickStop.ctaLabel).toBe(DEFAULT_QUICK_STOP_CTA);
    expect(content.quickStop.ctaHref).toBe('#contact');
    expect(content.quickStop.items.length).toBe(DEFAULT_QUICK_STOP_ITEMS.length);
  });

  it('normalizes invalid styles to cards', () => {
    const content = getSiteContent({
      quickStop: {
        enabled: true,
        style: 'invalid-style-name',
      },
    });
    expect(content.quickStop.style).toBe('cards');
  });

  it('supports all 4 visual presentation styles', () => {
    const styles = ['cards', 'banner', 'timeline', 'comparison'] as const;
    for (const st of styles) {
      const content = getSiteContent({
        quickStop: {
          enabled: true,
          style: st,
        },
      });
      expect(content.quickStop.style).toBe(st);
    }
  });

  it('correctly parses customized items and badges', () => {
    const customItems = [
      { id: 'custom-1', icon: '🔧', title: 'Quick Leak Stop', description: 'Immediate valve shutoff', badge: '15 Min' },
      { id: 'custom-2', icon: '⚡', title: 'Power Reset', description: 'Breaker diagnostic', badge: 'Urgent' },
    ];
    const content = getSiteContent({
      quickStop: {
        enabled: true,
        style: 'banner',
        title: 'Rapid Response Route Gaps',
        items: customItems,
      },
    });

    expect(content.quickStop.items.length).toBe(2);
    expect(content.quickStop.items[0].title).toBe('Quick Leak Stop');
    expect(content.quickStop.items[0].badge).toBe('15 Min');
    expect(content.quickStop.items[1].icon).toBe('⚡');
  });

  it('enforces getPublishedQuickStop publishing gate', () => {
    // Disabled section returns null
    expect(getPublishedQuickStop({ quickStop: { enabled: false, title: 'Valid Title' } })).toBeNull();

    // Enabled with empty title returns null
    expect(getPublishedQuickStop({ quickStop: { enabled: true, title: '   ' } })).toBeNull();

    // Enabled with valid title returns published content
    const published = getPublishedQuickStop({
      quickStop: {
        enabled: true,
        style: 'timeline',
        title: 'Rapid Visit Service',
      },
    });
    expect(published).not.toBeNull();
    expect(published?.title).toBe('Rapid Visit Service');
    expect(published?.style).toBe('timeline');
  });

  it('registers quickStop in REORDERABLE_SECTIONS', () => {
    const found = REORDERABLE_SECTIONS.find((s) => s.key === 'quickStop');
    expect(found).toBeDefined();
    expect(found?.label).toBe('Quick Stop priority visits');
  });
});

describe('SiteQuickStopSection Component Rendering across 4 Styles', () => {
  const baseContent: SiteQuickStopContent = {
    enabled: true,
    style: 'cards',
    eyebrow: '⚡ Same-Day Route Gaps',
    title: 'Need a Quick Fix?',
    intro: 'We squeeze small jobs into our route.',
    badgeText: '⚡ 15–45 min priority visits',
    feeNote: 'Flat priority fee upfront',
    ctaLabel: 'Book Quick Stop Now',
    ctaHref: '#contact',
    items: [
      { id: '1', icon: '⚡', title: 'Small Repairs', description: 'Fast diagnostics', badge: 'Fast' },
      { id: '2', icon: '🗺️', title: 'Route Squeeze', description: 'Between existing jobs', badge: 'Route' },
    ],
  };

  it('renders cards style with feature cards and action button', () => {
    const html = renderToString(React.createElement(SiteQuickStopSection, { ...baseContent, style: 'cards' }));
    expect(html).toContain('data-quick-stop-style="cards"');
    expect(html).toContain('Need a Quick Fix?');
    expect(html).toContain('Small Repairs');
    expect(html).toContain('Route Squeeze');
    expect(html).toContain('Book Quick Stop Now');
    expect(html).toContain('Flat priority fee upfront');
  });

  it('renders banner style with high-impact ribbon layout and check bullets', () => {
    const html = renderToString(React.createElement(SiteQuickStopSection, { ...baseContent, style: 'banner' }));
    expect(html).toContain('data-quick-stop-style="banner"');
    expect(html).toContain('Need a Quick Fix?');
    expect(html).toContain('Small Repairs');
    expect(html).toContain('Route Squeeze');
    expect(html).toContain('Book Quick Stop Now');
  });

  it('renders timeline style with ordered steps and number markers', () => {
    const html = renderToString(React.createElement(SiteQuickStopSection, { ...baseContent, style: 'timeline' }));
    expect(html).toContain('data-quick-stop-style="timeline"');
    expect(html).toContain('Need a Quick Fix?');
    expect(html).toContain('Small Repairs');
    expect(html).toContain('Route Squeeze');
    expect(html).toContain('1');
    expect(html).toContain('2');
  });

  it('renders comparison style with dual card comparison columns', () => {
    const html = renderToString(React.createElement(SiteQuickStopSection, { ...baseContent, style: 'comparison' }));
    expect(html).toContain('data-quick-stop-style="comparison"');
    expect(html).toContain('Quick Stop Priority Visit');
    expect(html).toContain('Full Project Booking');
    expect(html).toContain('Small repairs, diagnostics');
    expect(html).toContain('Full repipes, system replacements');
    expect(html).toContain('Book Quick Stop Now');
    expect(html).toContain('Request Full Estimate');
  });
});
