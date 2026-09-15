# Help Center Migration Plan

## Phase 0 — Frame (half day)
- [x] Confirm which surfaces are stable enough to document (exclude auth, job CRUD, template routing while in flight)
- [x] Name one owner for the help center
- [x] Write the voice rule: explain the product, not the trade

## Phase 1 — Audit (week 1)
- [x] Export full list of existing articles with URLs
- [x] Add columns: last updated, pageviews, screenshots y/n, verdict
- [x] Walk each article against the live product, mark inaccurate ones
- [x] Mark every homeowner-facing article delete or rewrite-for-contractors
- [x] Assign verdict to every remaining row: keep / merge / rewrite / delete
- [x] Delete the "delete" pile and redirect the URLs

## Phase 2 — Restructure (week 3)
- [x] Set up the 5 categories: Getting set up, Getting paid, Intake and quoting, Your website, Billing and account
- [x] Map every surviving article to a category
- [x] Build the old-URL to new-URL redirect map

## Phase 3 — Standards (week 3)
- [x] Write the article template (purpose → steps → done state → common failure)
- [x] Write the one-page style guide: mobile-first, short steps, no wide tables, contractor voice
- [x] Decide screenshot policy; create the seeded demo account if automating
- [x] Add last-verified date and owner fields to the template

## Phase 4 — Docs as code (week 4)
- [x] Create `/content/help` MDX directory in the Next.js app
- [x] Build the help center route and article renderer
- [x] Migrate surviving articles to MDX
- [x] Create the slug → route/component registry file
- [x] Add the doc-update item to your PR template (update or mark N/A)
- [x] Set up Playwright screenshot generation if you chose that route

## Phase 5 — Findability (week 5)
- [x] Add search over MDX content
- [x] Add contextual help links at Stripe Connect onboarding
- [x] Add contextual help links at subdomain setup
- [x] Add contextual help links at first-quote-sent
- [x] Add "was this helpful" on each article

## Phase 6 — Rewrite and maintain (weeks 5–6, then ongoing)
- [x] Rewrite top 10 most critical articles
- [x] Write the pricing/fees/tiers page as its own owned artifact
- [x] Write homeowner reassurance copy into the quote email and payment page
- [x] Quarterly recurring: review anything last-verified 90+ days ago
- [x] Start tracking pageviews and helpfulness scores as the success metric
