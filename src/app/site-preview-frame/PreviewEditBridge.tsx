'use client';

import { useEffect } from 'react';

// Shopify-style click-to-edit bridge for the builder's live preview iframe.
// Hovering an editable region outlines it; clicking it posts an edit request
// to the parent builder, which jumps to the matching tab/section/field.
//
// Regions resolve WITHOUT per-template markup: explicit [data-edit] markers
// (announcement bar, quote form, estimate wizard) win; then the header (logo
// img → logo, otherwise business identity); then the nearest section[id] —
// '#top' is the hero (an img inside it → hero image), shared section ids map
// on the builder side. Clicks are fully captured, so the preview is an editing
// surface rather than a browsable page.
function resolveEditable(el: Element): { key: string; node: Element } | null {
  const explicit = el.closest('[data-edit]');
  if (explicit) return { key: explicit.getAttribute('data-edit') || '', node: explicit };

  const header = el.closest('header');
  if (header) {
    const img = el.closest('img');
    return img ? { key: 'logo', node: img } : { key: 'identity', node: header };
  }

  const section = el.closest('section[id]') as HTMLElement | null;
  if (section) {
    if (section.id === 'top') {
      const media = el.closest('img, figure');
      if (media) return { key: 'heroImage', node: media };
      return { key: 'hero', node: section };
    }
    return { key: section.id, node: section };
  }

  const footer = el.closest('footer');
  if (footer) return { key: 'identity', node: footer };
  return null;
}

export default function PreviewEditBridge() {
  useEffect(() => {
    let hovered: Element | null = null;

    const clearHover = () => {
      hovered?.classList.remove('lgq-edit-hover');
      hovered = null;
    };

    const onMouseOver = (event: MouseEvent) => {
      const match = resolveEditable(event.target as Element);
      if (match?.node === hovered) return;
      clearHover();
      if (match) {
        hovered = match.node;
        hovered.classList.add('lgq-edit-hover');
      }
    };

    const onClick = (event: MouseEvent) => {
      const match = resolveEditable(event.target as Element);
      event.preventDefault();
      event.stopPropagation();
      if (match) {
        window.parent.postMessage({ type: 'lgq:edit-request', target: match.key }, window.location.origin);
      }
    };

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseleave', clearHover, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseleave', clearHover, true);
      document.removeEventListener('click', onClick, true);
      clearHover();
    };
  }, []);

  return (
    <style>{`
      .lgq-edit-hover { outline: 2px dashed #ff7a21 !important; outline-offset: 3px; cursor: pointer !important; }
      .lgq-edit-hover * { cursor: pointer !important; }
    `}</style>
  );
}
