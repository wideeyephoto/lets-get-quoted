import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PORTAL_NAV_LABEL,
  PORTAL_NAV_LABEL_MAX,
  PORTAL_SITE_PATH,
  getPortalNavLink,
  getSiteContent,
  mergeSiteContent,
  portalLinkRemoved,
} from '@/lib/site-content';

describe('the customer-login link on a contractor site', () => {
  it('is OFF for every existing site', () => {
    // Putting a link on somebody's live homepage because a feature shipped is a
    // change to their website they did not make.
    expect(getPortalNavLink({})).toBeNull();
    expect(getPortalNavLink(null)).toBeNull();
    expect(getPortalNavLink({ clientPortal: {} })).toBeNull();
  });

  it('only turns on for a real true, not any truthy value', () => {
    expect(getPortalNavLink({ clientPortal: { navEnabled: 'yes' } })).toBeNull();
    expect(getPortalNavLink({ clientPortal: { navEnabled: 1 } })).toBeNull();
    expect(getPortalNavLink({ clientPortal: { navEnabled: true } })).not.toBeNull();
  });

  it('points at the contractor’s OWN host, never off-site', () => {
    const link = getPortalNavLink({ clientPortal: { navEnabled: true } });
    // A "Client Login" that jumps to another company's domain to ask for an
    // email address is the exact shape of a phishing hop.
    expect(link?.href).toBe(PORTAL_SITE_PATH);
    expect(link?.href.startsWith('/')).toBe(true);
    expect(link?.href).not.toMatch(/^https?:/);
  });

  it('falls back to Client Login rather than rendering a blank menu item', () => {
    expect(DEFAULT_PORTAL_NAV_LABEL).toBe('Client Login');
    expect(getPortalNavLink({ clientPortal: { navEnabled: true } })?.label).toBe('Client Login');
    expect(getPortalNavLink({ clientPortal: { navEnabled: true, navLabel: '   ' } })?.label).toBe('Client Login');
  });

  it('keeps a renamed label, capped so it cannot break the header', () => {
    expect(getPortalNavLink({ clientPortal: { navEnabled: true, navLabel: 'Client Dashboard' } })?.label)
      .toBe('Client Dashboard');
    expect(getSiteContent({ clientPortal: { navLabel: 'x'.repeat(80) } }).clientPortal.navLabel)
      .toHaveLength(PORTAL_NAV_LABEL_MAX);
  });

  it('survives a garbage blob', () => {
    expect(getPortalNavLink({ clientPortal: 'nope' })).toBeNull();
    expect(getSiteContent({ clientPortal: [] }).clientPortal.navLabel).toBe('');
  });

  it('survives a builder save', () => {
    // The parser rebuilds content field by field, so a key it doesn't know is
    // dropped silently the next time the website builder saves — which is how
    // the link would vanish from a live site with nobody touching it.
    const stored = mergeSiteContent({}, { clientPortal: { navEnabled: true, navLabel: 'Customer Portal' } });
    const roundTripped = JSON.parse(JSON.stringify(stored)) as Record<string, unknown>;
    expect(getSiteContent(roundTripped).clientPortal).toEqual({ navEnabled: true, navLabel: 'Customer Portal' });
    expect(getPortalNavLink(roundTripped)?.label).toBe('Customer Portal');
  });

  it('keeps the label when the link is switched off, so re-adding keeps their wording', () => {
    const stored = mergeSiteContent({}, { clientPortal: { navEnabled: false, navLabel: 'Customer Portal' } });
    expect(getSiteContent(stored).clientPortal.navLabel).toBe('Customer Portal');
    expect(getPortalNavLink(stored)).toBeNull();
  });
});

describe('switching the portal itself off', () => {
  it('takes the link off the website', () => {
    // Otherwise their own header advertises a page that tells their customers
    // the lookup isn't switched on.
    const live = mergeSiteContent({}, { clientPortal: { navEnabled: true, navLabel: 'Client Dashboard' } });
    expect(getPortalNavLink(live)).not.toBeNull();
    expect(getPortalNavLink(portalLinkRemoved(live))).toBeNull();
  });

  it('keeps the wording for when they switch it back on', () => {
    const live = mergeSiteContent({}, { clientPortal: { navEnabled: true, navLabel: 'Client Dashboard' } });
    expect(getSiteContent(portalLinkRemoved(live)).clientPortal.navLabel).toBe('Client Dashboard');
  });

  it('touches nothing else in the site content', () => {
    const live = mergeSiteContent(
      { headline: 'Original', faqs: { enabled: true, items: [{ question: 'Q', answer: 'A' }] } },
      { clientPortal: { navEnabled: true, navLabel: 'Client Dashboard' } },
    );
    const after = portalLinkRemoved(live);
    // A settings toggle must not be able to clobber what the website builder holds.
    expect(after.headline).toEqual(live.headline);
    expect(after.faqs).toEqual(live.faqs);
  });

  it('is a no-op on a site that never had the link', () => {
    expect(getPortalNavLink(portalLinkRemoved({}))).toBeNull();
    expect(getPortalNavLink(portalLinkRemoved(null))).toBeNull();
  });
});
