'use client';

import { useEffect, useRef, useState } from 'react';
import type { Site } from '@/lib/sites';
import styles from './SiteEditor.module.css';

type LivePreviewProps = {
  site: Site;
};

export default function LivePreview({ site }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [loaded, setLoaded] = useState(false);

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

  function sendDraft() {
    setLoaded(true);
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'lgq:site-preview', site },
      window.location.origin
    );
  }

  return (
    <section className={styles.previewPanel} aria-label="Live website preview">
      <div className={styles.previewToolbar}>
        <div>
          <strong>Live preview</strong>
          <span>Click any section to edit it</span>
        </div>
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