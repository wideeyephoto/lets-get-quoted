'use client';

import { useEffect, useRef } from 'react';
import './hero-dashboard.css';

// Interactive dashboard panel shared by the /features and homepage heroes. Its
// top "stage" is a slideshow that auto-advances every 1.4s across five bespoke
// views (paid + the four tools) and highlights the matching tile; hovering a
// tile jumps to its view and pauses. Purely decorative (aria-hidden); renders
// fully without JS and respects prefers-reduced-motion.
export default function HeroDashboard() {
  const winRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const win = winRef.current;
    if (!win) return;
    const REDUCE = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    win.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-count') || '0');
      if (!Number.isFinite(target)) return;
      const fmt = (v: number) => '$' + Math.round(v).toLocaleString();
      if (REDUCE) {
        el.textContent = fmt(target);
        return;
      }
      const t0 = performance.now();
      const dur = 950;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * e);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(target);
      };
      requestAnimationFrame(step);
    });

    if (!REDUCE) win.classList.add('fh-play');

    const order = ['paid', 'ai', 'web', 'quotes', 'reviews'];
    const views = Array.from(win.querySelectorAll<HTMLElement>('.fh-view'));
    const cells = Array.from(win.querySelectorAll<HTMLElement>('.fh-cell[data-view]'));
    let idx = 0;
    let timer: number | null = null;

    const show = (key: string) => {
      views.forEach((v) => v.classList.toggle('is-on', v.getAttribute('data-view') === key));
      cells.forEach((c) => c.classList.toggle('active', c.getAttribute('data-view') === key));
      const i = order.indexOf(key);
      if (i >= 0) idx = i;
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const play = () => {
      if (REDUCE) return;
      stop();
      timer = window.setInterval(() => {
        idx = (idx + 1) % order.length;
        show(order[idx]);
      }, 1400);
    };

    const handlers: Array<[HTMLElement, () => void, () => void]> = [];
    cells.forEach((c) => {
      const key = c.getAttribute('data-view') || 'paid';
      const enter = () => {
        stop();
        show(key);
      };
      const leave = () => play();
      c.addEventListener('mouseenter', enter);
      c.addEventListener('mouseleave', leave);
      handlers.push([c, enter, leave]);
    });

    show('paid');
    play();

    return () => {
      stop();
      handlers.forEach(([c, enter, leave]) => {
        c.removeEventListener('mouseenter', enter);
        c.removeEventListener('mouseleave', leave);
      });
    };
  }, []);

  return (
    <div className="fh-shell">
    <div className="fh-win" aria-hidden="true" ref={winRef}>
      <div className="fh-bar">
        <i />
        <i />
        <i />
        <span className="u">letsgetquoted.com &middot; dashboard</span>
        <span className="fh-live">
          <b />
          Live
        </span>
      </div>
      <div className="fh-body">
        <div className="fh-stage">
          {/* default · deposited to your bank */}
          <div className="fh-view v-paid is-on" data-view="paid">
            <div className="fh-vmain">
              <div className="l">Deposited to your bank</div>
              <div className="amt" data-count="4250">$4,250</div>
              <div className="fh-trend">
                <span className="up">▲ 18%</span> this month &middot; <span className="ago">just now</span>
              </div>
            </div>
            <svg className="fh-vis fh-spark" width="132" height="58" viewBox="0 0 132 58">
              <defs>
                <linearGradient id="fhg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#bef264" stopOpacity="0.35" />
                  <stop offset="1" stopColor="#bef264" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="area" d="M0 46 L18 42 L36 44 L54 32 L72 34 L90 22 L110 18 L132 6 L132 58 L0 58 Z" />
              <path className="line" d="M0 46 L18 42 L36 44 L54 32 L72 34 L90 22 L110 18 L132 6" />
              <circle className="dot" cx="132" cy="6" r="3.5" />
            </svg>
          </div>

          {/* AI Smart Intake */}
          <div className="fh-view v-ai" data-view="ai">
            <div className="fh-vmain">
              <div className="l">AI instant estimate</div>
              <div className="amt">$820&ndash;$1,140</div>
              <div className="fh-trend">Priced in ~8s &middot; answers 24/7</div>
            </div>
            <div className="fh-vis fh-bars">
              <span style={{ height: '32%' }} />
              <span style={{ height: '50%' }} />
              <span style={{ height: '44%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '96%' }} />
            </div>
          </div>

          {/* Website */}
          <div className="fh-view v-web" data-view="web">
            <div className="fh-vmain">
              <div className="l">Your website, live</div>
              <div className="amt sm">apexroofing.com</div>
              <div className="fh-trend">Your own domain &middot; 4.9&#9733; &middot; 850+ jobs</div>
            </div>
            <div className="fh-vis fh-web">
              <div className="wb">
                <i />
                <i />
                <i />
                <span>apexroofing.com</span>
              </div>
              <div className="wc">
                <b>
                  A roof that <em>shrugs off</em> the sky
                </b>
                <span className="cta">Free quote &rarr;</span>
              </div>
            </div>
          </div>

          {/* Quotes & e-sign */}
          <div className="fh-view v-quotes" data-view="quotes">
            <div className="fh-vmain">
              <div className="l">Quote signed &amp; paid</div>
              <div className="amt">$2,140</div>
              <div className="fh-trend">Signed on a phone &middot; deposit in</div>
            </div>
            <div className="fh-vis fh-sign">
              <svg viewBox="0 0 200 44" aria-hidden="true">
                <path d="M8 32 C20 12 30 12 34 30 S46 40 52 26 C58 16 66 16 70 32 C76 44 90 4 102 22 C110 34 120 34 132 24 C150 12 168 34 186 18" />
              </svg>
              <span className="stamp">✓ Signed</span>
            </div>
          </div>

          {/* Reviews */}
          <div className="fh-view v-reviews" data-view="reviews">
            <div className="fh-vmain">
              <div className="l">Reviews on Google</div>
              <div className="amt">4.9&#9733;</div>
              <div className="fh-trend">Auto-requested after every job</div>
            </div>
            <div className="fh-vis fh-stars">
              <div className="s">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
              <div className="c">128 reviews &middot; 96% response</div>
            </div>
          </div>
        </div>

        <div className="fh-grid">
          <div className="fh-cell pri" data-view="ai">
            <span className="ic">
              <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" /><path d="M8 10h8M8 13h5" /></svg>
            </span>
            <div className="m">
              <b>AI Estimator <span className="star">★</span></b>
              <small>Prices leads instantly</small>
            </div>
            <span className="fh-tag">24/7</span>
          </div>
          <div className="fh-cell" data-view="web">
            <span className="ic">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" /></svg>
            </span>
            <div className="m">
              <b>Website</b>
              <small>Your own domain</small>
            </div>
            <span className="fh-tag">Live</span>
          </div>
          <div className="fh-cell" data-view="quotes">
            <span className="ic">
              <svg viewBox="0 0 24 24"><path d="M4 20l4-1L18 8a2 2 0 0 0-3-3L5 15z" /><path d="M14 6l3 3" /></svg>
            </span>
            <div className="m">
              <b>Quotes &amp; e-sign</b>
              <small>Signed on a phone</small>
            </div>
            <span className="fh-tag">✓</span>
          </div>
          <div className="fh-cell" data-view="reviews">
            <span className="ic">
              <svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z" /></svg>
            </span>
            <div className="m">
              <b>Reviews &rarr; Google</b>
              <small>Auto-requested</small>
            </div>
            <span className="fh-tag">4.9★</span>
          </div>
        </div>
      </div>
    </div>
      <p className="fh-samplenote">
        Sample dashboard &mdash; illustrative data, not a real customer. <a href="/demo">See the live demo &rarr;</a>
      </p>
    </div>
  );
}
