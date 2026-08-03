'use client';

import { useState } from 'react';
import type { SiteSocialLink } from '@/lib/site-content';
import { SOCIAL_PLATFORMS, normalizeSocialUrl, type SocialPlatform } from '@/lib/socials';
import SocialIcon from '@/lib/templates/SocialIcon';
import styles from './SiteEditor.module.css';

// Setup → "Socials & listings".
//
// VALIDATION HAPPENS ON BLUR, NOT ON EVERY KEYSTROKE. Normalizing as someone
// types means the field fights them: "f" isn't a Facebook link, nor is "faceb",
// so an eager check paints the box red for everyone typing a valid URL slowly.
// The draft lives in local state while they type; on blur it either becomes a
// canonical URL or an inline message saying why it can't.
//
// SAVING THE NORMALIZED FORM, AND SHOWING IT. When a paste resolves, the input
// is rewritten to the stored URL rather than left as typed. That looks fussy but
// it is the only honest thing to do: the tracking parameters are gone and the
// handle has become a full link, so leaving the raw text on screen would show
// the owner something different from what their site publishes.

function inputValue(links: SiteSocialLink[], id: string): string {
  return links.find((l) => l.platform === id)?.url ?? '';
}

export default function SocialsField({
  socials,
  socialsInHeader,
  onChange,
  onHeaderChange,
}: {
  socials: SiteSocialLink[];
  socialsInHeader: boolean;
  onChange: (next: SiteSocialLink[]) => void;
  onHeaderChange: (next: boolean) => void;
}) {
  // Only holds what is mid-edit. Anything not in here renders from saved
  // content, so an external change (AI seed, another tab) isn't masked by a
  // stale local copy.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function commit(platform: SocialPlatform, raw: string) {
    const typed = raw.trim();
    const others = socials.filter((l) => l.platform !== platform.id);

    if (!typed) {
      onChange(others);
      setErrors((prev) => ({ ...prev, [platform.id]: '' }));
      setDrafts((prev) => { const next = { ...prev }; delete next[platform.id]; return next; });
      return;
    }

    const url = normalizeSocialUrl(platform.id, typed);
    if (!url) {
      setErrors((prev) => ({
        ...prev,
        [platform.id]: platform.handleHost
          ? `That doesn’t look like a ${platform.label} link. Paste the profile URL, or just your @handle.`
          : `That doesn’t look like a ${platform.label} link. Open your ${platform.label} listing and paste its full web address.`,
      }));
      return;
    }

    // Rebuild in registry order rather than appending, so the footer row always
    // reads in the same order regardless of which box was filled in first.
    const merged = [...others, { platform: platform.id, url }];
    const order = new Map(SOCIAL_PLATFORMS.map((p, i) => [p.id as string, i]));
    merged.sort((a, b) => (order.get(a.platform) ?? 99) - (order.get(b.platform) ?? 99));

    onChange(merged);
    setErrors((prev) => ({ ...prev, [platform.id]: '' }));
    setDrafts((prev) => { const next = { ...prev }; delete next[platform.id]; return next; });
  }

  function renderGroup(group: 'social' | 'review') {
    return SOCIAL_PLATFORMS.filter((p) => p.group === group).map((platform) => {
      const saved = inputValue(socials, platform.id);
      const value = drafts[platform.id] ?? saved;
      const error = errors[platform.id];
      return (
        <label key={platform.id} className={`${styles.formField} ${styles.socialField}`}>
          <span className={styles.socialFieldLabel}>
            <SocialIcon name={platform.icon} className={styles.socialFieldIcon} />
            {platform.label}
            {saved && <span className={styles.socialFieldOn} aria-label="Added">✓</span>}
          </span>
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder={platform.placeholder}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setDrafts((prev) => ({ ...prev, [platform.id]: event.target.value }));
              if (error) setErrors((prev) => ({ ...prev, [platform.id]: '' }));
            }}
            onBlur={(event) => commit(platform, event.target.value)}
            // Enter should feel like finishing the field, not submitting a form
            // that isn't there.
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
          />
          {error && <small className={styles.socialFieldError}>{error}</small>}
        </label>
      );
    });
  }

  return (
    <>
      <p className={styles.fieldHint}>
        Add the profiles you actually keep up to date. Each one becomes an icon in your website’s
        footer — and tells Google these accounts belong to your business, which helps it show the
        right listing when someone searches your name.
      </p>

      <div className={styles.cardGroupLabel}>Social profiles</div>
      <div className={styles.socialGrid}>{renderGroup('social')}</div>

      <div className={styles.cardGroupLabel}>Review &amp; directory listings</div>
      <p className={styles.fieldHint}>
        These are where homeowners check you out before they call. Linking them is worth more than
        a social profile for most contractors.
      </p>
      <div className={styles.socialGrid}>{renderGroup('review')}</div>

      <label className={styles.toggleRow} style={{ marginTop: '1rem' }}>
        <input type="checkbox" checked={socialsInHeader} onChange={(event) => onHeaderChange(event.target.checked)} />
        <span>
          <strong>Also show them in the top bar</strong>
          <small>
            Only applies to the Utility header style. Off by default — on a phone the icons can push
            your phone number onto a second line.
          </small>
        </span>
      </label>
    </>
  );
}
