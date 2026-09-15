# Contractor sites — improvement plan (2026-09-12)

A prioritized backlog for the contractor website product (`/site/[subdomain]`,
`/site-domain/[domain]`, `/dashboard/sites`).

Every item cites what was found in the repository at the commit under review — a
file, a line, a count. Where the product already does something well (hero LCP
handling, consent gating, honest LocalBusiness schema, theme contrast coverage),
it is deliberately **not** listed.

**Priority:** P0 blocks contractors from getting leads they have already paid
for · P1 is a compounding loss · P2 is worth doing once the first two are clear.
**Effort** is engineering days for one developer who knows this codebase.

Interactive version (status shared across viewers):
<https://claude.ai/code/artifact/9a27f14a-b20a-4076-8c53-5b199f340880>

---

## Findings that drove this list

| Measure | Value |
| --- | --- |
| Public site routes that read the DB on every request | 18 of 20 |
| Tap-to-call links / of those reporting a conversion | 23 / 0 |
| Shared theme stylesheet shipped to every site | 326 KB, 4,381 lines, all 8 themes |
| Indexable pages per site | homepage, `/videos`, blog posts |
| Cities claimed in `areaServed` with no page to rank | up to 30 |

---

## 1. Get found locally

A contractor site is bought to rank for "&lt;trade&gt; near me". Each site
publishes one indexable page plus its blog, while the data for dozens more pages
is already stored and already claimed in the structured data.

### SEO-01 · P0 · 5–8d — Build per-service pages at `/services/[slug]`

Services are stored, rendered on the homepage, and published as schema.org
`Offer`s — but there is no page for someone searching "drain cleaning Lee's
Summit" to land on. One homepage cannot rank for twelve services.

```
siteIndexablePages() — src/lib/seo/site-pages.ts:60
  returns '', '/videos', '/blog/<slug>' only
content.services.items — already holds title + copy per service
buildLocalBusinessJsonLd() already emits up to 15 Offers
```

- Add a slug per service item, generated from the title and stable once published.
- Add `/services` and `/services/[slug]` to both route trees.
- Emit `Service` JSON-LD per page, referencing the parent LocalBusiness by `@id`.
- Add the pages to `siteIndexablePages()` behind the same thin-content gate as the homepage.
- Link services from the homepage section and the footer, not only from an anchor.

### SEO-02 · P0 · 4–6d — Build service-area pages at `/service-areas/[city]`

Every site already claims up to thirty towns in its markup. Claiming a town
Google cannot see a page for is the weakest version of that signal.

```
siteCities() — src/lib/seo/site-seo.ts
  dedupes home city + content.serviceAreas.cities, capped at 30
  published as areaServed: [{'@type':'City', name}]
No route matches /service-areas or citySlug anywhere in src/app
```

- Generate a page per city with the trade, the service list, and the reviews on file.
- Vary copy per city from real inputs — never one paragraph with the name swapped,
  which Google treats as doorway pages.
- Gate on a minimum: a city with nothing specific to say should not get a page.
- Cross-link city pages to the services offered there, and back to the homepage.

### SEO-03 · P1 · 1d — Emit `FAQPage` structured data

FAQs are stored, enabled, and rendered, and they are exactly the content Google
expands in results. The markup that earns that expansion is not emitted.

```
grep -rn 'FAQPage' src/lib/seo src/lib/templates → no matches
content.faqs.items — { question, answer }, gated on faqs.enabled
SiteContentSections.tsx renders them; SiteStructuredData.tsx does not
```

- Add `buildFaqJsonLd()` beside `buildLocalBusinessJsonLd()`, same nonce and escaping path.
- Only include FAQs that actually render — the same rule the video graph already follows.
- Add a test asserting emitted questions match rendered ones.

### SEO-04 · P1 · 0.5d — Add canonical URLs to the blog and video index pages

A site served on both its subdomain and its custom domain shows the same page at
two addresses. The homepage and blog articles declare which wins; the two index
pages declare nothing, so the versions compete.

```
alternates.canonical present:
  site/[subdomain]/page.tsx                ✓
  site/[subdomain]/blog/[slug]/page.tsx:42 ✓
  site/[subdomain]/blog/page.tsx           ✗
  site/[subdomain]/videos/page.tsx         ✗
```

- Use `siteCanonicalUrl(site)` on both index routes, matching the article route.
- Mirror it in the `site-domain` tree.
- Add a test covering every public route's canonical.

### SEO-05 · P1 · 1d — Emit `BreadcrumbList` on contractor sites

The helper exists and is used across the marketing site. Contractor sites never
call it — and once SEO-01/02 land, they are the pages that need it.

