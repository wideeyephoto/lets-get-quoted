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

      const progress = () => {
        const range = story.offsetHeight - window.innerHeight;
        if (range <= 0) return 0;
        return Math.min(1, Math.max(0, -story.getBoundingClientRect().top / range));
      };

      const tick = () => {
        if (!running) return;
        const p = progress();
        const targetRot = -30 * STEPS * p; // 30° between spokes
        const i = Math.max(0, Math.min(STEPS, Math.round(p * STEPS)));
        if (REDUCE) {
          curRot = -30 * i;
        } else {
          curRot += (targetRot - curRot) * 0.14;
          if (Math.abs(targetRot - curRot) < 0.04) curRot = targetRot;
        }
        if (rotor) rotor.style.setProperty('--rot', `${curRot.toFixed(2)}deg`);
        activate(i);
        rafId = requestAnimationFrame(tick);
      };

      const goto = (i: number) => {
        const range = story.offsetHeight - window.innerHeight;
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
      activate(0);
      rafId = requestAnimationFrame(tick);

      cleanups.push(() => {
        running = false;
        cancelAnimationFrame(rafId);
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
      const frame = () => {
        const vh = window.innerHeight;
        cards.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          if (r.bottom < -90 || r.top > vh + 90) return;
          const f = (r.top + r.height / 2 - vh / 2) / vh; // ~ -1 (below) .. 1 (above)
          const s = screens[i];
          if (s) s.style.transform = `translateY(${(f * -28).toFixed(1)}px)`;
          const h = heads[i];
          if (h) h.style.transform = `translateY(${(f * 12).toFixed(1)}px)`;
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

  return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: FEATURE_WHEEL_MARKUP }} />;
}
