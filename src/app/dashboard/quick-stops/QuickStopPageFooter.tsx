'use client';

import { jumpToHowItWorks, jumpToSetup } from './quick-stop-jump';

// The end of the Quick Stops page.
//
// The page pushes people DOWN — "How it works" from the header, "See your own
// past jobs that fit" from the pitch — and the longest panel on it is the last
// one. Somebody who follows either of those and reads to the bottom arrives at
// the one place with nothing to press, having just been shown the argument for
// switching it on. That is the wrong place for a dead end.
//
// So the foot of the page carries the same two actions the top does, plus a way
// back to the top itself. Nothing new is introduced here: every button leads
// somewhere already on this page.

export default function QuickStopPageFooter({ enabled }: { enabled: boolean }) {
  return (
    <section className="panel workspace-section-card qs-foot" aria-label="Quick Stops next steps">
      <div className="qs-foot-copy">
        <strong>{enabled ? 'Anything you want to change?' : 'Ready to try it?'}</strong>
        <p>
          {enabled
            ? 'Your days, hours, fee band and limits all live in the settings block further up this page.'
            : 'Set your days, hours and fee band, then switch it on at the top. Nothing can be requested until both are done.'}
        </p>
      </div>
      <div className="qs-foot-actions">
        <button type="button" className="btn primary" onClick={jumpToSetup}>
          Set up Quick Stop <span aria-hidden="true">↑</span>
        </button>
        <button type="button" className="btn secondary" onClick={jumpToHowItWorks}>
          How it works
        </button>
        {/* Instant, not smooth: this one is "get me out of here", and a
            three-second glide up a long page is the opposite of that. */}
        <button type="button" className="btn ghost" onClick={() => window.scrollTo({ top: 0 })}>
          Back to top
        </button>
      </div>
    </section>
  );
}