```
src/lib/seo/breadcrumbs.ts consumers:
  app/for/[trade]/page.tsx, app/resources/[slug]/page.tsx,
  components/marketing/* — marketing routes only
```

### SEO-06 · P2 · 2d — Put project photos in the sitemap

Showcase and before/after galleries are the most distinctive content on a
contractor site. None of it is submitted for image search.

```
content.showcase.items / content.beforeAfter.items render in
  ProjectShowcase.tsx and BeforeAfterSlider.tsx
siteIndexablePages() emits page URLs only — no image entries
```

---

## 2. Load fast

Page speed is both a ranking input and the reason a homeowner on a phone in a
driveway either waits or leaves. The hero path is genuinely well built.
Everything behind it is not.

### PERF-01 · P0 · 2–3d — Route the other 18 public routes through the cache

A cache with tag invalidation was written for these pages and two routes use it.
Every other page — blog, videos, portal, terms, privacy, `robots.txt`,
`sitemap.xml`, and the touch icon iOS fetches on every save — opens a database
connection per request.

```
Uses getCachedPublicSite*:   2 routes (the two homepages)
Calls getPublicSiteBy* direct: 18 routes
  e.g. site/[subdomain]/blog/page.tsx:17
       getPublicSiteBySubdomain(createAdminClient(), params.subdomain)
Cache + tag invalidation already exist in src/lib/cached-sites.ts
```

- Swap every direct call for the cached loader — mechanical, one line each.
- Wrap in React `cache()` per request, as the homepages already do.
- Add a test that fails if any route under `src/app/site*` calls `getPublicSiteBy*` directly.

### PERF-02 · P0 · 3–5d — Stop forcing dynamic rendering on every public page

All twenty public routes opt out of static rendering, so no contractor page is
ever served from the edge. Every visitor waits for a server render of a page that
changes when the owner edits it — which is what tag revalidation is for, and it
is already wired up.

```
export const dynamic = 'force-dynamic' — 18 occurrences
  across src/app/site/[subdomain]/** and src/app/site-domain/[domain]/**
revalidatePublicSiteCache() already fires on publish (src/lib/cached-sites.ts)
```

- Move to time-based revalidation with on-demand purge on publish; the tags exist.
- Keep `force-dynamic` only where a request actually varies — the portal lookup.
- Confirm the middleware rewrite still resolves the tenant; measure TTFB before and after.

### PERF-03 · P1 · 4–6d — Split the shared theme stylesheet per template

All eight templates import one 4,381-line stylesheet, so a contractor on Forge
downloads the CSS for Guild, Vista, Haven, Foundry, Tinker, Blueprint and Lustre
too. It is render-blocking, on the critical path of every published site.

```
src/lib/templates/themes.module.css — 326 KB, 4,381 lines, 1,924 selectors
  imported by all 8 templates + 30 shared components
Per-theme prefixes: .forge 44, .guild 35, .vista 42, .handy 54,
  .coat 34, .fixit 26, .reno 39, .shine 21 — cleanly separable
```

- Extract the shared `.site*` base (470 selectors) into one module every template keeps.
- Move each theme prefix into its own module, imported only by that template.
- Guard with a build-time budget so the base cannot quietly grow back.
- Verify the existing theme contrast suite still passes untouched.

### PERF-04 · P1 · 2–3d — Give gallery and blog images intrinsic dimensions

The hero is handled carefully. Everything below it is a bare `<img>` with no
width or height, so the page reflows as each photo arrives.

```
Raw <img> without width/height:
  SiteContentSections.tsx  7    ProjectShowcase.tsx    4
  SiteBlogIndex.tsx        3    BeforeAfterSlider.tsx  2
  SiteBlogArticle.tsx      2
SafeImage.tsx already handles the optimizable-host fallback correctly
```

- Route these through `SafeImage`, which already degrades safely for unknown hosts.
- Store intrinsic dimensions at upload so a ratio box can be reserved before load.
- Keep `loading="lazy"` below the fold; leave the hero path alone.

### PERF-05 · P1 · 3d — Measure site speed at all

No Lighthouse run, no field data, no budget anywhere in the repo. Nothing would
catch any of the regressions above, and nothing tells you whether a fix worked.

```
grep for lighthouse | web-vitals | axe-core | pa11y
  across package.json, src/, test/, scripts/ → no matches
1,173 test files, none of them performance
```

### PERF-06 · P2 · 1d — Cache the per-site touch icon

```
site/[subdomain]/apple-icon.tsx      — calls getPublicSiteBySubdomain directly
site-domain/[domain]/apple-icon.tsx  — same
```

---

## 3. Turn visits into jobs

