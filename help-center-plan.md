# Help Center Migration Plan

## Phase 0 — Frame (half day)
- [ ] Confirm which surfaces are stable enough to document (exclude auth, job CRUD, template routing while in flight)
- [ ] Name one owner for the help center
- [ ] Write the voice rule: explain the product, not the trade

## Phase 1 — Audit (week 1)
- [ ] Export full list of existing articles with URLs
- [ ] Add columns: last updated, pageviews, screenshots y/n, verdict
- [ ] Walk each article against the live product, mark inaccurate ones
- [ ] Mark every homeowner-facing article delete or rewrite-for-contractors
- [ ] Assign verdict to every remaining row: keep / merge / rewrite / delete
- [ ] Delete the "delete" pile and redirect the URLs

## Phase 2 — Restructure (week 3)
- [ ] Set up the 5 categories: Getting set up, Getting paid, Intake and quoting, Your website, Billing and account
- [ ] Map every surviving article to a category
- [ ] Build the old-URL to new-URL redirect map

## Phase 3 — Standards (week 3)
- [ ] Write the article template (purpose → steps → done state → common failure)
- [ ] Write the one-page style guide: mobile-first, short steps, no wide tables, contractor voice
- [ ] Decide screenshot policy; create the seeded demo account if automating
- [ ] Add last-verified date and owner fields to the template

## Phase 4 — Docs as code (week 4)
- [ ] Create `/content/help` MDX directory in the Next.js app
- [ ] Build the help center route and article renderer
- [ ] Migrate surviving articles to MDX
- [ ] Create the slug → route/component registry file
- [ ] Add the doc-update item to your PR template (update or mark N/A)
- [ ] Set up Playwright screenshot generation if you chose that route

## Phase 5 — Findability (week 5)
- [ ] Add search over MDX content
- [ ] Add contextual help links at Stripe Connect onboarding
- [ ] Add contextual help links at subdomain setup
- [ ] Add contextual help links at first-quote-sent
- [ ] Add "was this helpful" on each article

## Phase 6 — Rewrite and maintain (weeks 5–6, then ongoing)
- [ ] Rewrite top 10 most critical articles
- [ ] Write the pricing/fees/tiers page as its own owned artifact
- [ ] Write homeowner reassurance copy into the quote email and payment page
- [ ] Quarterly recurring: review anything last-verified 90+ days ago
- [ ] Start tracking pageviews and helpfulness scores as the success metric
