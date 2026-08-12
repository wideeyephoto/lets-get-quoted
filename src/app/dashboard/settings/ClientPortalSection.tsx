'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { DEFAULT_PORTAL_NAV_LABEL, PORTAL_NAV_LABEL_MAX } from '@/lib/site-content';
import { updatePortalLinkAction } from './actions';

/**
 * The past-customer portal, from the contractor's side.
 *
 * The master switch is the one in the card's own summary row (the Automations
 * tab's switch), so it isn't repeated here. What's left is the two things they
 * can actually do with it: hand out the address, and put a link to it on their
 * website.
 *
 * The preview is a real reproduction of the customer's page rather than a
 * description of it. "Customers enter their details and get a link" is a
 * sentence somebody has to imagine; this is the thing itself.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  enabled: boolean;
  businessName: string;
  /** The customer-facing address, on the contractor's own host. Null with no published site. */
  portalUrl: string | null;
  hasSite: boolean;
  published: boolean;
  linkOn: boolean;
  linkLabel: string;
};

export default function ClientPortalSection({
  enabled,
  businessName,
  portalUrl,
  hasSite,
  published,
  linkOn,
  linkLabel,
}: Props) {
  const [on, setOn] = useState(linkOn);
  const [label, setLabel] = useState(linkLabel);
  const [save, setSave] = useState<SaveState>('idle');
  const [copied, setCopied] = useState(false);
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server currently holds, so a debounced rename knows whether it has
  // anything to send and a failed one knows what to roll back to.
  const savedLabel = useRef(linkLabel);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (labelTimer.current) clearTimeout(labelTimer.current);
  }, []);

  // The server is the source of truth once a revalidation lands.
  useEffect(() => { setOn(linkOn); }, [linkOn]);

  function flashSaved() {
    setSave('saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSave('idle'), 2400);
  }

  function persist(next: { navEnabled: boolean; navLabel: string }, rollback: () => void) {
    setSave('saving');
    startSaving(async () => {
      try {
        await updatePortalLinkAction(next);
        savedLabel.current = next.navLabel;
        flashSaved();
      } catch {
        // Put it back. A control left showing the new state after a failed save
        // tells a contractor their website says something it doesn't.
        rollback();
        setSave('error');
      }
    });
  }

  function toggleLink() {
    const next = !on;
    const previous = on;
    setOn(next);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    persist({ navEnabled: next, navLabel: label }, () => setOn(previous));
  }

  function renameLink(value: string) {
    const trimmed = value.slice(0, PORTAL_NAV_LABEL_MAX);
    setLabel(trimmed);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => {
      if (trimmed.trim() === savedLabel.current.trim()) return;
      const previous = savedLabel.current;
      persist({ navEnabled: on, navLabel: trimmed }, () => setLabel(previous));
    }, 800);
  }

  async function copyLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // A clipboard the browser won't hand over isn't worth an error state —
      // the address is right there to select.
    }
  }

  const shownLabel = label.trim() || DEFAULT_PORTAL_NAV_LABEL;

  return (
    <div className={`portal-card${enabled ? '' : ' is-paused'}`}>
      <p className="portal-state">
        {enabled
          ? 'Live — customers can look up their own jobs.'
          : 'Off — the lookup page tells anyone who reaches it to call you instead.'}
      </p>

      <p className="portal-blurb">
        Customers enter their email address or mobile number and receive a secure link to view their previous jobs — no
        password required. Whichever they use is where the link is sent, so the ones you only have a number for can get
        in too.
      </p>
      <p className="portal-callout">
        Their work history, what it cost, and any warranty still running — what it covers, and when it runs out.
      </p>

      <div className="portal-grid">
        <div className="portal-settings">
          <p className="eyebrow">Your customer portal</p>

          {portalUrl ? (
            <>
              <p className="portal-url">{portalUrl}</p>
              <div className="portal-actions">
                <button type="button" className="portal-btn" onClick={copyLink}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
                <a className="portal-btn" href={portalUrl} target="_blank" rel="noreferrer">
                  Open portal ↗
                </a>
              </div>
            </>
          ) : (
            <p className="portal-note">
              {hasSite && !published
                ? 'Publish your website and this address goes live with it.'
                : 'Build your website first — the portal lives on your own address.'}
            </p>
          )}

          <div className="portal-link-block">
            <button
              type="button"
              className={`portal-link-btn${on ? ' is-on' : ''}`}
              onClick={toggleLink}
              disabled={!enabled || !hasSite}
            >
              {on ? '✓ Login link is on your website' : 'Add Login Link to Website'}
            </button>
            <p className="portal-note">
              {on
                ? 'Shown in your site’s header menu and footer, after the links that win you new work.'
                : 'Adds it to your site’s header menu and footer, so a past customer can always find their way back.'}
            </p>

            {on ? (
              <div className="portal-label-row">
                <label htmlFor="portalNavLabel">Link text</label>
                <input
                  id="portalNavLabel"
                  type="text"
                  value={label}
                  maxLength={PORTAL_NAV_LABEL_MAX}
                  placeholder={DEFAULT_PORTAL_NAV_LABEL}
                  onChange={(event) => renameLink(event.target.value)}
                  disabled={!enabled}
                />
                <span className="portal-label-preview" aria-hidden="true">{shownLabel}</span>
              </div>
            ) : null}
          </div>

          <p className="portal-privacy">
            🔒 We never reveal whether an email address or number is in your customer list. Every visitor sees the same
            confirmation message. You can cut off any customer’s access from their page under Clients.
          </p>
        </div>

        <div className="portal-preview">
          <p className="eyebrow">Customer preview</p>
          <p className="portal-lede">What a past customer sees at that address.</p>

          <div className="portal-mock" aria-hidden="true">
            <p className="portal-mock-brand">{businessName}</p>
            <p className="portal-mock-title">Find your past jobs</p>
            <div className="portal-mock-field">
              <p className="portal-mock-label">Enter your email address or mobile number</p>
              <p className="portal-mock-input">customer@email.com or (248) 555-0117</p>
              <p className="portal-mock-btn">Send secure lookup link</p>
            </div>
            <p className="portal-mock-fine">We’ll send you a private link if we find a match.</p>
          </div>
        </div>
      </div>

      <div className="portal-foot">
        <span className="portal-foot-note">
          {on ? `Your site shows “${shownLabel}”.` : 'No link on your website yet.'}
        </span>
        <span className={`portal-save portal-save-${save}`} aria-live="polite">
          {save === 'saving'
            ? 'Saving…'
            : save === 'saved'
              ? '✓ Saved'
              : save === 'error'
                ? 'Couldn’t save — try again'
                : ''}
        </span>
      </div>
    </div>
  );
}
