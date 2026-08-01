'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRIPE_SETUP_HREF } from '@/components/app-shell';
import styles from '../leads.module.css';

// "You can't send this quote yet" — said at the TOP of the form, before the work,
// rather than under the button after it.
//
// The connect link opens in a new tab on purpose. It used to be an ordinary
// in-app link, so the only route to Stripe threw away everything already typed
// (and tripped the unsaved-changes guard on the way out) — the fastest way to
// lose a half-built quote was to follow the app's own instruction.
//
// Coming back then re-checks. `stripeConnected` is computed on the server at page
// load, so without this the banner would still be sitting there claiming Stripe
// isn't connected a minute after it was. router.refresh() re-renders the server
// tree in place and React keeps this form mounted, so line items, hours and
// checkboxes all survive — the banner and the Send button swap underneath them.

export default function StripeQuoteGate({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  // Refresh only matters while the gate is up; once connected there is nothing
  // left to learn, and re-fetching on every tab focus forever is pure waste.
  const armed = useRef(!connected);
  armed.current = !connected;

  useEffect(() => {
    if (connected) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function recheck() {
      if (!armed.current || document.visibilityState !== 'visible') return;
      setChecking(true);
      router.refresh();
      // The refresh is not awaitable from here; this only clears the spinner so
      // it can't stick on forever if nothing changed.
      timer = setTimeout(() => setChecking(false), 2500);
    }

    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
      if (timer) clearTimeout(timer);
    };
  }, [connected, router]);

  if (connected) return null;

  return (
    <div className={styles.stripeGateBanner} role="status">
      <strong>🔒 Connect Stripe before you send this quote</strong>
      <p>
        Quotes collect payment through Stripe, so deposits and the client&apos;s
        &quot;pay now&quot; button need it connected. You can fill this in first — connecting
        opens in a new tab and your work stays right here.
      </p>
      <div className={styles.stripeGateActions}>
        <a className="btn primary" href={STRIPE_SETUP_HREF} target="_blank" rel="noopener noreferrer">
          Connect Stripe ↗
        </a>
        <button type="button" className="btn ghost" onClick={() => { setChecking(true); router.refresh(); setTimeout(() => setChecking(false), 2500); }}>
          {checking ? 'Checking…' : 'I’ve connected it'}
        </button>
      </div>
    </div>
  );
}
