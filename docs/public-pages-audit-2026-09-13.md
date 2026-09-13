# Public Pages Audit — 2026-09-13

Comprehensive audit of every publicly reachable page surface, with suggested fixes.

## Scope and method

**Surface counted.** 260 App Router `page.tsx` files. 150 sit under `/dashboard`, `/admin`
or `/demo` and are out of scope. The remaining **110 public-reachable route files** split as
follows (a route file with a dynamic segment stands for many URLs — the sitemap publishes
**313**):

| Class | Route files | Notes |
| :--- | ---: | :--- |
| Indexable marketing / SEO | 54 | `/`, `/pricing`, `/features/*`, `/for/*`, `/compare/*`, `/tools/*`, `/blog/*`, `/resources/*`, `/help/*`, legal |
| Correctly `noindex` | 26 | 6 homepage variants, 3 mockups, `/login`, `/welcome`, `/track`, `/review`, `/sub`, `/passport`, tenant legal pages |
| `noindex` via middleware header only | 3 | `/pay/[id]`, `/invoice/[id]`, `/client/jobs/[token]` |
| Utility / token, **no** `noindex` signal | 13 | `/schedule/[token]`, `/quick-stop/[id]`, `/unsubscribe`, `/start` — see finding 3 |
| Field crew PWA, **no** `noindex` signal | 8 | `/field`, `/field/login`, … — see finding 3 |
| Tenant site subpages, indexable by design | 5 | served on the contractor's own host |

**How it was checked.** Static analysis over `src/` (metadata chains, layout inheritance,
link and asset resolution, sitemap coverage) plus a live crawl of 60 URLs against a real
Next 15.5.25 server, plus `axe-core` WCAG 2.1 A/AA scans over **8 themes × 25 pages**, plus a
390px mobile pass over 29 pages. Every finding below was reproduced against rendered HTML or
computed styles, not inferred from source.

**What is already correct** (verified, no action needed): all 60 crawled URLs return 200; no
horizontal overflow at 390px on any page; sitemap/robots per-host logic is right; the six
homepage variants, `/demo/*` and the three mockup routes are all correctly `noindex`;
`/features/eta` and `/features/sparky` are alias routes with correct canonicals and are
correctly excluded from the sitemap; `/pay`, `/portal`, `/invoice`, `/client` receive
`X-Robots-Tag: noindex` from middleware; the 404 page returns a real 404; security headers
(CSP with nonce + `strict-dynamic`, HSTS, nosniff, referrer-policy, `frame-ancestors`) are
present on every public response.

---

## P1 — Blocking

### 1. Light-family themes render entire public pages as invisible text

Contrast ratios of **1.01:1** — near-black ink on a near-black panel. Not a borderline AA
miss; the content is not visible at all.

Color-contrast violations per page, by theme (worst ratio in parentheses):

| Route | dark | onyx | dim | light | sunlight | clarity | mono | parchment |
| :--- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `/help` | 1 (3.72) | 1 | 1 | 1 | **60 (1.01)** | 1 | 1 | **60 (1.01)** |
| `/compare` | · | · | · | · | · | · | · | **52 (1.01)** |
| `/tools/estimate-generator` | · | · | · | · | **17 (1.10)** | · | · | **55 (1.02)** |
| `/blog` | 1 (2.59) | 1 | 3 | **41 (1.34)** | 1 | 1 | 1 | 1 |
| `/for` | 14 (2.66) | 14 | 14 | 14 | 14 | 14 | 14 | **22 (1.05)** |
| `/help/manual` | · | · | · | · | 2 (1.12) | · | · | · |
| `/faq` | · | · | · | · | 1 (1.04) | · | · | 1 (1.02) |
| `/tools/leakage-calculator` | · | · | · | · | 1 (1.08) | · | · | 2 (2.52) |
| `/tools/hourly-rate-calculator` | 1 (2.86) | 1 | 1 | 1 | 2 (1.15) | 1 | 1 | 3 (2.52) |

