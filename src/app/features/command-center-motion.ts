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
    // THRESHOLD 0, NOT 0.16 — AND THAT IS THE WHOLE BUG.
    //
    // These cards are a heading plus a full dashboard mockup; several are
    // TALLER THAN THE VIEWPORT. `threshold: 0.16` asks for 16% of the card to
    // be visible at once, and 16% of a card taller than the screen can never be
    // satisfied, so the observer never fired and the card never got `.in`.
    // Since .cc-anim starts every card at opacity 0, the whole section rendered
    // as its own height in empty space — the heading, then nothing.
    //
    // A zero threshold fires the moment any part of the card crosses the
    // margin, which is what "reveal on scroll" actually means. The rootMargin
    // still holds the trigger back until the card is properly on screen.
    { threshold: 0, rootMargin: '0px 0px -8% 0px' },
  );
  cards.forEach((c) => io.observe(c));

  // A CARD ALREADY ON SCREEN AT SETUP MUST NOT WAIT FOR A SCROLL.
  // IntersectionObserver does fire an initial callback, but only for cards that
  // intersect at that moment; on a short viewport, or if the deck is scrolled
  // to directly by hash, anything already past the margin would otherwise sit
  // hidden until the user scrolled the page some other way.
  requestAnimationFrame(() => {
    const vh = window.innerHeight;
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        c.classList.add('in');
        io.unobserve(c);
      }
    });
  });

  // THE BACKSTOP, AND THE REASON IT EXISTS.
  //
  // This deck is the answer to "what does the product look like", and it was
  // rendering as its own height in empty space — the heading, then nothing. The
  // first cause was a threshold of 0.16 on cards taller than the viewport,
  // fixed above. But the deeper problem is the shape of the thing: CONTENT
  // VISIBILITY WAS RIDING ON AN OBSERVER FIRING. Anything that stops the
  // callback — a layout that settles late as hero images load, an effect
  // cleanup racing its own setup, a browser quirk — takes the section with it,
  // and the failure is total and silent.
  //
  // So the animation is now strictly additive. Cards still animate in as you
  // reach them when everything works; if a card has not been revealed shortly
  // after setup it is simply shown. A card revealed early while off screen
  // costs nothing — nobody is looking at it. A card left hidden on screen is
  // the bug this is here to make impossible.
  const backstop = window.setTimeout(() => {
    cards.forEach((c) => {
      c.classList.add('in');
      io.unobserve(c);
    });
  }, 2500);

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
    window.clearTimeout(backstop);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    // THE HIDDEN STATE MUST NOT OUTLIVE THE THING THAT UNDOES IT.
    //
    // `cc-anim` is what sets every card to opacity 0; the observer and the
    // backstop above are the only two things that ever take a card out of that
    // state. Tearing them down while leaving the class behind is how the deck
    // ended up permanently blank — and it is not hypothetical: measured on the
    // live page, six cards revealed fine when the page sat still and zero of
    // six revealed while scrolling, because the scroll churn kept tearing this
    // effect down and restarting the 2.5s backstop before it could fire, each
    // time leaving the class in place.
    //
    // Dropping the class on the way out means the worst case is a deck that
    // appears without its entrance animation, instead of one that never appears.
    scope.classList.remove('cc-anim');
  };
}
