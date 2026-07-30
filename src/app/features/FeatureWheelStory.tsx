'use client';

import { useEffect, useRef } from 'react';
import { FEATURE_WHEEL_MARKUP } from './feature-wheel-story.markup';
import './feature-wheel-story.css';

// The wheel-story + command center is a large, self-contained interactive widget
// with no dynamic data, so the static markup is injected once and all the
// behaviour (scroll-driven wheel rotation, section swapping, card scroll-reveal
// and parallax) is wired up here against the mounted DOM. Everything is scoped
// to this component's root and torn down on unmount.
export default function FeatureWheelStory() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const scope = root?.querySelector<HTMLElement>('.fw-scope');
    if (!scope) return;

    const REDUCE = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const cleanups: Array<() => void> = [];

    // The device mockups carry invented sample figures — hide them from
    // assistive tech and crawlers; the real meaning lives in the adjacent
    // headings and bullets (see the "Sample data" labels).
    scope.querySelectorAll<HTMLElement>('.fw-mock, .cc-screen').forEach((el) => {
      el.setAttribute('aria-hidden', 'true');
    });

    // ---------------- the wheel (scroll-driven rotation + section swap) ------------
    (() => {
      const story = scope.querySelector<HTMLElement>('.fw-story');
      const rotor = scope.querySelector<HTMLElement>('#fw-rotor');
      const spokes = Array.from(scope.querySelectorAll<HTMLElement>('.fw-spoke'));
      const nodes = Array.from(scope.querySelectorAll<HTMLElement>('.fw-node'));
      const navs = Array.from(scope.querySelectorAll<HTMLElement>('.fw-navbtn'));
      const copies = Array.from(scope.querySelectorAll<HTMLElement>('.fw-copy'));
      if (!story || !copies.length) return;

      const STEPS = 5; // six sections
      const COLORS = ['#ff7a21', '#ffd166', '#bef264', '#7dd3fc', '#4ade80', '#2dbed2'];
      let cur = -1;
      let curRot = 0;
      let rafId = 0;
      let running = true;
      let visible = false;
      let lastT = 0;

      const activate = (i: number) => {
        if (i === cur) return;
        cur = i;
        scope.style.setProperty('--ck', COLORS[i] || COLORS[0]);
        spokes.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
        copies.forEach((c, idx) => c.classList.toggle('is-active', idx === i));
        nodes.forEach((b, idx) => b.setAttribute('aria-current', idx === i ? 'true' : 'false'));
        navs.forEach((b, idx) => b.setAttribute('aria-current', idx === i ? 'true' : 'false'));
        const card = copies[i];
        if (card && !REDUCE) {
          card.classList.remove('playing');
          void card.offsetWidth; // reflow so the entrance animation replays
          card.classList.add('playing');
        }
      };

      // story.offsetHeight and window.innerHeight were read every frame, which
      // forces layout 60 times a second for values that only change on resize.
      let range = 0;
      const measure = () => { range = story.offsetHeight - window.innerHeight; };
      measure();

      const progress = () => {
        if (range <= 0) return 0;
        return Math.min(1, Math.max(0, -story.getBoundingClientRect().top / range));
      };

      const schedule = () => { if (!rafId && running && visible) rafId = requestAnimationFrame(tick); };

      function tick(now: number) {
        rafId = 0;
        if (!running || !visible) return;

        // Frame-rate INDEPENDENT easing. `curRot += delta * 0.14` converges per
        // FRAME, so on a device rendering 30fps instead of 60 the wheel took
        // twice as long in wall-clock time to catch up to the scroll — which is
        // exactly when it can least afford to feel slow. Converting the per-
        // frame factor by elapsed time makes the wheel settle in the same
        // fraction of a second whatever the device manages.
        const dt = lastT ? Math.min(64, now - lastT) : 16.667;
        lastT = now;

        const p = progress();
        const targetRot = -30 * STEPS * p; // 30° between spokes
        const i = Math.max(0, Math.min(STEPS, Math.round(p * STEPS)));
        if (REDUCE) {
          curRot = -30 * i;
        } else {
          const k = 1 - Math.pow(1 - 0.14, dt / 16.667);
          curRot += (targetRot - curRot) * k;
          if (Math.abs(targetRot - curRot) < 0.04) curRot = targetRot;
        }
        // Written to every consumer individually — see the @property note in
        // the stylesheet. `nodes` is the six spoke buttons, the only other
        // elements that read --rot.
        const rot = `${curRot.toFixed(2)}deg`;
        if (rotor) rotor.style.setProperty('--rot', rot);
        for (const n of nodes) n.style.setProperty('--rot', rot);
        activate(i);

        // Settled and nothing moving: stop burning frames until the next scroll.
        if (curRot !== targetRot) schedule();
      }

      const wake = () => { lastT = 0; schedule(); };
      const onResize = () => { measure(); wake(); };
      window.addEventListener('scroll', wake, { passive: true });
      window.addEventListener('resize', onResize, { passive: true });

      // The loop used to run from mount to unmount whether or not the wheel was
      // anywhere near the screen — two forced layout reads per frame, forever,
      // taxing every other thing on the page.
      let io: IntersectionObserver | undefined;
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(
          (entries) => {
            visible = entries.some((en) => en.isIntersecting);
            if (visible) wake();
            else if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
          },
          { rootMargin: '200px 0px' },
        );
        io.observe(story);
      } else {
        visible = true;
      }

      const goto = (i: number) => {
        const top = window.pageYOffset + story.getBoundingClientRect().top + (i / STEPS) * range;
        window.scrollTo({ top: Math.round(top), behavior: REDUCE ? 'auto' : 'smooth' });
      };

      const clickHandlers: Array<[HTMLElement, () => void]> = [];
      nodes.concat(navs).forEach((b) => {
        const i = parseInt(b.getAttribute('data-goto') || '0', 10) || 0;
        const handler = () => goto(i);
        b.addEventListener('click', handler);
        clickHandlers.push([b, handler]);
      });

      if (rotor) rotor.style.setProperty('--rot', '0deg');
      for (const n of nodes) n.style.setProperty('--rot', '0deg');
      activate(0);
      schedule();

      cleanups.push(() => {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        io?.disconnect();
        window.removeEventListener('scroll', wake);
        window.removeEventListener('resize', onResize);
        clickHandlers.forEach(([b, h]) => b.removeEventListener('click', h));
      });
    })();

    // ---------------- command center (scroll-reveal + parallax) --------------------
    (() => {
      const cc = scope.querySelector<HTMLElement>('.cc');
      if (!cc) return;
      const cards = Array.from(cc.querySelectorAll<HTMLElement>('.cc-card'));
      if (!cards.length) return;

      if (REDUCE || !('IntersectionObserver' in window)) {
        cards.forEach((c) => c.classList.add('in'));
        return;
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

      // layered parallax: the mockup and the copy drift at different rates as
      // each card passes through the viewport, for depth.
      const screens = cards.map((c) => c.querySelector<HTMLElement>('.cc-screen'));
      const heads = cards.map((c) => c.querySelector<HTMLElement>('.cc-card-head'));
      let ticking = false;
      // Every read is done before any write. Interleaving them — measure a card,
      // move it, measure the next — makes each write invalidate layout so the
      // next read has to recompute it: one forced reflow per card per scroll
      // frame, which is what makes this expensive on a slower tablet.
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

      cleanups.push(() => {
        io.disconnect();
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
    })();

    return () => cleanups.forEach((fn) => fn());
  }, []);

  // scrollMarginTop keeps the #wheel anchor clear of the fixed mobile top bar.
  return (
    <div
      id="wheel"
      ref={rootRef}
      style={{ scrollMarginTop: '5rem' }}
      dangerouslySetInnerHTML={{ __html: FEATURE_WHEEL_MARKUP }}
    />
  );
}
