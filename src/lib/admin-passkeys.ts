import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

export type PasskeyContext = { admin: SupabaseClient; userId: string; adminEmail: string };
export type AdminPasskeyStatus = {
  passkeys: { id: string; label: string; createdAt: string; lastUsedAt: string | null }[];
  verified: boolean;
  verifiedUntil: string | null;
};

export class AdminPasskeyError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'AdminPasskeyError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRODUCTION_ORIGIN = 'https://app.letsgetquoted.com';
const ALGORITHMS = [-7, -257];
type VerifiedSession = { sessionId: string; providerTotp: boolean };
type Challenge = { id: string; challenge: string; rp_id: string; origin: string };
type Credential = {
  id: string; user_id: string; label: string; public_key: string; counter: number;
  revision: number; transports: AuthenticatorTransport[]; rp_id: string;
  created_at: string; last_used_at: string | null;
};

/** Never derive WebAuthn trust from request Host, forwarded headers, or the browser. */
export function adminPasskeyRelyingParty() {
  const configured = process.env.ADMIN_PASSKEY_ORIGIN?.trim() || PRODUCTION_ORIGIN;
  if (configured === PRODUCTION_ORIGIN) return { origin: PRODUCTION_ORIGIN, rpID: 'app.letsgetquoted.com' };
  let url: URL;
  try { url = new URL(configured); } catch { throw new AdminPasskeyError('Passkey origin is not configured correctly.', 503); }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
    || url.protocol !== 'http:' || url.hostname !== 'localhost'
    || url.origin !== configured || url.username || url.password) {
    throw new AdminPasskeyError('Passkeys are available on app.letsgetquoted.com.', 503);
  }
  return { origin: url.origin, rpID: url.hostname };
}

export function getAdminPasskeyOrigin(): string {
  return adminPasskeyRelyingParty().origin;
}

async function rpc<T>(context: PasskeyContext, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await context.admin.rpc(name, args);
  if (error) {
    if (error.code === '23505') throw new AdminPasskeyError('That passkey is already registered. Use another passkey.');
    if (error.code === '54000') throw new AdminPasskeyError('Too many passkeys or attempts. Remove an unused passkey or try again shortly.', 429);
    if (error.code === '40001') throw new AdminPasskeyError('The passkey changed during verification. Please try again.', 409);
    if (error.code === '42501') throw new AdminPasskeyError('This verification expired or is no longer authorized. Verify your authenticator and try again.', 403);
    throw new AdminPasskeyError('Passkey security is temporarily unavailable. Use your authenticator code or try again.', 503);
  }
  return data as T;
}

/** getSession is used only to retrieve the token; all authorization uses verified claims. */
async function verifiedSession(context: PasskeyContext, supabase: SupabaseClient, requireTotp = false): Promise<VerifiedSession> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) throw new AdminPasskeyError('Sign in again to manage your passkeys.', 401);
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims;
  const sessionId = claims?.session_id;
  if (error || !claims || claims.sub !== context.userId || typeof sessionId !== 'string' || !UUID.test(sessionId)
    || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new AdminPasskeyError('Your account or session changed. Sign in again and retry.', 401);
  }
  const providerTotp = claims.aal === 'aal2' && Array.isArray(claims.amr)
    && claims.amr.some((entry) => typeof entry === 'object' && entry !== null && entry.method === 'totp');
  if (requireTotp && !providerTotp) {
    throw new AdminPasskeyError('Verify your authenticator code before adding a passkey. It also provides your backup method.', 403);
  }
  const active = await rpc<boolean>(context, 'admin_passkey_session_active', {
    p_user_id: context.userId, p_session_id: sessionId, p_require_totp: requireTotp,
  });
  if (!active) throw new AdminPasskeyError('Your session is no longer active. Sign in and verify your authenticator again.', 401);
  return { sessionId, providerTotp };
}

async function credentials(context: PasskeyContext): Promise<Credential[]> {
  const { data, error } = await context.admin.from('admin_passkey_credentials')
    .select('id,user_id,label,public_key,counter,revision,transports,rp_id,created_at,last_used_at')
    .eq('user_id', context.userId).order('created_at', { ascending: true });
  if (error) throw new AdminPasskeyError('Passkeys could not be loaded. Your authenticator code is still available.', 503);
  return (data ?? []) as Credential[];
}

