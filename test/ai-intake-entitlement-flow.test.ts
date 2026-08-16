import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const ROUTE = read('src', 'app', 'api', 'public', 'leads', 'classify-estimate', 'route.ts');
const USAGE = read('src', 'lib', 'billing', 'ai-intake-usage.ts');
const HERO = read('src', 'lib', 'templates', 'HeroQuickForm.tsx');
const BOOKING = read('src', 'app', 'book', '[subdomain]', 'InstantBookFlow.tsx');
const ENV = read('.env.example');

describe('dark AI Intake entitlement flow wiring', () => {
  it('resolves the published site and reserves before any paid OpenAI request', () => {
    expect(ROUTE.indexOf(".eq('published', true)")).toBeGreaterThan(-1);
    expect(ROUTE.indexOf('beginAiIntakeUsage(admin')).toBeGreaterThan(ROUTE.indexOf(".eq('published', true)"));
    expect(ROUTE.indexOf("fetch('https://api.openai.com/v1/responses'")).toBeGreaterThan(ROUTE.indexOf('beginAiIntakeUsage(admin'));
    expect(ROUTE).toContain("checkRateLimitStrict(admin, `ai-intake:new:${site.id}:${ip}`, 6, 60 * 60)");
    expect(ROUTE).toContain("checkRateLimitStrict(admin, `ai-intake:new:${site.id}:all`, 10, 60 * 60)");
  });

  it('permits paid work only for the enabled flow bound to that site/account', () => {
    const reserve = ROUTE.indexOf('beginAiIntakeUsage(admin');
    const smartEnabled = ROUTE.indexOf("intakeFlowKind === 'smart_intake' && !siteContent.estimateRanges.enabled");
    const bookingEnabled = ROUTE.indexOf("intakeFlowKind === 'instant_booking' && !postureRow?.instant_book_enabled");
    expect(smartEnabled).toBeGreaterThan(-1);
    expect(bookingEnabled).toBeGreaterThan(-1);
    expect(smartEnabled).toBeLessThan(reserve);
    expect(bookingEnabled).toBeLessThan(reserve);
  });

  it('fail-closes after ten paid provider attempts per hashed thread and counts the forced retry', () => {
    const reserve = ROUTE.indexOf('beginAiIntakeUsage(admin');
    const limiter = ROUTE.indexOf('if (!(await allowAiIntakeProviderAttempt(', reserve);
    const provider = ROUTE.indexOf("fetch('https://api.openai.com/v1/responses'");
    expect(USAGE).toContain('export const AI_INTAKE_PROVIDER_ATTEMPT_LIMIT = 10');
    expect(USAGE).toContain('export const AI_INTAKE_PROVIDER_ATTEMPT_WINDOW_SECONDS = 24 * 60 * 60');
    expect(USAGE).toContain('`ai-intake:provider:${lease.idempotencyKey}`');
    expect(USAGE).toContain('if (!lease) return true');
    expect(limiter).toBeGreaterThan(reserve);
    expect(provider).toBeGreaterThan(limiter);
    expect(ROUTE.match(/await fetchProvider\(/g)).toHaveLength(2);
  });

  it('commits substantive output and releases provider, parsing, or non-substantive failure', () => {
    expect(ROUTE).toContain('await commitAiIntakeUsage(admin, usageLease)');
    expect(ROUTE).toContain("await releaseUsage('non_substantive_result')");
    expect(ROUTE).toContain("await releaseUsage('provider_or_internal_failure')");
    expect(ROUTE).toContain("type: 'classic_fallback'");
  });

  it('keeps the rollout server-only and off by default', () => {
    expect(ENV).toContain('LGQ_AI_INTAKE_USAGE_GATE_ENABLED=0');
    expect(HERO).not.toContain('NEXT_PUBLIC_LGQ_AI_INTAKE');
    expect(BOOKING).not.toContain('NEXT_PUBLIC_LGQ_AI_INTAKE');
  });

  it('sends stable per-flow identities and renders a truthful classic quote fallback in both UIs', () => {
    expect(HERO).toContain("flowKind: 'smart_intake'");
    expect(HERO).toContain("intakeFlowKind: 'smart_intake'");
    expect(HERO).toContain("classicFallback ? 'Request a Free Quote' : estimateLabel");
    expect(HERO).toContain("? 'Request a Free Quote'");
    expect(HERO).toContain('send the normal quote request');

    expect(BOOKING).toContain("flowKind: 'instant_booking'");
    expect(BOOKING).toContain("intakeFlowKind: 'instant_booking'");
    expect(BOOKING).toContain("if (classicFallback) {");
    expect(BOOKING).toContain('Request a quote</SaveButton>');
  });

  it('cannot treat entitlement fallback as instant-book eligible', () => {
    const responseFallback = BOOKING.slice(
      BOOKING.indexOf("if (res.type === 'classic_fallback')"),
      BOOKING.indexOf("if (res.type === 'question')"),
    );
    const fallbackBranch = BOOKING.indexOf('if (classicFallback) {');
    const eligibleBranch = BOOKING.indexOf('// Eligible → self-serve slots.');
    expect(responseFallback).toContain("setPhase('result')");
    expect(responseFallback).not.toContain('evaluate(');
    expect(BOOKING.indexOf('if (!evaluation)')).toBeGreaterThan(fallbackBranch);
    expect(fallbackBranch).toBeGreaterThan(-1);
    expect(eligibleBranch).toBeGreaterThan(fallbackBranch);
    expect(BOOKING.slice(fallbackBranch, eligibleBranch)).toContain('action={submitCallback}');
    expect(BOOKING.slice(fallbackBranch, eligibleBranch)).toContain('steps={CLASSIC_STEPS} current={2}');
    expect(BOOKING.slice(fallbackBranch, eligibleBranch)).not.toContain('action={submitBooking}');
  });

  it('turns malformed, failed, or timed-out estimator transport into classic capture', () => {
    expect(HERO.match(/applyChatResult\(\{ type: 'classic_fallback' \}\)/g)).toHaveLength(3);
    expect(HERO).toContain("!['question', 'estimate', 'classic_fallback'].includes(String(type))");
    expect(BOOKING.match(/await handle\(\{ type: 'classic_fallback' \}\)/g)).toHaveLength(3);
    expect(BOOKING).not.toContain('await evaluate(null, null, false)');
  });
});
