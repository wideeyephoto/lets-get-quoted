/**
 * The preflight's public surface.
 *
 * Hand-written rather than generated because the script itself is deliberately
 * plain ESM with no build step -- it has to run from a laptop, a CI box or a
 * recovery shell with nothing but node. This file is what lets the test import
 * it under `tsc --noEmit` without loosening allowJs for the whole project.
 */

/** A name the operating system, and therefore process.env, can actually hold. */
export declare const POSIX_ENV_NAME: RegExp;

/** Names that look like they were meant for the messaging integration. */
export declare const MESSAGING_NAME_HINT: RegExp;

/** The shape the provisioning code demands of the 10DLC callback token. */
export declare const CALLBACK_TOKEN_SHAPE: RegExp;

export type EnvEntry = {
  key: string;
  value: string;
  /** False when the key can never become a process.env property. */
  readable: boolean;
};

/** Parse an env file, KEEPING keys that are not legal environment names. */
export declare function parseEnvEntries(contents: string): EnvEntry[];

/** Messaging credentials present under a name the app can never read. */
export declare function unreadableMessagingNames(entries: EnvEntry[]): string[];

/** Mirrors signalwireConfig() in src/lib/sms-provider.ts. */
export declare function signalwireConfigResolves(
  env: Record<string, string | undefined>,
): { ok: boolean; missing: string[] };

/** Mirrors smsProviderConfig(): an explicit selector never falls back. */
export declare function resolveProvider(
  env: Record<string, string | undefined>,
  signalwireOk: boolean,
  twilioOk: boolean,
): { provider: 'twilio' | 'signalwire' | null; reason: string };

/** The exact callback URLs the provisioning code will accept, or null. */
export declare function expectedWebhooks(
  appUrl: string,
): { inbound: string; status: string; origin: string } | null;

/** The Supabase project ref inside a supabase.co URL, or null. */
export declare function supabaseRefOf(url: string | null | undefined): string | null;

/** `--app-url=https://app.example.com` from argv, or null. */
export declare function appUrlArg(argv: string[]): string | null;