**This is visitor-reachable.** `themeToggleLabel` / `nextTheme` in `src/lib/theme.ts:80-102`
put a one-tap theme rotator in the public marketing header, cycling
`dark → Workbench(light) → Light(sunlight) → Dim`. Two taps from any marketing page reaches
`sunlight`, where the Help Center is blank.

**Root cause**, confirmed by resolving the winning rule in the browser for `/help`'s `<h1>`:

```
:root[data-theme='sunlight'] .chrome-shell h1, … h2, … h3, … h4 { color: #090d16 }
  → src/app/globals.css:70809   specificity (0,2,1)   WINS

.HelpCenter_heroTitle { color: #FFFFFF }
  → src/components/help-center/HelpCenter.module.css:207   specificity (0,1,0)   loses
```

The globals rule was written for the dashboard, where `sunlight` makes the surface light.
But `.chrome-shell` also wraps the public marketing pages, and those pages keep sections that
are dark by design — so dashboard ink lands on a dark panel. Any CSS module that hardcodes
`color: #FFFFFF` on a heading inside a dark section is overridden. The same shape produces the
`/compare` and `/tools/estimate-generator` parchment failures (`#241e17` on `#081a29`).

`/faq` is the mirror image: the global sunlight input rule at `globals.css:71033` explicitly
excludes `[type='search']` and `[class*='search']`, so the FAQ search box keeps its
dark-theme near-white text (`#f8fafc`) on a now-white field — 1.04:1, invisible while typing.

**Suggested fix.**

1. Scope the heading override to the app shell rather than every `.chrome-shell`. The
   marketing pages and the dashboard already render distinguishable wrappers; gate the rule on
   the dashboard one (or add `:not([data-surface='marketing'])` to the selector and stamp
   `data-surface="marketing"` on the marketing shell in `app-shell.tsx`).
2. Convert the affected modules off hardcoded hex onto the theme tokens that already exist —
   `var(--text)`, `var(--bg-2)`, `var(--muted)`. Files: `HelpCenter.module.css`,
   `compare.module.css`, `tools.module.css`, `blog.module.css`, `manual.module.css`,
   `faq.module.css`.
3. Give the FAQ search input an explicit `color: var(--text); background: var(--bg-2)` so it
   does not depend on the global rule it is excluded from.
4. Add a regression test. `vitest-axe` is already a devDependency and `@axe-core/playwright`
   is installed — a contrast scan over the marketing routes in the light themes would have
   caught all of this.

> Note: `LAUNCH_PAGE_INVENTORY.md` records a "full 4-theme WCAG AA contrast audit" passing on
> 2026-09-01. That does not hold today for the light family on these pages.

### 2. The primary CTA colour fails AA in every theme

The orange action button is the most important interactive element on the marketing site and
it fails at normal text size everywhere:

| Element | Foreground / background | Ratio | Needs |
| :--- | :--- | ---: | ---: |
| `/blog` `.blog_ctaButton` | `#eef5f6` on `#ff6a24` | 2.59 | 4.5 |
| `/tools/hourly-rate-calculator` `.tools_calloutBtn` | `#ffffff` on `#ff6a24` | 2.86 | 4.5 |
| `/for` `.for_visualFrameFooter a` | `#f7f7f4` on `#ff6a24` | 2.66 | 4.5 |
| `/changelog` `.changelog_categoryPillActive` | `#ffffff` on `#3b82f6` | 3.67 | 4.5 |
| `/help` `.HelpCenter_faqFeedbackLabel` | `#64748b` on `#0e1a1f` | 3.72 | 4.5 |

**Suggested fix.** Darken the CTA fill to roughly `#b8420a` (white text reaches ≈4.6:1) — the
sunlight palette already defines `--accent: #b43403`, so promoting that value to the shared
token keeps the brand and fixes the ratio in one edit. Alternatively keep `#ff6a24` and switch
the label to near-black `#1a0d00` (≈8.9:1). The `#3b82f6` pill needs `#1d4ed8`; the
`#64748b` label needs `#94a3b8`.

### 3. Token-gated customer pages are indexable

