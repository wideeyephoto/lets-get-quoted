'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from './push-actions';

// Registers the field-app service worker and offers a one-tap notifications
// toggle. The public VAPID key is inlined at build time via NEXT_PUBLIC_*; when
// it's absent (push not configured) the control hides itself entirely.
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

export default function FieldPwa() {
  const [state, setState] = useState<State>('loading');

  // Register the SW once, then reflect the current push-permission/subscription state.
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      Boolean(VAPID_PUBLIC_KEY);
    if (!supported) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js', { scope: '/field' })
      .then(async (reg) => {
        if (Notification.permission === 'denied') return setState('denied');
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? 'granted' : 'default');
      })
      .catch(() => setState('unsupported'));
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