The quote form is instrumented properly — impression, start, first step, submit,
fanned out to GA4, Google Ads, Meta and TikTok behind real consent. The phone,
which is how most home-services leads actually arrive, is not instrumented at all.

### CONV-01 · P0 · 2d — Report tap-to-call as a conversion

Twenty-three call links across the templates and not one reports anything. A
contractor running ads is bidding on form fills only, so the channel that brings
most of their work is invisible to the algorithm optimising their spend.
**Highest-value single fix on this list.**

```
tel: links in src/lib/templates/*.tsx — 23
  with any onClick handler — 1 (closes the mobile nav)
trackQuoteFunnelStep() — src/lib/analytics.ts:253
  already fans out to gtag, fbq, ttq with the Ads send_to target
  wired only to the quote form
```

- Add a call-intent step to the existing funnel tracker; reuse its consent gate and `send_to` target.
- Attach it to every `tel:` link — header, hero, sticky bar, footer, mobile nav, 404.
- Fire Meta `Contact` and TikTok `Contact` alongside the Google conversion.
- Feed it into the closed-loop ad sync, which already carries a `Lead` event type.

### CONV-02 · P1 · 5–8d — Offer call tracking numbers

Even with tap-to-call reported, a call dialled from a desktop screen or a Google
listing is unattributed. The messaging platform already provisions, verifies and
routes dedicated numbers per contractor — the hard part is built.

```
sms_sender_numbers + provisioning and reconciliation already exist
  (scripts/verify-messaging-number-provisioning.mjs,
   scripts/verify-voice-number-provisioning.mjs)
No dynamic number insertion anywhere in src/lib/templates
```

- Keep the real number in the structured data — never publish a tracking number as the business phone.

### CONV-03 · P1 · 3d — Make "text us" a first-class call to action

Younger homeowners will text where they will not call, and the SMS rails —
consent, sender inventory, delivery, inbound routing — are already the most
carefully built part of this codebase. The public site never offers it.

```
Site CTAs today: quote form, tel:, chat button
src/lib/sms.ts — 2,368 lines of production messaging
content.chatButton supports a channel field already
```

### CONV-04 · P1 · 1d — Show the honest response-time badge

The site model computes an average response time from real lead data specifically
so the page can say "typically replies within X" without inventing anything.

```
Site.avg_response_ms — src/lib/sites.ts:40
  "computed at public-site load from real lead response times,
   for the honest 'typically replies within X' badge"
```

- Audit where it renders across all eight templates; give it a consistent, prominent slot.
- Place it next to the form submit and the call button, where hesitation happens.
- Keep the existing rule: no badge when there is not enough data to be honest.

### CONV-05 · P2 · 2d — Surface financing on the site, not only on the quote

```
FinancingPrequalClickPayload.surface — src/lib/analytics.ts
  'quote' | 'invoice' | 'payment_request' — no 'site'
```

---

## 4. Look like a real business

Review markup is deliberately withheld because self-serving ratings on a
LocalBusiness are against Google's rules — that call is correct and should stand.
The work is in earning the same trust by legitimate means.

### TRUST-01 · P1 · 4–6d — Route reviews through a source that can carry rating markup

```
GoogleReviewImport.tsx — 40 KB, imports rating, count, author, text
buildLocalBusinessJsonLd() — explicit comment:
  "carries NO aggregateRating/review — Google disallows
   self-serving review markup on a LocalBusiness"
```

- Integrate a review platform whose widget publishes its own markup.
- Keep the imported Google reviews as on-page proof; do not mark them up.

### TRUST-02 · P2 · 3d — Pull portfolio projects from completed jobs

Listed as the first Phase 2 item in the original plan and still open. Contractors
do not maintain a gallery; they do finish jobs with photos attached.

```
WEBSITE_TEMPLATES_PLAN.md Phase 2: "[ ] Portfolio section (auto-pull from completed jobs)"
PortfolioJob type exists in src/lib/sites.ts and is threaded through TemplateProps
```

- Strip address and customer detail before anything is publishable.
- Prompt at job close, when the photos are already in hand.

### TRUST-03 · P2 · 2d — Display licence and insurance as a verified fact

```
Site.license — free text, rendered as-is
No verification or issuer lookup anywhere in src/lib
```

---

## 5. Work for everyone

Theme contrast is covered better here than in most production codebases — every
theme against every scheme, in CI. The gaps are what contrast tests cannot see.

### A11Y-01 · P1 · 0.5d — Add a skip-to-content link

```
grep 'skip' across src/lib/templates → no matches
<main> present in all 8 templates + 7 shared page components
```