These return **200 with no `noindex` meta tag and no `X-Robots-Tag`**:

| Route | What it renders |
| :--- | :--- |
| `/schedule/[token]` | client name, business name, job ref, client notes |
| `/quick-stop/[id]` | homeowner quick-stop offer |
| `/unsubscribe?token=…` | token decodes to a subscriber email address |
| `/card-saved` | post-card-save confirmation |
| `/office-invite/[token]` | staff invite acceptance |
| `/site-preview-frame` | bare contractor-site render on the platform host (duplicate content) |
| `/field/*` (8 routes) | crew PWA including `/field/login` |

The middleware's `X-Robots-Tag` block (`src/middleware.ts:330-337`) covers only `/client/`,
`/portal/`, `/invoice/` and `/pay/`. `robots.ts` disallows only `/dashboard/`, `/api/`,
`/pay/`, `/admin/`. Sibling surfaces `/track`, `/review`, `/sub` and `/passport` do carry
page-level `noindex`, so the gap is an omission rather than a policy.

**Suggested fix.** Add `/schedule/`, `/quick-stop/`, `/unsubscribe`, `/card-saved`,
`/office-invite/`, `/office-access`, `/site-preview-frame`, `/field/`, `/start`,
`/recover-account` and `/workspaces` to the middleware prefix list, and mirror the customer
and crew prefixes into the `robots.ts` disallow list. Belt-and-braces: give each page a
`robots: { index: false, follow: false }` in its own metadata, the way `/track` and `/review`
already do — a page-level tag survives a middleware matcher change.

---

## P2 — SEO correctness

### 4. `/features/neighborhood-halo` publishes an og:image that 404s

`src/app/features/neighborhood-halo/page.tsx:26,33` names
`/features/og-neighborhood-halo.jpg`, as both `openGraph.images` and `twitter.images`. The
file is not in `public/features/` — confirmed **404**. Every other feature page's
`og-*.jpg` resolves. **Fix:** add the asset, or point both at an existing card.

### 5. Seven URLs publish no og:image at all

`/compare`, all five `/compare/[competitor]` pages, `/tools`, the three `/tools/*`
calculators, `/resources` and `/changelog` render **no `og:image` meta tag**. In Next.js a
page-level `openGraph` object *replaces* the parent's wholesale, so declaring
`openGraph: { title, description, url, type }` without `images` discards the root layout's
`/product/website.webp`. Pages that declare no `openGraph` at all (`/security`, `/contact`,
`/privacy`, `/terms`) correctly inherit it.

These are the highest-intent pages on the site — a competitor comparison shared into a trade
Facebook group renders as a bare text link.

**Fix:** add `images` to each `openGraph`/`twitter` block, or drop an `opengraph-image.tsx`
into those route folders, matching the pattern already used by `/pricing`, `/founder`,
`/how-it-works`, `/for/[trade]` and `/resources/[slug]`.

### 6. Doubled brand suffix in `<title>` — 31 URLs

The root layout sets `template: "%s · Let's Get Quoted"` (`src/app/layout.tsx:98`). Pages whose
own `title` already contains the brand get it twice:

```
/tools/hourly-rate-calculator
  Free Contractor Hourly Rate & Profit Margin Calculator | Let's Get Quoted · Let's Get Quoted
  → 101 characters, truncated in every SERP
```

Affected document titles: `tools/hourly-rate-calculator/page.tsx:6`,
`tools/leakage-calculator/page.tsx:6`, `tools/estimate-generator/page.tsx:9`,
`changelog/page.tsx:8`, `founder/page.tsx:6`, `resources/page.tsx:18`,
`resources/[slug]/page.tsx:33` (×21 articles), `blog/page.tsx:25`,
`blog/[slug]/page.tsx:33`, `status/page.tsx:19`, `features/ai-copilot/page.tsx:5`,
`features/sparky/page.tsx:5`, plus the noindexed `for-mockup`, `website-builder-mockup`,
`features/website-builder-mockup`, `field/intake/[id]` and `login/layout.tsx`.

