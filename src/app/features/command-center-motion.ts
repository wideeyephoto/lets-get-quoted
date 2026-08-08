/**
 * Scroll-reveal and layered parallax for the command-center deck.
 *
 * Extracted from FeatureWheelStory so the homepage can render the deck on its
 * own without a second copy of this behaviour. Both callers pass their own
 * mounted scope; nothing here touches anything outside it.
 *
 * Returns a teardown function. Callers must call it — the listeners are on
 * `window`, so a leak survives the component.
 */
export function wireCommandCenter(scope: HTMLElement, reduce: boolean): () => void {
  const cc = scope.querySelector<HTMLElement>('.cc');
  if (!cc) return () => {};
  const cards = Array.from(cc.querySelectorAll<HTMLElement>('.cc-card'));
  if (!cards.length) return () => {};

  // The mockups carry invented sample figures — hide them from assistive tech
  // and crawlers; the real meaning lives in the adjacent headings and
  // descriptions (see the "Sample data" label in the deck header).
  cc.querySelectorAll<HTMLElement>('.cc-screen').forEach((el) => {
    el.setAttribute('aria-hidden', 'true');
  });

  if (reduce || !('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('in'));
    return () => {};
  }

  scope.classList.add('cc-anim'); // enables the hidden-until-revealed state
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
  );
  cards.forEach((c) => io.observe(c));

  // layered parallax: the mockup and the copy drift at different rates as each
  // card passes through the viewport, for depth.
  const screens = cards.map((c) => c.querySelector<HTMLElement>('.cc-screen'));
  const heads = cards.map((c) => c.querySelector<HTMLElement>('.cc-card-head'));
  let ticking = false;

  // Every read is done before any write. Interleaving them — measure a card,
  // move it, measure the next — makes each write invalidate layout so the next
  // read has to recompute it: one forced reflow per card per scroll frame,
  // which is what makes this expensive on a slower tablet.
  const frame = () => {
    const vh = window.innerHeight;

    // --- read pass ---
    const offsets: Array<number | null> = [];
    let live = -1;
    let liveDist = Infinity;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.bottom < -90 || r.top > vh + 90) {
        offsets[i] = null;
        return;
      }
      const centre = r.top + r.height / 2;
      offsets[i] = (centre - vh / 2) / vh; // ~ -1 (below) .. 1 (above)
      const dist = Math.abs(centre - vh / 2);
      if (centre > vh * 0.12 && centre < vh * 0.88 && dist < liveDist) {
        liveDist = dist;
        live = i;
      }
    });

    // --- write pass ---
    cards.forEach((c, i) => {
      const f = offsets[i];
      if (f != null) {
        const s = screens[i];
        if (s) s.style.transform = `translateY(${(f * -28).toFixed(1)}px)`;
        const h = heads[i];
        if (h) h.style.transform = `translateY(${(f * 12).toFixed(1)}px)`;
      }
      c.classList.toggle('cc-live', i === live);
    });
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  return () => {
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}
