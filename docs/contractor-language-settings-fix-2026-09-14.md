# Contractor language settings — fix plan

**Date:** 2026-09-14
**Branch the work landed on:** `fix/quick-stop-holes-20260914` (uncommitted)
**Status:** audited, not merged. Items below are ordered by what blocks a merge.

---

## 1. What the audit found

The language feature as written adds four locales, two complete translation
dictionaries, a settings panel, a server action, and 15 passing tests — and
changes exactly one byte of rendered output: the `lang` attribute on `<html>`.

Verified green: `npx vitest run test/i18n-and-language-settings.test.ts`
(15/15), `npm run typecheck` (clean), `npx next lint` on the new files (clean),
dictionary key parity (51 keys × 4 locales, nothing missing or extra). The
Portuguese and French strings are genuine translations, not English copies.

What the tests do not cover is whether the feature does anything.

### D0 — `sites.language` does not exist in the database *(pre-existing)*

`src/lib/sites.ts:51` declares `language?: 'en' | 'es'` on the `Site` type.
There is no such column. Verified against both projects:

```sql
select table_name, column_name from information_schema.columns
where table_schema='public' and (column_name ilike '%language%' or column_name ilike '%locale%');
-- LETSGETQUOTED-DB (prod): only google_lsa_leads.locale
-- staging-db:              only google_lsa_leads.locale  (sites has 28 columns, none named language)
```

So `site?.language` at `src/app/layout.tsx:160` and `:163` is always
`undefined`, and every standalone contractor site has been rendering
`lang="en"` regardless of the language it was built in. Nothing writes the
field either — `options.language` at `src/app/dashboard/sites/actions.ts:357`,
`:797` and `:844` is never populated by any caller. The whole site-language
path is decorative today.

This predates the new work, but it is the foundation the new work assumed
existed, so it has to be fixed first or nothing else stands up.

### D1 — the setting translates nothing

The only consumer of `t()` / `tRecord()` in the codebase is the **homeowner**
job portal, `src/app/client/jobs/[token]/page.tsx:110`, and it resolves locale
from `accept-language` — it never reads the new cookie. No dashboard string is
translated; there are no extracted dashboard strings at all.

The panel's own copy says *"Select the primary language for your contractor
dashboard, navigation, and workspace controls."* That is a promise the code
cannot keep.

### D2 — `<html lang>` now mislabels every root-domain page

`src/app/layout.tsx:169-171` applies the cookie to all non-standalone traffic:
marketing pages, blog, dashboard, and the homeowner portal. The content stays
English, so a screen reader announces English prose in a French voice — worse
for accessibility than the hardcoded `en` it replaced. On the portal it is
inverted: body copy follows `accept-language` while `lang` follows the
contractor's cookie.

### D3 — a third source of truth for "language"

`sites.language` (typed, unbacked), `options.language` (threaded through the
generators, never set), and now a browser cookie. The cookie does not sync
across devices, dies with a cookie clear, and is invisible to every
server-side job — email, SMS, PDF generation, cron.

### D4 — pt/fr are half-supported

Site generation special-cases `'es'` only, so a Portuguese contractor gets
English generated copy, and `Site['language']` cannot hold `'pt' | 'fr'`.

### D5 — hand-rolled radio group, one section below the component that does it right

`src/components/theme-toggle.tsx:26` uses `useRadioGroup` for the full
WAI-ARIA contract — one tab stop, arrow keys, Home/End, wrapping.
`LanguageSettingsSection.tsx` hand-rolls `role="radio"` buttons: four tab
stops, no arrow keys, no Home/End. `src/components/use-radio-group.ts` exists
precisely because this mistake was made four times before.

### D6 — off-palette styling

`--accent-subtle`, `--border-color`, `--success`, `--danger` and `--radius` are
not defined anywhere in the app, so every fallback fires. The selected card
washes **blue** `rgba(2,132,199,0.08)` in an app whose `--accent` is orange
`#ff7a21`; "Saved" is `#16a34a` rather than `--good` (`#3dd68c`); the error is
`#dc2626` rather than `--bad`.

### D7 — nits

- `revalidatePath('/dashboard', 'layout')` does not reach the root layout where
  `lang` is stamped, and both routes are already dynamic (they read
  `cookies()`), so both calls are no-ops.
- The client writes the cookie before the server authorizes, so a user without
  `settings.write` flips their own UI for one render before the throw reverts
  it. Cosmetic, no data exposure.
- Cookie is named `lgq_locale`; the house convention is hyphenated —
  `lgq-theme`, `lgq-sys` (`src/lib/theme.ts:24,40`).

---

## 2. The decision that shapes the rest

Two different features got merged into one toggle:

| | **A. Operator UI language** | **B. Customer-facing language** |
|---|---|---|
| Who sees it | the contractor, in the dashboard | homeowners, on the portal and public site |
| Correct scope | per user / per device | per site, in the database |
| Work required | extract thousands of dashboard strings | ~1 day; the 51-key dictionary already covers the portal |
| Value today | none until extraction is done | immediate — Spanish-speaking customers exist now |

