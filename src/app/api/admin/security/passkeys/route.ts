import { NextResponse } from 'next/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import {
  AdminPasskeyError, getAdminPasskeyOrigin, getAdminPasskeyStatus,
  beginAdminPasskeyRegistration, finishAdminPasskeyRegistration,
  beginAdminPasskeyAuthentication, finishAdminPasskeyAuthentication, removeAdminPasskey,
} from '@/lib/admin-passkeys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' },
});
function failure(error: unknown) {
  return error instanceof AdminPasskeyError
    ? json({ error: error.message }, error.status)
    : json({ error: 'Could not verify your security session. Try again.' }, 503);
}

export async function GET() {
  const context = await requireAdmin();
  try {
    const supabase = await createSupabaseServerClient();
    const [status, assurance] = await Promise.all([
      getAdminPasskeyStatus(context, supabase).catch((error: unknown) => {
        // An unavailable passkey store must not prevent provider TOTP recovery.
        // Keep authentication failures and unexpected errors fail-closed.
        if (error instanceof AdminPasskeyError && error.status === 503) {
          return { passkeys: [], verified: false, verifiedUntil: null, passkeysUnavailable: true };
        }
        throw error;
      }),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (assurance.error || !assurance.data) return json({ error: 'Could not check your authenticator session.' }, 503);
    return json({ ...status, userId: context.userId, providerLevel: assurance.data.currentLevel });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  try {
    if (request.headers.get('origin') !== getAdminPasskeyOrigin()) return json({ error: 'Open Security on the main app website to use passkeys.' }, 403);
    if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return json({ error: 'Expected a JSON request.' }, 415);
    const raw = await request.text();
    if (raw.length > 65_536) return json({ error: 'Passkey response is too large.' }, 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch { return json({ error: 'Invalid passkey request.' }, 400); }
    if (body.expectedUserId !== context.userId) return json({ error: 'Your signed-in account changed. Reload Security before continuing.' }, 409);
    if (!await checkRateLimitStrict(context.admin, `admin-passkeys:${context.userId}`, 40, 300)) return json({ error: 'Too many attempts. Wait a few minutes and try again.' }, 429);
    const supabase = await createSupabaseServerClient();
    switch (body.action) {
      case 'register-options':
        if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 80) return json({ error: 'Enter a passkey name of 1–80 characters.' }, 400);
        return json(await beginAdminPasskeyRegistration(context, supabase, { label: body.label.trim() }));
      case 'register-verify':
      case 'authenticate-verify': {
        if (typeof body.challengeId !== 'string' || !body.challengeId || body.challengeId.length > 64 || !body.response || typeof body.response !== 'object' || Array.isArray(body.response)) return json({ error: 'Invalid passkey response.' }, 400);
        const result = body.action === 'register-verify'
          ? await finishAdminPasskeyRegistration(context, supabase, { challengeId: body.challengeId, response: body.response as RegistrationResponseJSON })
          : await finishAdminPasskeyAuthentication(context, supabase, { challengeId: body.challengeId, response: body.response as AuthenticationResponseJSON });
        await logAdminAction(context.admin, context, {
          action: body.action === 'register-verify' ? 'security.passkey.enroll' : 'security.passkey.verify',
          targetType: 'staff_user', targetId: context.userId,
        });
        return json(result);
      }
      case 'authenticate-options':
        return json(await beginAdminPasskeyAuthentication(context, supabase));
      case 'remove':
        if (typeof body.credentialId !== 'string' || !body.credentialId || body.credentialId.length > 2048) return json({ error: 'Invalid passkey.' }, 400);
        await removeAdminPasskey(context, supabase, body.credentialId);
        await logAdminAction(context.admin, context, { action: 'security.passkey.remove', targetType: 'staff_user', targetId: context.userId });
        return json({ removed: true });
      default: return json({ error: 'Unknown passkey action.' }, 400);
    }
  } catch (error) { return failure(error); }
}
