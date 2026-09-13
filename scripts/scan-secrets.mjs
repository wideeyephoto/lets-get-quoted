/**
 * READ ONLY. Is there a real credential committed to this repository?
 *
 * WHY THIS EXISTS.
 * docs/runbooks/secret-rotation-drill.md documents how to rotate every key this
 * product holds, and docs/live-integrations-e2e-audit-2026-09-01.md records a
 * live restricted key that had to be rotated after an audit. Both of those are
 * responses. Nothing ran BEFORE a commit to stop a key going in, so the rotation
 * runbook was the only control, and a rotation runbook only helps once you
 * already know.
 *
 * WHY NOT GITLEAKS.
 * gitleaks-action requires a license for organization-owned repositories and
 * wants full history on every run. A scanner that can hard-fail CI for a
 * licensing reason unrelated to the diff is worse than no scanner, because the
 * first red build teaches everyone to skip the step. This is self-contained,
 * needs no network and no token, and its rules live beside the code they guard.
 *
 * WHAT IT SCANS.
 * Tracked files only, via `git ls-files` — never node_modules, build output or
 * whatever happens to be sitting in the working tree. Binary-ish and vendored
 * paths are skipped outright.
 *
 * HOW IT AVOIDS CRYING WOLF, which is the only thing that decides whether a
 * scanner survives contact with a real repository:
 *
 *   1. Every pattern demands a realistic key BODY, not just a prefix. The docs
 *      in this repo discuss key shapes constantly — `rk_live_…`, `sk_live_…`,
 *      `whsec_...` — and a prefix-only rule would flag all of them forever.
 *   2. CI placeholders are allowlisted by exact value, not by pattern, so
 *      `sk_test_placeholder` passes while a genuine `sk_test_` key does not.
 *   3. .env.example holds bare `NAME=` assignments with no values, so it cannot
 *      trip a body-requiring rule and needs no special case.
 *
 * Exit 0 clean, exit 1 with every finding printed (path, line, rule, redacted
 * match). It never prints the secret it found in full.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const MAX_BYTES = 2 * 1024 * 1024;

const SKIP_PATH = [
  /^package-lock\.json$/,
  /^test-results\.json$/,
  /^schema\.sql$/,
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /\.(png|jpe?g|gif|webp|avif|ico|svg|pdf|woff2?|ttf|eot|mp4|webm|zip|gz)$/i,
];

/**
 * Exact strings that are known-safe and would otherwise match a rule below.
 * Exact values only — never a prefix or a pattern, or the allowlist becomes the
 * hole the scanner was built to close.
 */
const ALLOWLIST = new Set([
  'sk_test_placeholder',
  'rk_test_placeholder',
  'whsec_placeholder',
]);

/** Prefixes stripped before the synthetic check, so only the key BODY is judged. */
const KEY_PREFIX = /^(?:(?:sk|rk)_(?:test|live)_|whsec_|re_)/;

const DUMMY_WORD = /(test|example|placeholder|dummy|fake|sample|wrong|invalid|notreal|changeme|yourkey|secretkey|abcdef)/i;
const SEQUENTIAL = /(01234567|12345678|23456789|abcdefgh)/i;

/**
 * Whether a match is a hand-written stand-in rather than a credential.
 *
 * Judged on the key BODY, never the whole match — the Stripe test-mode prefix is
 * literally `sk_test_`, so testing the full string would silently exempt every
 * real test-mode key, which is still a credential nobody should commit.
 *
 * The base64 leg matters more than it looks: test fixtures encode their dummies
 * (`whsec_dGVzdF9zZWNyZXRfa2V5...` decodes to `test_secret_key_for_svix_...`),
 * and without decoding, each new one has to be allowlisted by hand until someone
 * gets tired and deletes the CI step.
 */
function looksSynthetic(match) {
  const body = match.replace(KEY_PREFIX, '');
  if (DUMMY_WORD.test(body) || SEQUENTIAL.test(body)) return true;

  if (/^[A-Za-z0-9+/]{8,}={0,2}$/.test(body)) {
    try {
      const decoded = Buffer.from(body, 'base64').toString('utf8');
      // Printable ASCII means it decoded to real text, not key bytes.
      if (/^[\x20-\x7E]+$/.test(decoded) && DUMMY_WORD.test(decoded)) return true;
    } catch {
      /* not base64 after all */
    }
  }
  return false;
}

const RULES = [
  {
    id: 'stripe-secret-key',
    // Real Stripe keys carry a long alphanumeric body. Requiring 20+ keeps every
    // `sk_live_…` in the docs from matching while catching anything genuine.
    re: /\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{20,}\b/g,
    what: 'Stripe secret or restricted API key',
  },
  {
    id: 'stripe-webhook-secret',
    re: /\bwhsec_[A-Za-z0-9]{24,}\b/g,
    what: 'Stripe webhook signing secret',
  },
  {
    id: 'jwt',
    // Supabase service-role and anon keys are JWTs. Three real base64url
    // segments, header segment starting `eyJ`.
    re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\b/g,
    what: 'JWT (possible Supabase service-role key)',
  },
  {
    id: 'private-key-block',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    what: 'Private key block',
  },
  {
    id: 'resend-key',
    re: /\bre_[A-Za-z0-9]{24,}\b/g,
    what: 'Resend API key',
  },
  {
    id: 'aws-access-key',
    re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    what: 'AWS access key id',
  },
];

function redact(match) {
  if (match.length <= 12) return `${match.slice(0, 4)}…`;
  return `${match.slice(0, 8)}…${match.slice(-4)} (${match.length} chars)`;
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

function scannable(path) {
  if (SKIP_PATH.some((re) => re.test(path))) return false;
  try {
    if (statSync(path).size > MAX_BYTES) return false;
  } catch {
    return false; // deleted-but-tracked, or unreadable
  }
  return true;
}

function findingsFor(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  if (text.includes('\0')) return []; // binary

  const found = [];
  const lines = text.split('\n');
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i += 1) {
      rule.re.lastIndex = 0;
      for (const m of lines[i].matchAll(rule.re)) {
        if (ALLOWLIST.has(m[0])) continue;
        if (rule.id !== 'private-key-block' && looksSynthetic(m[0])) continue;
        found.push({ path, line: i + 1, rule: rule.id, what: rule.what, match: m[0] });
      }
    }
  }
  return found;
}

function main() {
  const files = trackedFiles().filter(scannable);
  const findings = files.flatMap(findingsFor);

  if (findings.length === 0) {
    console.log(`Secret scan clean — ${files.length} tracked files scanned, ${RULES.length} rules.`);
    return 0;
  }

  console.error(`\nSecret scan FAILED — ${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.path}:${f.line}`);
    console.error(`    ${f.what} [${f.rule}]`);
    console.error(`    ${redact(f.match)}\n`);
  }
  console.error('If a finding is a real credential: rotate it FIRST, then remove it.');
  console.error('Rotation steps: docs/runbooks/secret-rotation-drill.md');
  console.error('If it is a placeholder, add its exact value to ALLOWLIST in this script.\n');
  return 1;
}

process.exit(main());
