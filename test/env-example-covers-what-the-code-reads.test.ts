import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * .env.example is the only description of this app's environment that a person
 * can read. Twenty-one variables the running code reads were missing from it,
 * including SUPABASE_SERVICE_ROLE_KEY -- so an environment provisioned faithfully
 * from that file had every cron worker, every /admin read and every RLS-bypassing
 * write fail, and four HMAC signing keys degrade to the empty string rather than
 * refuse. Nothing failed loudly. The flows kept working, signed with a key anyone
 * can guess.
 *
 * There is an older guard of this shape in test/refund-reconciliation-worker.test.ts
 * ("every billing flag is documented"). It checks flags in src/lib/billing with
 * `env.includes(flag)`. Two things it cannot do, and this file exists for both:
 *
 *  1. It only reads one directory, so LGQ_AI_VOICE_ENABLED and
 *     LGQ_VOICE_RECEIPT_BASIC were outside it. This walks all of src.
 *  2. A substring match answers the wrong question. GOOGLE_MAPS_API_KEY -- the
 *     SERVER Maps key, read at five sites -- was undocumented, yet
 *     `env.includes('GOOGLE_MAPS_API_KEY')` was true the whole time, because
 *     .env.example assigns NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and that name
 *     contains it. Two different keys, one of them referrer-locked and useless
 *     server-side. This parses .env.example into assigned keys instead.
 *
 * The direction is deliberately one-way: everything the code reads must be
 * documented. It does NOT assert the reverse, because DATABASE_URL, the six
 * STRIPE_PRICE_* bindings and the webhook secrets are read by scripts, CI and
 * the preflight suites rather than by src, and are not dead.
 */

const ROOT = process.cwd();

const read = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      sourceFiles(`${dir}/${entry.name}`, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(`${dir}/${entry.name}`);
    }
  }
  return out;
}

/**
 * Supplied by the platform, never by an operator, so documenting them would be
 * noise. Kept short on purpose: a generous allowlist here is how a real secret
 * would get waved through.
 */
const PLATFORM_PROVIDED = new Set([
  'NODE_ENV',
  'CI',
  'VITEST',
  'NEXT_RUNTIME',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_GIT_COMMIT_SHA',
]);

const FILES = [...sourceFiles('src'), 'next.config.mjs'];

function envNamesReadBySource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const note = (name: string, file: string) => {
    const seen = found.get(name);
    if (seen) {
      if (!seen.includes(file)) seen.push(file);
    } else {
      found.set(name, [file]);
    }
  };
  for (const file of FILES) {
    const source = read(file);
    for (const m of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) note(m[1], file);
    for (const m of source.matchAll(/process\.env\[\s*['"`]([A-Z0-9_]+)['"`]\s*\]/g)) note(m[1], file);
    // Flags are declared as a named constant and read through a table lookup, so
    // the name never appears next to `process.env` at all. Single quotes are part
    // of the pattern: prose in this repo quotes flags with backticks, and a flag
    // discussed in a comment is not a flag anything reads.
    for (const m of source.matchAll(/'(LGQ_[A-Z0-9_]+)'/g)) note(m[1], file);
  }
  return found;
}

/** Assigned keys, not "appears somewhere in the file". That distinction is the point. */
function documentedKeys(): Set<string> {
  return new Set([...read('.env.example').matchAll(/^\s*([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]));
}

describe('.env.example describes the environment the code actually needs', () => {
  it('names every variable src reads', () => {
    // Guards the guard: if the walk or the patterns broke, an empty result set
    // would report a clean pass forever.
    expect(FILES.length).toBeGreaterThan(500);
    const read_ = envNamesReadBySource();
    expect(read_.size).toBeGreaterThan(30);

    const documented = documentedKeys();
    expect(documented.size).toBeGreaterThan(60);

    const missing = [...read_.keys()]
      .filter((name) => !PLATFORM_PROVIDED.has(name) && !documented.has(name))
      .sort();

    const detail = missing.map((name) => `${name} (${read_.get(name)!.slice(0, 2).join(', ')})`);
    expect(missing, `undocumented environment variables: ${detail.join('; ')}`).toEqual([]);
  });

  it('compares assigned keys, so a longer name cannot vouch for a shorter one', () => {
    // The specific hole this file was written for. NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    // contains GOOGLE_MAPS_API_KEY, so a substring check called the server key
    // documented while it was absent. Both must be assigned in their own right.
    const documented = documentedKeys();
    expect(documented.has('GOOGLE_MAPS_API_KEY')).toBe(true);
    expect(documented.has('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')).toBe(true);

    // And the parser must not be fooled into treating a mention as a definition.
    const text = read('.env.example');
    expect(text).toContain('GOOGLE_MAPS_API_KEY');
    expect(documented.has('NEXT_PUBLIC_GOOGLE_MAPS_MAP')).toBe(false);
  });

  it('documents the service-role key, whose absence is silent rather than loud', () => {
    // Every read site takes it as `?? ''`. Nothing throws; the HMACs simply start
    // signing with a key anyone can guess. See the comment block in
    // src/lib/lead-verification.ts, which is the same lesson already paid for.
    expect(documentedKeys().has('SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
    const readers = envNamesReadBySource().get('SUPABASE_SERVICE_ROLE_KEY') ?? [];
    expect(readers.length).toBeGreaterThan(2);
  });
});