### A11Y-02 · P1 · 3d — Gate accessibility in CI, not just contrast

```
Covered: all-themes-all-schemes-contrast.test.ts, theme.test.ts,
  homepage-theme-contrast.test.ts, forms-contrast-theme.test.ts …
Missing: no axe-core, no pa11y — zero matches in the repo
```

- Include the quote form specifically — it is the one thing every visitor must operate.

### A11Y-03 · P2 · 0.5d — Respect reduced motion in the hero photo cycle

The video hero checks the preference; the photo cross-fade does not.

```
HeroImageCycle.tsx:142 — reduced-motion check in HeroVideoBackdrop
HeroPhotoCycle useEffect — setInterval, no such check
Handled correctly in Parallax.tsx:17, FilmstripScroller.tsx:18, IntroVideo.tsx:36
```

### A11Y-04 · P2 · 0.5d — Replace the emoji phone icon with the real icon

```
SiteHeaderUtilityBar.tsx:28 — <span aria-hidden="true">📞</span>
SiteFooter.tsx uses a proper PhoneIcon SVG in the same role
```

---

## 6. Reach more customers

### REACH-01 · P1 · 8–12d — Offer Spanish-language sites

In much of the country a large share of homeowners — and of the contractors
themselves — would rather do business in Spanish. There is no language support
anywhere in the site product.

```
grep 'lang="es"' | 'es-US' | 'spanish'
  across src/lib/templates and src/app/site* → no matches
All copy generation and SEO output is English-only
```

- Add a language field to the site model; set the document language from it.
- Extend the copy generator and SEO generator to produce Spanish output.
- Add `hreflang` between language variants; translate the quote form and its validation messages.
- Ship one trade end to end first rather than translating everything at once.

### REACH-02 · P2 · 5d — Give public sites a dark mode

```
prefers-color-scheme in themes.module.css — 0 occurrences
cf. the dashboard and email theme systems, both scheme-aware
```

For an emergency trade taking calls at 2am, this is the moment that matters most.

---

## 7. Keep it maintainable

None of this is visible to a contractor. All of it decides how fast everything
above can ship, and how likely a fix is to land on one code path and miss the other.

### MAINT-01 · P1 · 4–6d — Collapse the two parallel public route trees into one

Subdomain sites and custom-domain sites are served by two hand-maintained copies
of the same ten routes. Every item on this list has to be done twice, and drift
is already visible — which is how a fix ships to the subdomain and silently
misses the contractor's own domain, where it matters more.

```
src/app/site/[subdomain]/**      10 files
src/app/site-domain/[domain]/**  10 files
Same page, already diverged: homepage 75 vs 61 lines; videos 24 vs 31; portal 60 vs 59
Middleware rewrites both to the same renderer (src/middleware.ts:54,71)
```

**Do this before SEO-01 and SEO-02, or they ship twice.**

### MAINT-02 · P1 · 5–8d — Break up the website builder component

```
src/app/dashboard/sites/WebsiteBuilder.tsx      4,321 lines
src/lib/site-content.ts                         3,258
src/app/dashboard/sites/AiLogoCreatorModal.tsx  2,941
src/app/dashboard/sites/actions.ts              1,594
src/lib/templates/HeroQuickForm.tsx             1,538
```

- Split by the tabs that already exist in the UI — the seams are visible.
- No behaviour change in this task; land it before the feature work above.

### MAINT-03 · P2 · 0.5d — Correct the template registry comments

```
index.ts:11  "Only the 3 curated templates are offered"
  — 8 are registered, 8 are in AVAILABLE_TEMPLATES
types.ts trailing note: "17 additional templates (Haven, …, Blueprint, …,
  Foundry …) … no longer offered in the picker"
  — Haven, Blueprint and Foundry are all currently offered
```

Keep the fallback note — that behaviour is real and worth documenting.

### MAINT-04 · P2 · 0.25d — Retire the original feature plan from the repo root

```
WEBSITE_TEMPLATES_PLAN.md — repo root
  "## Start Date — Ready when you give the go-ahead!"
  describes 1 template; 8 are live with blog, video, domains, AI copy
```

- Move it into `docs/` as a dated historical record.
- Carry its still-open Phase 2 items onto this list — TRUST-02 is one of them.

---

## Suggested order

1. **MAINT-01** — collapse the route trees, so nothing below ships twice.
2. **CONV-01** — cheapest fix with the largest revenue effect.
3. **PERF-01 → PERF-02** — cache, then stop forcing dynamic rendering.
4. **SEO-01 → SEO-02** — the pages that make a site rank.
5. **PERF-05** before PERF-03/04, so the CSS and image work can be measured.
6. Everything else by priority.