**Recommendation: build B now, park A.** B is the one the existing dictionary
was written for (see the header of `src/lib/i18n/en.ts`: *"English strings for
the client job dashboard (/client/jobs/[token])"*), it is the one with revenue
attached, and it is finishable this week. A is a quarter of work that should
not be implied by a toggle until someone commits to it.

Everything in §3–§5 assumes that choice. If you would rather keep A, skip to §7.

---

## 3. P0 — before this can merge

### P0-1 · Stop the panel promising dashboard translation

**File:** `src/app/dashboard/settings/LanguageSettingsSection.tsx`
Retitle to **"Customer language"**. Replace the body copy with what will
actually be true after P1: *"The language your customers read on quotes,
invoices, and your public site. Your dashboard stays in English."*
**Done when:** no string in the panel refers to the dashboard, navigation, or
workspace controls.

### P0-2 · Revert the root-layout `lang` override

**File:** `src/app/layout.tsx:168-171`
Delete the non-standalone cookie branch. Marketing, blog and dashboard render
English; labelling them `fr` helps nobody and actively harms screen-reader
users. The standalone branch stays and starts working for real at P1-1.
**Done when:** `siteLanguage` is only ever set from the site row.

### P0-3 · Delete the cookie machinery

**Files:** `src/lib/i18n.ts`, `src/app/dashboard/settings/actions.ts`,
`src/app/dashboard/settings/page.tsx`, `LanguageSettingsSection.tsx`
Remove `LOCALE_COOKIE`, `LOCALE_COOKIE_MAX_AGE`, `localeCookieString`, the
`document.cookie` writes, and the `cookies()` read in the settings page. P1
replaces it with a DB read. Keep `Locale`, `SUPPORTED_LOCALES`,
`isSupportedLocale`, `parseLocale`.
**Why not keep it as a cache:** nothing reads it on a hot path yet.
Reintroduce it as a DB mirror in P3 if and when the dashboard is translated,
using the `THEME_SYSTEM_COOKIE` pattern.
**Done when:** `grep -rn "lgq_locale" src test` returns nothing.

---

## 4. P1 — make the setting mean something

### P1-1 · Migration: add the column that was always assumed

**New file:** `migrations/20260914180000_sites_language.sql`

```sql
-- sites.language: the language a contractor's CUSTOMERS read.
--
-- src/lib/sites.ts has declared this field since the i18n work landed and the
-- column was never created, so src/app/layout.tsx has been reading undefined
-- and stamping lang="en" on every standalone site regardless of the language
-- it was built in. Backfill is 'en' because that is what has effectively been
-- rendering all along.
alter table public.sites
  add column if not exists language text not null default 'en';

alter table public.sites
  drop constraint if exists sites_language_check;

alter table public.sites
  add constraint sites_language_check
  check (language in ('en', 'es', 'pt', 'fr'));
```

Apply to staging first, then prod. No RLS change: `sites` is already
account-scoped and the column carries no new exposure.
**Done when:** the `information_schema` query in D0 returns `sites.language`
on both projects.

### P1-2 · Widen the type

**File:** `src/lib/sites.ts:51`
`language?: 'en' | 'es'` → `language: Locale` (import from `@/lib/i18n`; the
column is `not null default 'en'`, so the optional marker is wrong too).
**Done when:** `npm run typecheck` is clean and no call site coerces.

### P1-3 · Server action writes the row, not a cookie

**File:** `src/app/dashboard/settings/actions.ts:1395`

```ts
export async function updateLanguagePreferenceAction(locale: unknown) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  if (!isSupportedLocale(locale)) throw new Error('Unsupported language');

  const { error } = await supabase
    .from('sites')
    .update({ language: locale })
    .eq('account_id', accountId);
  if (error) throw new Error('Could not save language');

  revalidatePath('/dashboard/settings');
  return { ok: true, locale };
}
```

Match the surrounding actions in this file for error shape and for whether they
use the context's `supabase` or `createAdminClient()` — follow the neighbours
rather than the sketch above.
**Done when:** the choice survives a logout, a different browser, and a cookie
clear.

### P1-4 · The portal prefers the contractor's choice

**File:** `src/app/client/jobs/[token]/page.tsx:110,146`
Line 146 already selects from `sites` by `account_id` — widen it to
`.select('content, language')`. Then resolve:

```ts
const locale = parseLocale(siteRow?.language) ?? detectLocale(hdrs.get('accept-language'));
```

The site row is fetched *after* the current `detectLocale` call, so the four
label maps built at lines 111-115 move below the `Promise.all`. Keep
`accept-language` as the fallback: a contractor who never touches the setting
still gets browser-matched copy, which is today's behaviour.
**Done when:** a site set to `pt` renders the portal in Portuguese for a
browser sending `accept-language: en-US`.

### P1-5 · Settings page reads the row

**File:** `src/app/dashboard/settings/page.tsx:106-107`
Drop the `cookies()` read; take the locale from the `site` record already
loaded on that page (`site?.language ?? 'en'`) and pass it as `initialLocale`.
**Done when:** the panel shows the persisted choice on a fresh browser.

### P1-6 · Standalone `<html lang>` starts working

**File:** `src/app/layout.tsx:155-164`
No code change needed once P1-1 lands — but confirm
`getCachedPublicSiteBySubdomain` / `getCachedPublicSiteByCustomDomain` actually
select `language`. If they use an explicit column list rather than `*`, add it.
**Done when:** a standalone site with `language='es'` renders `<html lang="es">`.

---

## 5. P2 — quality, same PR or the one after

### P2-1 · Use the keyboard hook that already exists

**File:** `LanguageSettingsSection.tsx`
Adopt `useRadioGroup` exactly as `src/components/theme-toggle.tsx:26-47` does:
build the value list, spread `getOptionProps(option.code)` onto each button,
drop the hand-written `role` / `aria-checked` / `onClick`.
**Done when:** Tab enters the group once and arrow keys move and select.

### P2-2 · Real tokens, real classes

**Files:** `LanguageSettingsSection.tsx`, `src/app/globals.css:50874`
Either reuse `.theme-choice` / `.theme-choice-opt.is-on` or add a
`.language-choice` block beside it. Replace every invented variable:
`--accent-subtle` → `rgba(255, 122, 33, 0.08)` or `--bg-soft`;
`--border-color` → `--line`; `--text-muted` → `--muted`; `--success` →
`--good`; `--danger` → `--bad`; `--radius` → the literal the neighbouring
cards use. Check the result in Light and Sunlight, not only Dark.
**Done when:** no `var(--x, #hardcoded)` fallback remains in the file.

### P2-3 · Teach the generators pt/fr

**File:** `src/app/dashboard/sites/actions.ts:357,797,844`
Replace the three `=== 'es'` checks with a lookup keyed by locale, and pass
`site.language` from the callers — which today pass nothing, so this is also
the fix for `options.language` being permanently undefined.
**Done when:** generating copy for a `fr` site produces French.

### P2-4 · Tests for the parts that were never covered

**File:** `test/i18n-and-language-settings.test.ts`
The existing 15 stay, minus the cookie cases removed in P0-3. Add:

1. the action persists to `sites`, and rejects unsupported input *before* writing;
2. a caller without `settings.write` is rejected;
3. portal locale resolution — site row wins over `accept-language`, falls back when null;
4. key parity asserted in *both* directions, so an extra key in `fr.ts` also fails;
5. every `SUPPORTED_LOCALES` code satisfies the DB check constraint.

Run: `npx vitest run test/i18n-and-language-settings.test.ts test/dashboard-sites-and-settings.test.ts`

---

## 6. P3 — only if the dashboard is ever actually translated

Not scheduled. When someone commits to it, the shape is: extract dashboard
strings into a namespaced key set (an order of magnitude larger than the 51
portal keys), add a **per-user** `language` column — not per-account; two
people share one account and may not share a language — and mirror it into an
`lgq-lang` cookie so the root layout can stamp `lang` without a query per
render, exactly as `THEME_SYSTEM_COOKIE` does. Only at that point does
`<html lang>` on the dashboard become true, and only then does the reverted
P0-2 branch come back.

---

## 7. If you keep the cookie approach instead

Minimum honest version, if B is not wanted:

1. P0-1 (reword) — mandatory either way.
2. Scope the `lang` override to the dashboard subtree instead of the root
   layout, so it stops mislabelling the marketing site and the portal.
3. P2-1 and P2-2 still apply.
4. Fix D0 anyway — the phantom `sites.language` type is a live trap regardless.

This ships a preference that still translates nothing, so prefer §3–§5.

---

## 8. Verification checklist

```bash
npm run typecheck
npx vitest run test/i18n-and-language-settings.test.ts test/dashboard-sites-and-settings.test.ts
npx next lint --file src/app/dashboard/settings/LanguageSettingsSection.tsx \
              --file src/lib/i18n.ts --file src/app/layout.tsx
grep -rn "lgq_locale" src test          # expect no results after P0-3
```

Manual, after P1:

- set the language to Português in Settings → Account, log out, sign in on another browser → still Português
- open a client job link with `accept-language: en-US` → portal renders Portuguese
- open the marketing site → `<html lang="en">`
- tab into the language group → one stop, arrows move and select
- switch to Light and Sunlight → the selected card is orange-tinted, not blue

---

## 9. Rollback

P0 alone is safe to ship and reverts the risky part (D2) with no migration.
P1-1 is additive with a default, so the column can stay if the rest is
reverted. Nothing in this plan drops or rewrites existing data.
