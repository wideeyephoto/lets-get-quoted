import webpush from 'web-push';
import { createAdminClient } from '@/lib/auth';

// Web Push for the crew field app. Everything here is best-effort and degrades to
// a no-op when VAPID keys aren't configured (so the app runs fine in an env
// without push set up). Subscriptions are stored/read through the service-role
// admin client — the field subscribe action verifies the crew session first.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@letsgetquoted.com';

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    console.error('Web Push VAPID config invalid:', err instanceof Error ? err.message : err);
  }
}

// True only when VAPID keys are present AND valid — callers can skip work / hide UI.
export function isPushConfigured(): boolean {
  return configured;
}

export type PushSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

// Upsert a browser's subscription for a crew member, keyed on the endpoint (a
// device re-subscribing overwrites its old row rather than duplicating).
export async function savePushSubscription(
  accountId: string,
  crewId: string,
  sub: PushSubscriptionJson,
  userAgent?: string | null,
): Promise<void> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Invalid push subscription.');
  const admin = createAdminClient();
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        account_id: accountId,
        crew_id: crewId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    );
  if (error) throw error;
}

// Remove a subscription (crew turned notifications off, or an expired endpoint).
export async function deletePushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  const admin = createAdminClient();
  await admin.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

// Send a push to every device a crew member has enabled. Prunes endpoints the
// push service reports as gone (404/410). Never throws: a notification failure
// must never sink the action that triggered it.
export async function sendPushToCrew(accountId: string, crewId: string | null | undefined, payload: PushPayload): Promise<number> {
  if (!configured || !crewId) return 0;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('account_id', accountId)
    .eq('crew_id', crewId);
  if (error || !data || data.length === 0) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  for (const row of data) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint as string, keys: { p256dh: row.p256dh as string, auth: row.auth as string } },
        body,
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // The subscription is dead — drop it so we stop trying.
        await admin.from('push_subscriptions').delete().eq('endpoint', row.endpoint as string);
      } else {
        console.error(`Push send failed for crew ${crewId} (status ${statusCode ?? '?'}):`, err instanceof Error ? err.message : err);
      }
    }
  }
  return sent;
}
