'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from './push-actions';

// The field app's two browser capabilities, which are NOT the same capability.
//
// This used to gate service-worker registration on PushManager, Notification
// AND a configured VAPID key. Every one of those is about notifications, and
// none of them is about installing an app — but the registration was behind all
// three, so a browser without push support (or a deploy without push keys) got
// no service worker, and with no service worker there is no install prompt, no
// home-screen app and, now, no offline cache. The crew member who most needs the
// app on their home screen is the one on the phone that supports the least.
//
// So: registration happens whenever service workers exist. The notifications
// toggle hides itself when push isn't available, and that is all it does.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = 'unsupported' | 'loading' | 'default' | 'granted' | 'denied' | 'working';

/** Push is a separate question from "can this be an app". */
function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

export default function FieldPwa() {
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }

    // Registration is unconditional, and its failure is not the toggle's
    // business: a worker that won't install costs offline support, not the
    // ability to ask about notifications.
    const registration = navigator.serviceWorker.register('/sw.js', { scope: '/field' });
    registration.catch((err) => console.error('Field service worker registration failed:', err));

    if (!pushSupported()) {
      setState('unsupported');
      return;
    }

    let cancelled = false;
    registration
      .then(async (reg) => {
        if (cancelled) return;
        if (Notification.permission === 'denied') return setState('denied');
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? 'granted' : 'default');
      })
      .catch(() => {
        if (!cancelled) setState('unsupported');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'default');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
        }));
      await subscribeToPushAction(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setState('granted');
    } catch (err) {
      console.error('Enable notifications failed:', err);
      setState('default');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('default');
    } catch (err) {
      console.error('Disable notifications failed:', err);
      setState('granted');
    }
  }, []);

  if (state === 'unsupported' || state === 'loading') return null;

  if (state === 'denied') {
    return (
      <p className="field-push field-push-note">
        🔕 Notifications are blocked in your browser settings. Allow them for this site to get job alerts.
      </p>
    );
  }

  if (state === 'granted') {
    return (
      <div className="field-push field-push-status">
        <span className="field-push-on">🔔 Job notifications on</span>
        <button type="button" className="field-push-link" onClick={disable}>
          Turn off
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="field-push field-push-enable" onClick={enable} disabled={state === 'working'}>
      🔔 {state === 'working' ? 'Turning on…' : 'Turn on job notifications'}
    </button>
  );
}
