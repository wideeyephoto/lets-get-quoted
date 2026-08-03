'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Site } from '@/lib/sites';
import styles from './SiteEditor.module.css';

type LivePreviewProps = {
  site: Site;
  // The builder section card currently open. When it changes, we scroll the
  // matching region of the live preview into the center of the frame so the
  // owner sees the part they're editing without hunting for it.
  openSection?: string | null;
  // Rendered into the narrow-screen control overlay. The builder puts its tab
  // switcher here: on a phone the tab row costs 63px of permanent chrome for
  // navigation used once a session, so it becomes a chip on the preview
  // instead — but the tabs are the BUILDER's state, so it passes the control
  // down rather than this component learning about them.
  overlaySlot?: ReactNode;
};

export default function LivePreview({ site, openSection, overlaySlot }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [loaded, setLoaded] = useState(false);
  // Pinned preview only: on a narrow screen it sits at ~38dvh, which is right
  // for watching a change land and too small to judge a page by. Expanding
  // hands it the screen for a proper look.
  const [expanded, setExpanded] = useState(false);

  // Someone editing on their phone is almost certainly checking how the site
  // looks on a phone — and a desktop layout squeezed into 390px is unreadable
  // either way. Decided in an effect, never during render, so the server and the
  // first client paint agree on 'desktop' and nothing flips mid-hydration.
  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setDevice('mobile');
  }, []);

  // Where the controls live. Above this width they are a toolbar row; below it
  // that row is 49px of permanent chrome on a 664px screen, so they become chips
  // floating on the preview instead.
  //
  // Rendered as one or the other, never both. Two copies would mean two sets of
  // identically-labelled buttons in the accessibility tree, one of them
  // invisible — which is worse than the row ever was.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1120px)');
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Expanding takes over the screen, so Escape has to get out — a phone has no
  // obvious way back otherwise, and a trapped full-screen panel is worse than
  // no expand button at all.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  useEffect(() => {
    function handleReady(event: MessageEvent) {
      if (event.origin === window.location.origin && event.data?.type === 'lgq:preview-ready') {
        setLoaded(true);
      }
    }

    window.addEventListener('message', handleReady);
    return () => window.removeEventListener('message', handleReady);
  }, []);

  // Debounced: while the owner is typing, wait for a 150ms pause instead of
  // re-rendering the whole preview iframe on every keystroke.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'lgq:site-preview', site },
        window.location.origin
      );
    }, 150);
    return () => clearTimeout(timer);
  }, [loaded, site]);

  // Center the open section in the preview. Wait out the 150ms site-preview
  // debounce so a just-enabled section has rendered before we ask to scroll.
  useEffect(() => {
    if (!loaded || !openSection) return;
    const timer = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'lgq:scroll-to-section', section: openSection },
        window.location.origin
      );
    }, 180);
    return () => clearTimeout(timer);
  }, [loaded, openSection]);

  function sendDraft() {
    setLoaded(true);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'lgq:site-preview', site },
      window.location.origin
    );
  }

  const deviceToggle = (
    <div className={styles.deviceToggle} aria-label="Preview size">
      <button
        type="button"
        className={device === 'desktop' ? styles.activeDevice : undefined}
        onClick={() => setDevice('desktop')}
        aria-pressed={device === 'desktop'}
      >
        Desktop
      </button>
      <button
        type="button"
        className={device === 'mobile' ? styles.activeDevice : undefined}
        onClick={() => setDevice('mobile')}
        aria-pressed={device === 'mobile'}
      >
        Mobile
      </button>
    </div>
  );

  // Icon only while collapsed, worded once expanded. Three text chips side by
  // side spanned nearly the whole 390px preview and sat across the site's own
  // header, which is the opposite of showing somebody their website.
  const expandButton = (
    <button
      type="button"
      className={styles.previewExpandButton}
      onClick={() => setExpanded(!expanded)}
      aria-pressed={expanded}
      aria-label={expanded ? 'Close the expanded preview' : 'Expand the preview'}
      title={expanded ? 'Close' : 'Expand'}
    >
      {expanded ? '✕ Close' : '⤢'}
    </button>
  );

  return (
    <section
      className={`${styles.previewPanel} ${expanded ? styles.previewExpanded : ''}`}
      aria-label="Live website preview"
    >
      {!narrow && (
        <div className={styles.previewToolbar}>
          <div>
            <strong>Live preview</strong>
            <span>Click any section or photo to edit it</span>
          </div>
          <div className={styles.previewToolbarActions}>{deviceToggle}</div>
        </div>
      )}

      <div className={`${styles.previewStage} ${device === 'mobile' ? styles.mobileStage : ''}`}>
        <iframe
          ref={iframeRef}
          className={styles.previewFrame}
          src="/site-preview-frame"
          title="Live contractor website preview"
          onLoad={sendDraft}
        />

        {/* The controls, as chips on the preview rather than rows above it.
            Two clusters at opposite top corners, over the site's own header —
            the least information-dense band of any page, and the one an owner
            is least likely to be reading while they edit something else. */}
        {narrow && (
          <>
            {/* Hidden while expanded: the point of expanding is to look at the
                site, and a strip across it is in the way. */}
            {overlaySlot && !expanded && overlaySlot}
            <div className={styles.previewChipsRight}>
              {/* Desktop/Mobile only in the expanded view. On a phone the
                  preview already defaults to Mobile, and checking the desktop
                  layout is something you do while looking properly — not a
                  control worth spending a third of the preview's width on. */}
              {expanded && deviceToggle}
              {expandButton}
            </div>
          </>
        )}
      </div>
    </section>
  );
}