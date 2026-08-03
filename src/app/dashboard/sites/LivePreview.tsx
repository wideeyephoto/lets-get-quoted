'use client';

import { useEffect, useRef, useState } from 'react';
import type { Site } from '@/lib/sites';
import styles from './SiteEditor.module.css';

type LivePreviewProps = {
  site: Site;
  // The builder section card currently open. When it changes, we scroll the
  // matching region of the live preview into the center of the frame so the
  // owner sees the part they're editing without hunting for it.
  openSection?: string | null;
};

export default function LivePreview({ site, openSection }: LivePreviewProps) {
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

  return (
    <section
      className={`${styles.previewPanel} ${expanded ? styles.previewExpanded : ''}`}
      aria-label="Live website preview"
    >
      <div className={styles.previewToolbar}>
        <div>
          <strong>Live preview</strong>
          <span>Click any section or photo to edit it</span>
        </div>
        <div className={styles.previewToolbarActions}>
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
          {/* Only shown where the preview is actually pinned and short — on a
              desktop it already fills the column and there is nothing to gain. */}
          <button
            type="button"
            className={styles.previewExpandButton}
            onClick={() => setExpanded(!expanded)}
            aria-pressed={expanded}
          >
            {expanded ? '✕ Close' : '⤢ Expand'}
          </button>
        </div>
      </div>

      <div className={`${styles.previewStage} ${device === 'mobile' ? styles.mobileStage : ''}`}>
        <iframe
          ref={iframeRef}
          className={styles.previewFrame}
          src="/site-preview-frame"
          title="Live contractor website preview"
          onLoad={sendDraft}
        />
      </div>
    </section>
  );
}