async function grantUntil(context: PasskeyContext, sessionId: string) {
  return rpc<string | null>(context, 'admin_passkey_grant_status', { p_user_id: context.userId, p_session_id: sessionId });
}

export async function getAdminPasskeyStatus(context: PasskeyContext, supabase: SupabaseClient): Promise<AdminPasskeyStatus> {
  const session = await verifiedSession(context, supabase);
  const [all, until] = await Promise.all([credentials(context), grantUntil(context, session.sessionId)]);
  const verifiedUntil = typeof until === 'string' && Date.parse(until) > Date.now() ? until : null;
  return {
    passkeys: all.map(({ id, label, created_at, last_used_at }) => ({ id, label, createdAt: created_at, lastUsedAt: last_used_at })),
    verified: verifiedUntil !== null,
    verifiedUntil,
  };
}

/** Authorization failure (including missing schema/provider errors) always denies the app proof. */
export async function hasAdminPasskeyGrant(context: PasskeyContext, supabase: SupabaseClient): Promise<boolean> {
  try {
    const session = await verifiedSession(context, supabase);
    const until = await grantUntil(context, session.sessionId);
    return typeof until === 'string' && Date.parse(until) > Date.now();
  } catch { return false; }
}

async function saveChallenge(context: PasskeyContext, sessionId: string, purpose: 'register' | 'authenticate', challenge: string, label: string | null = null) {
  const { origin, rpID } = adminPasskeyRelyingParty();
  return rpc<string>(context, 'admin_passkey_begin_challenge', {
    p_user_id: context.userId, p_session_id: sessionId, p_purpose: purpose,
    p_challenge: challenge, p_rp_id: rpID, p_origin: origin, p_label: label,
  });
}

async function consumeChallenge(context: PasskeyContext, sessionId: string, id: string, purpose: 'register' | 'authenticate') {
  if (!UUID.test(id)) throw new AdminPasskeyError('Start a new passkey verification.');
  const data = await rpc<Challenge[]>(context, 'admin_passkey_consume_challenge', {
    p_id: id, p_user_id: context.userId, p_session_id: sessionId, p_purpose: purpose,
  });
  const challenge = data?.[0];
  const { origin, rpID } = adminPasskeyRelyingParty();
  if (!challenge || challenge.origin !== origin || challenge.rp_id !== rpID) {
    throw new AdminPasskeyError('This passkey request expired or was already used. Please try again.', 409);
  }
  return challenge;
}

export async function beginAdminPasskeyRegistration(context: PasskeyContext, supabase: SupabaseClient, input: { label?: string } = {}) {
  const session = await verifiedSession(context, supabase, true);
  const label = (input.label ?? 'Passkey').trim();
  if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) throw new AdminPasskeyError('Give this passkey a name of 1 to 80 characters.');
  const all = await credentials(context);
  if (all.length >= 10) throw new AdminPasskeyError('Remove an unused passkey before adding another.', 409);
  const { rpID } = adminPasskeyRelyingParty();
  const options = await generateRegistrationOptions({
    rpName: "Let's Get Quoted Admin", rpID, userName: context.adminEmail,
    userID: new TextEncoder().encode(context.userId),
    attestationType: 'none', supportedAlgorithmIDs: ALGORITHMS,
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: all.filter((item) => item.rp_id === rpID).map(({ id, transports }) => ({ id, transports })),
    timeout: 60000,
  });
  const challengeId = await saveChallenge(context, session.sessionId, 'register', options.challenge, label);
  return { challengeId, options };
}