**Fix:** strip the brand from the page's own `title` and let the template add it. Keep it in
`openGraph.title` / `twitter.title`, which are not templated.

### 7. `/status` declares the homepage as its canonical, and is not in the sitemap

`src/app/status/page.tsx:18` exports `metadata` with only a `title` — no `Metadata` type
annotation, no `description`, no `alternates`. It therefore inherits the root layout's
`canonical: '/'` and tells search engines the status page **is** the homepage. This is the
exact bug `/contact` carries a comment about having already fixed.

**Fix:** `alternates: { canonical: 'https://letsgetquoted.com/status' }`, add a description,
annotate as `Metadata`, and add `/status` to `src/app/sitemap.ts` — it is the only indexable
public marketing URL missing from it.

### 8. Title and description lengths

- **27 crawled public URLs have titles over 60 characters.** Worst: `/features/video-studio`
  (106), `/features/ai-copilot` (102), `/tools/hourly-rate-calculator` (101),
  `/tools/leakage-calculator` (98), `/resources/stop-losing-leads` (94), `/blog` (89). The
  homepage itself is 72.
- **15 have meta descriptions over 160 characters**: `/features/ai-voice` (176),
  `/founder` (173), `/compare/servicetitan-alternative` (173), `/tools/estimate-generator`
  (171), `/help` (171), `/features/video-studio` (170), `/tools` (168), `/for` (166),
  `/dpa` (166), `/features/neighborhood-halo` (166), `/changelog` (165), `/features/ai-ads`
  (165), `/compare` (164), `/features/ai-vision` (161), `/tools/leakage-calculator` (161).
- **`/terms` has no meta description at all** and falls back to the homepage's.

The root layout carries a long comment explaining exactly why 160 characters matters
(`layout.tsx:100-112`); the lesson was never applied to the child pages. **Fix:** trim to ≤60
and ≤155, and give `/terms` its own description.

### 9. Structured data gaps

| Route | Current | Suggested |
| :--- | :--- | :--- |
| `/how-it-works` | none | `HowTo` — the page is literally a step sequence |
| `/help` | none | `FAQPage` + `BreadcrumbList` |
| `/help/manual` | none | `Collection` / `BreadcrumbList` |
| `/tools/hourly-rate-calculator` | **two** `SoftwareApplication` blocks | merge into one |
| `/changelog` | none | optional, low value |

`/pricing`, `/features`, `/faq`, `/for/*`, `/compare/*`, `/resources/*` and `/blog/*` all emit
valid, well-formed JSON-LD — the gaps above are the exceptions.

---

## P3 — Accessibility (non-contrast)

### 10. `/how-it-works` — malformed tablist (2 critical axe rules)

`src/app/how-it-works/hero-job-simulator.tsx:1012`

```tsx
<ol className={styles.journeyList} role="tablist" aria-label="Five connected job stages">
  <li>                                    {/* ← orphaned */}
    <button role="tab" …>                 {/* ← parent is <li>, not the tablist */}
```

`role="tablist"` strips the `<ol>` of its list semantics, so the five `<li>` elements are no
longer in a list (`listitem`, serious, ×5) and the five tabs no longer have a `tablist` parent
(`aria-required-parent`, critical, ×5; `aria-required-children`, critical, ×1).

**Fix:** add `role="presentation"` to each `<li>`. That keeps the visual list and makes the
buttons the tablist's owned children. While there, the tabs have no `aria-controls` and there
is no `role="tabpanel"` — worth adding for screen-reader navigation.

### 11. `/for` — `aria-selected` on plain buttons (critical, ×6)

`src/app/for/ForExperience.tsx:248`

```tsx
<button type="button" className={isSelected ? styles.chipActive : styles.chip}
        aria-selected={isSelected}>          {/* ← not allowed on role=button */}
```

`aria-selected` is only valid on `option`, `row`, `tab`, `gridcell` and `treeitem`. These are
filter chips. **Fix:** `aria-pressed={isSelected}`, which is the correct toggle-button
attribute. (The sibling usages at `ForExperience.tsx:51` and `:473` are fine — those buttons
do carry `role="tab"`, and `:208` is inside a `role="listbox"` with `role="option"`.)

