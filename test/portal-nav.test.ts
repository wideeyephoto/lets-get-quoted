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
  it('is ON for a site that has never chosen', () => {
    // Reversed deliberately. It shipped off so a feature could not change
    // somebody's live homepage without them — but the portal itself was ALSO
    // off, and two defaults-off in series is not caution, it is a feature that
    // never appears. See the note on SiteClientPortalContent.
    expect(getPortalNavLink({})).not.toBeNull();
    expect(getPortalNavLink(null)).not.toBeNull();
    expect(getPortalNavLink({ clientPortal: {} })).not.toBeNull();
  });

  it('honours an explicit false forever after', () => {
    // The half that makes the default safe: a contractor who takes the link off
    // must not have it put back by the next builder save.
    expect(getPortalNavLink({ clientPortal: { navEnabled: false } })).toBeNull();
    const stored = mergeSiteContent({}, { clientPortal: { navEnabled: false, navLabel: '' } });
    expect(getPortalNavLink(stored)).toBeNull();
    // An unrelated edit elsewhere in the builder must not switch the portal nav
    // back on. `headline` was used here and is not a top-level content key —
    // it lives inside a section — so the merge was being handed a field that
    // does not exist. phonePublic is a real top-level toggle and makes the same
    // point: something else changed, this stayed off.
    expect(getPortalNavLink(mergeSiteContent(stored, { phonePublic: true }))).toBeNull();
  });

  it('only stays on for a real true, never a truthy value', () => {
    // A hand-edited blob must not be able to force it; anything present that
    // isn't `true` reads as off.
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
    // Unreadable is treated as "never chosen", not as "switched off" — the same
    // verdict an empty object gets, so a corrupt blob cannot silently strip a
    // link the contractor never touched.
    expect(getPortalNavLink({ clientPortal: 'nope' })?.label).toBe(DEFAULT_PORTAL_NAV_LABEL);
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