export async function finishAdminPasskeyRegistration(context: PasskeyContext, supabase: SupabaseClient, input: { challengeId: string; response: RegistrationResponseJSON }) {
  const session = await verifiedSession(context, supabase, true);
  const challenge = await consumeChallenge(context, session.sessionId, input.challengeId, 'register');
  let result;
  try {
    result = await verifyRegistrationResponse({
      response: input.response, expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin, expectedRPID: challenge.rp_id,
      requireUserPresence: true, requireUserVerification: true, supportedAlgorithmIDs: ALGORITHMS,
    });
  } catch {
    throw new AdminPasskeyError('The passkey could not be verified. Start again and approve the prompt on your device.');
  }
  if (!result.verified || !result.registrationInfo.userVerified) throw new AdminPasskeyError('Your device must verify you before this passkey can be added.');
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const id = await rpc<string>(context, 'admin_passkey_finish_registration', {
    p_challenge_id: challenge.id, p_user_id: context.userId, p_session_id: session.sessionId,
    p_credential_id: credential.id, p_public_key: Buffer.from(credential.publicKey).toString('base64url'),
    p_counter: credential.counter, p_transports: credential.transports ?? [],
    p_device_type: credentialDeviceType, p_backed_up: credentialBackedUp,
  });
  return { id };
}

export async function beginAdminPasskeyAuthentication(context: PasskeyContext, supabase: SupabaseClient) {
  const session = await verifiedSession(context, supabase);
  const { rpID } = adminPasskeyRelyingParty();
  const all = (await credentials(context)).filter((item) => item.rp_id === rpID);
  if (!all.length) throw new AdminPasskeyError('Add a passkey first, or use your authenticator code.', 409);
  const options = await generateAuthenticationOptions({
    rpID, userVerification: 'required', timeout: 60000,
    allowCredentials: all.map(({ id, transports }) => ({ id, transports })),
  });
  const challengeId = await saveChallenge(context, session.sessionId, 'authenticate', options.challenge);
  return { challengeId, options };
}

export async function finishAdminPasskeyAuthentication(context: PasskeyContext, supabase: SupabaseClient, input: { challengeId: string; response: AuthenticationResponseJSON }) {
  const session = await verifiedSession(context, supabase);
  const challenge = await consumeChallenge(context, session.sessionId, input.challengeId, 'authenticate');
  const all = await credentials(context);
  const credential = all.find((item) => item.id === input.response?.id && item.rp_id === challenge.rp_id);
  if (!credential) throw new AdminPasskeyError('This passkey is not registered to your account.', 403);
  // With allowCredentials, authenticators may omit userHandle. If supplied it
  // must be the handle assigned to this signed-in account during registration.
  const handle = input.response.response?.userHandle;
  if (handle && handle !== Buffer.from(context.userId).toString('base64url')) {
    throw new AdminPasskeyError('This passkey belongs to a different account.', 403);
  }
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: input.response, expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin, expectedRPID: challenge.rp_id,
      requireUserVerification: true,
      credential: {
        id: credential.id, publicKey: new Uint8Array(Buffer.from(credential.public_key, 'base64url')),
        counter: Number(credential.counter), transports: credential.transports,
      },
    });
  } catch {
    throw new AdminPasskeyError('The passkey could not be verified. Please try again or use your authenticator code.');
  }
  if (!result.verified || !result.authenticationInfo.userVerified) throw new AdminPasskeyError('Your device must verify you to continue.');
  const verifiedUntil = await rpc<string>(context, 'admin_passkey_finish_authentication', {
    p_challenge_id: challenge.id, p_user_id: context.userId, p_session_id: session.sessionId,
    p_credential_id: credential.id, p_expected_counter: credential.counter,
    p_expected_revision: credential.revision, p_new_counter: result.authenticationInfo.newCounter,
    p_backed_up: result.authenticationInfo.credentialBackedUp,
  });
  return { verified: true, verifiedUntil };
}

export async function removeAdminPasskey(context: PasskeyContext, supabase: SupabaseClient, credentialId: string) {
  const session = await verifiedSession(context, supabase);
  if (!credentialId || credentialId.length > 1400) throw new AdminPasskeyError('Choose a registered passkey to remove.');
  if (!session.providerTotp && !(await grantUntil(context, session.sessionId))) {
    throw new AdminPasskeyError('Verify your passkey or authenticator code before removing a passkey.', 403);
  }
  const removed = await rpc<boolean>(context, 'admin_passkey_remove', {
    p_user_id: context.userId, p_session_id: session.sessionId, p_credential_id: credentialId,
  });
  if (!removed) throw new AdminPasskeyError('That passkey is no longer registered to your account.', 404);
  return { removed: true };
}
