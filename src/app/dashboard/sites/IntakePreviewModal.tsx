'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import HeroQuickForm from '@/lib/templates/HeroQuickForm';
import { templateFontVars } from '@/lib/templates/fonts';
import themeStyles from '@/lib/templates/themes.module.css';
import { getColorScheme, getSiteContent, mergeSiteContent } from '@/lib/site-content';
import { readableAccentText, readableOnAccent } from '@/lib/templates/theme-color';
import type { Site } from '@/lib/sites';

// "Preview Smart Intake" — the tuners above this decide what a homeowner
// is asked, and until now the only way to find out what they added up to was to
// publish the site and open it on a phone.
//
// This renders the REAL intake component, not a mock-up, against the DRAFT site
// object — so an exclusion typed thirty seconds ago is in the preview before it
// has been saved, and a mock-up can't drift away from the thing it depicts.
//
// It runs the real estimator too, because the questions the AI decides to ask
// are the part an owner actually wants to see. What it will not do is create a
// lead: HeroQuickForm's `demo` prop stops at the submit. That matters more than
// it sounds — a contractor poking at their own form is exactly how junk leads
// and junk email addresses get into a pipeline.

export default function IntakePreviewModal({ site, compact = false }: { site: Site; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Remounts the form on each open so the second look starts from the
  // description box rather than wherever the first one was abandoned.
  const [runId, setRunId] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function show() {
    setRunId((current) => current + 1);
    setOpen(true);
  }

  // The same variables every template root sets, built the same way, so the
  // preview can't drift into showing a color the live site doesn't use.
  const siteContent = getSiteContent(site.content);
  const smartIntakeLive = siteContent.estimateRanges.enabled;
  // This control is specifically a Smart Intake tuner, so its preview always
  // renders Smart Intake even when the live website currently uses the classic
  // form. The warning below makes that preview-only override explicit.
  const previewSite: Site = {
    ...site,
    content: mergeSiteContent(site.content, {
      quoteForm: { ...siteContent.quoteForm, enabled: false },
    }),
  };
  const scheme = getColorScheme(siteContent.colorScheme);
  const defaultAccent = '#2563eb';
  const effectiveAccent = site.accent_override || scheme?.accent || defaultAccent;
  const themeStyle = {
    '--theme-accent': effectiveAccent,
    '--theme-on-accent': site.accent_override ? readableOnAccent(site.accent_override) : scheme?.onAccent || '#ffffff',
    '--theme-accent-text': site.accent_override
      ? readableAccentText(site.accent_override, [scheme?.bg || '#0e1116', scheme?.surface || '#191d25'])
      : (scheme?.accentText || defaultAccent),
    ...(site.header_font ? { '--theme-display': site.header_font } : {}),
    ...(scheme ? {
      '--c-bg': scheme.bg,
      '--c-surface': scheme.surface,
      '--c-ink': scheme.ink,
      '--c-muted': scheme.muted,
      '--c-line': scheme.line,
      '--c-control-line': scheme.controlLine,
      '--c-deep': scheme.deep,
      '--c-on-deep': scheme.onDeep,
      '--c-on-photo': scheme.onPhoto,
    } : {}),
  } as CSSProperties;

  return (
    <>
      {/* `compact` is for the Smart Intake card, where the panel it sits beside is
          already headed "Live intake preview" — a second full-width banner
          repeating that would be the loudest thing in the column and say
          nothing new. Everywhere else it stays the explaining card, because
          nothing around it has said what a preview is. */}
      {compact ? (
        <button type="button" className="intake-preview-compact" onClick={show}>
          Open full preview <span aria-hidden="true">↗</span>
        </button>
      ) : (
        <button type="button" className="intake-preview-trigger" onClick={show}>
          <span aria-hidden="true">👀</span> Preview Smart Intake
          <small>See what a homeowner sees, without sending anything</small>
        </button>
      )}

      {mounted && open
        ? createPortal(
            <div
              /* The modal portals to document.body, so it hangs outside every
                 wrapper on the page. It renders the site's own header_font, so
                 the variables have to travel with it. */
              className={`app-modal-backdrop ${templateFontVars}`}
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className="app-modal intake-preview-modal" role="dialog" aria-modal="true" aria-label="Preview Smart Intake">
                <div className="app-modal-head">
                  <h2>Smart Intake, as a customer sees it</h2>
                  <button ref={closeRef} type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
                    ✕
                  </button>
                </div>
                <div className="app-modal-body">
                  <p className="intake-preview-note">
                    Type a job the way one of your customers would and answer the questions. This is the real intake
                    running on your current settings &mdash; <strong>nothing is sent and no lead is created.</strong>
                  </p>

                  {!smartIntakeLive ? (
                    <p className="intake-preview-warn">
                      <strong>Preview only:</strong> your live website currently uses the classic form. Switch the intake
                      method in Website Builder when you&rsquo;re ready to make Smart Intake live.
                    </p>
                  ) : null}

                  {!site.published ? (
                    <p className="intake-preview-warn">
                      Your website isn&rsquo;t published yet, so the estimator can&rsquo;t price anything in here &mdash;
                      you&rsquo;ll get the fields but not the questions. Publish it and the full conversation runs.
                    </p>
                  ) : null}

                  {/* The intake's own styles are scoped under `.site[data-button]`
                      and read the theme variables a template root sets. Rendered
                      outside one, the submit button loses its fill entirely — so
                      the preview reproduces that wrapper rather than approximating
                      it, and the card comes out the color and button shape the
                      published site will actually use. */}
                  <div className="intake-preview-stage">
                    <div className={themeStyles.site} style={themeStyle} data-button={site.button_style || 'solid'}>
                      <HeroQuickForm key={runId} site={previewSite} demo />
                    </div>
                  </div>

                  <div className="intake-preview-foot">
                    <button type="button" className="btn ghost" onClick={show}>
                      Start over
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
