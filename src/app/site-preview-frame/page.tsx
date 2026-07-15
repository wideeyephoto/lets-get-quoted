'use client';

import { useEffect, useState } from 'react';
import { getSiteGallery } from '@/lib/site-images';
import type { Site } from '@/lib/sites';
import { getTemplate } from '@/lib/templates';

export default function SitePreviewFramePage() {
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    function receiveDraft(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'lgq:site-preview') return;
      setSite(event.data.site as Site);
    }

    window.addEventListener('message', receiveDraft);
    window.parent.postMessage({ type: 'lgq:preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', receiveDraft);
  }, []);

  if (!site) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#111827', color: '#f9fafb' }}>Loading preview...</main>;
  }

  const Template = getTemplate(site.template);
  if (!Template) return <main style={{ padding: '2rem' }}>Theme unavailable.</main>;
  return <Template site={site} galleryImages={getSiteGallery(site.content)} />;
}