### 12. Heading-level jumps (WCAG 1.3.1)

`/features` (h2→h4), `/for` (h1→h3), `/security` (h1→h3), `/tools/hourly-rate-calculator`
(h1→h3), `/features/website-builder` (h1→h3), all five `/compare/[competitor]` pages (h1→h3),
and `/features/ai-ads`, `/ai-vision`, `/ai-voice`, `/dispatch`, `/text-to-job`,
`/video-studio` (h1→h4). **Fix:** choose heading levels by document structure and style with
CSS, rather than picking the level that happens to look right.

### 13. Two `<h1>` elements

`/tools/estimate-generator` ("Instant Contractor Estimate Generator" + "CONTRACTOR ESTIMATE")
and `/tools/leakage-calculator` (the same title twice). The second is decorative in both
cases. **Fix:** demote to `<h2>`, or `<p>` with heading styling.

### 14. Sub-10px live text

61 elements at **7px** on `/`, 62 at **9px** on `/for`, 31 on `/how-it-works`, 19 on
`/features/back-office`. Most sit inside decorative device mockups but are not `aria-hidden`,
so screen readers announce them and they count as page content.

The one that is not decorative: `.for_visualFrameFooter > a` is a **real signup anchor**
rendered at 9px with a 2.66:1 contrast ratio. **Fix:** `aria-hidden="true"` on the decorative
mock frames, and pull the real CTA out of the scaled mock to full size.

---

## P4 — Tooling and hygiene

### 15. The Lighthouse performance gate has never run

`lighthouserc.json` is **UTF-16LE encoded** (`file` reports `Unicode text, UTF-16,
little-endian`). `JSON.parse` fails on it:

```
PARSE FAILED: Unexpected token '', "{ …" is not valid JSON
```

`npm run test:perf` → `lhci autorun` reads that file, so the PERF-05 gate
(`8101623 PERF-05: Add lighthouse for site speed measurement`) cannot have executed. The
config also has no `url` list and no `startServerCommand`, so it would not know what to
measure even once it parses.

**Fix:** rewrite as UTF-8, add `collect.url` covering the top marketing routes and
`collect.startServerCommand`. `docs/evidence/ai-tier-inspection-2026-09-12.txt` is UTF-16 too
and is the only other such file in the repo — likely both were written from PowerShell with
default redirection.

### 16. Marketing CTA host is hardcoded to production

`src/components/marketing/links.tsx:22-33` hardcodes
`https://app.letsgetquoted.com/{start,login}`. Every CTA on every preview and staging deploy
sends the visitor to production. **Fix:** derive from `NEXT_PUBLIC_APP_URL` with the current
literal as the fallback — `signup-intent.ts` already accepts a base parameter for exactly this.

### 17. Stale comment in `sitemap.ts`

`src/app/sitemap.ts:12` says "The twelve feature detail routes". `FEATURE_SLUGS` has 22
entries. Cosmetic, but the comment is load-bearing documentation for a file that explicitly
warns against drift.

---

## Suggested order of work

| # | Finding | Effort | Why now |
| :-- | :--- | :--- | :--- |
| 1 | Light-theme invisible text | M | Whole pages unreadable, two taps from any visitor |
| 3 | Token pages indexable | S | Customer names and emails; only gets worse once crawled |
| 2 | CTA contrast | S | One token change fixes the site's main action |
| 4, 5 | og:image missing / 404 | S | 8 URLs, all high-intent; pure config |
| 6, 7 | Doubled titles, `/status` canonical | S | 31 URLs; mechanical |
| 10, 11 | ARIA critical violations | S | Two files, well understood |
| 15 | Lighthouse config | S | Unblocks the perf gate that is meant to catch the rest |
| 8, 9, 12, 13, 14 | Lengths, schema, headings, tiny text | M | Steady-state SEO/a11y cleanup |
| 16, 17 | Preview host, stale comment | S | Hygiene |
