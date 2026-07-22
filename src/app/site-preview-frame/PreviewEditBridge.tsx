'use client';

import { useEffect } from 'react';

// Shopify-style click-to-edit bridge for the builder's live preview iframe.
// Hovering an editable region outlines it and floats a label pill over it —
// "Replace photo"/"Replace logo" for images, "Click to edit" for everything
// else — so every image reads as directly swappable. Clicking posts an edit
// request to the parent builder, which jumps to the matching control.
//
// Regions resolve WITHOUT per-template markup: explicit [data-edit] markers
// (announcement bar, quote form, estimate wizard) win; then the header (logo
// img → logo, otherwise business identity); then the nearest section[id] —
// '#top' is the hero, an img/figure inside any section is that image, and
// shared section ids map to their card on the builder side. Clicks are fully
// captured, so the preview is an editing surface, not a browsable page.
type Editable = { key: string; node: Element; isImage: boolean };

function resolveEditable(el: Element): Editable | null {
  const explicit = el.closest('[data-edit]');
  if (explicit) return { key: explicit.getAttribute('data-edit') || '', node: explicit, isImage: explicit.tagName === 'FIGURE' || !!explicit.querySelector('img') };

  const header = el.closest('header');
  if (header) {
    const img = el.closest('img');
    return img ? { key: 'logo', node: img, isImage: true } : { key: 'identity', node: header, isImage: false };
  }

  const section = el.closest('section[id]') as HTMLElement | null;
  if (section) {
    const media = el.closest('img, figure, picture');
    if (section.id === 'top') {
      if (media) return { key: 'heroImage', node: media, isImage: true };
      return { key: 'hero', node: section, isImage: false };
    }
    if (media) return { key: section.id, node: media, isImage: true };
    return { key: section.id, node: section, isImage: false };
  }

  const footer = el.closest('footer');
  if (footer) return { key: 'identity', node: footer, isImage: false };
  return null;
}

const CAMERA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
const PENCIL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

function labelFor(match: Editable): string {
  if (match.key === 'logo') return `${CAMERA} Replace logo`;
  if (match.isImage) return `${CAMERA} Replace photo`;
  return `${PENCIL} Click to edit`;
}

export default function PreviewEditBridge() {
  useEffect(() => {
    let hovered: Element | null = null;
    const label = document.createElement('div');
    label.className = 'lgq-edit-label';
    label.hidden = true;
    document.body.appendChild(label);

    // Center the pill horizontally on the region; for tall images keep it near
    // the top so it stays in view, and clamp so a partly-scrolled image still
    // shows the pill on screen.
    const positionLabel = () => {
      if (!hovered) return;
      const rect = hovered.getBoundingClientRect();
      label.style.left = `${rect.left + rect.width / 2}px`;
      label.style.top = `${Math.max(30, rect.top + Math.min(rect.height / 2, 130))}px`;
    };

    const clearHover = () => {
      hovered?.classList.remove('lgq-edit-hover');
      hovered = null;
      label.hidden = true;
    };

    const onMouseOver = (event: MouseEvent) => {
      const match = resolveEditable(event.target as Element);
      if (match?.node === hovered) return;
      clearHover();
      if (match) {
        hovered = match.node;
        hovered.classList.add('lgq-edit-hover');
        label.innerHTML = labelFor(match);
        label.hidden = false;
        positionLabel();
      }
    };

    const onClick = (event: MouseEvent) => {
      const match = resolveEditable(event.target as Element);
      event.preventDefault();
      event.stopPropagation();
      if (match) window.parent.postMessage({ type: 'lgq:edit-request', target: match.key }, window.location.origin);
    };

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseleave', clearHover, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', positionLabel, true);
    window.addEventListener('resize', positionLabel);
    return () => {
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseleave', clearHover, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', positionLabel, true);
      window.removeEventListener('resize', positionLabel);
      clearHover();
      label.remove();
    };
  }, []);

  return (
    <style>{`
      .lgq-edit-hover { outline: 2px dashed #ff7a21 !important; outline-offset: 3px; cursor: pointer !important; }
      .lgq-edit-hover * { cursor: pointer !important; }
      .lgq-edit-label { position: fixed; z-index: 2147483647; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 6px; padding: 7px 13px; border-radius: 999px; background: #ff7a21; color: #fff; font: 700 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: .01em; box-shadow: 0 8px 22px rgba(0,0,0,.4); pointer-events: none; white-space: nowrap; }
      .lgq-edit-label svg { display: block; }
    `}</style>
  );
}
