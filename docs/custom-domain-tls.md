# Custom-domain TLS activation

The builder activates a custom domain only after all three checks succeed:

1. The domain is attached to the configured Vercel project, ownership is verified,
   and the binding serves production rather than a redirect or preview branch.
2. Vercel reports `misconfigured: false` for its DNS and certificate eligibility.
3. A connection to the domain on port 443 completes with a trusted certificate
   covering that hostname. The TLS probe sends the hostname as SNI, does not send
   HTTP requests or follow redirects, blocks private addresses at socket lookup,
   and has an eight-second deadline.

The Vercel DNS configuration response does not contain certificate issuance
status. Domain ownership verification is also insufficient to prove serving TLS.
See [domain configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration),
[project attachment](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project),
and [SSL provisioning](https://vercel.com/docs/domains/working-with-ssl).

## Production setup

The deployed application needs these server-side environment variables:

- `VERCEL_AUTH_TOKEN` (or `VERCEL_TOKEN`): a Vercel API token with permission to
  manage domains on the production project.
- `VERCEL_PROJECT_ID`: the production project's ID.
- `VERCEL_TEAM_ID`: the owning team's ID when the project belongs to a team.

Deploy after configuring these variables. Never expose the token through a
`NEXT_PUBLIC_` variable or commit it. Missing credentials now produce an explicit
unconfigured state; matching DNS alone cannot activate a domain.

The fallback DNS instructions use `CUSTOM_DOMAIN_CNAME_TARGET` (default
`domains.letsgetquoted.com`) and `CUSTOM_DOMAIN_A_RECORD` (default `76.76.21.21`).
After checking the domain, the builder shows the project's current recommended
CNAME and A record returned by Vercel. This also supports flattened CNAMEs and
new project-specific IPs that do not match the legacy A record.

## Connect and verify

1. Enter the exact hostname in Website Settings and click **Check connection**.
   This saves the domain on the authorized account before provisioning it.
2. Add the displayed DNS records at the authoritative DNS provider. For an apex
   domain, use the displayed A record. For a subdomain, use its CNAME record.
   Remove conflicting A/AAAA records for that hostname and use DNS-only proxy
   mode during setup.
3. If ownership verification records appear, add those records too.
4. Check again after DNS and certificate provisioning complete. Retries reuse an
   existing binding on this project; a failed attachment is never treated as a
   successful connection.
5. Confirm **Connected with active SSL**, then open the custom URL. Independently
   check it with `curl -Iv https://your-domain.example` using normal certificate
   validation. If setup remains pending, check CAA restrictions and the Vercel
   project's domain configuration.

Only the hostname entered is connected. Adding an apex domain does not claim
that its `www` hostname has also been provisioned.

While setup is pending or fails, the builder uses the free subdomain. The action
clears any previous DNS-only `custom_domain_verified_at` value on an unsuccessful
check. It updates only the same saved account/site/domain, so a delayed check
cannot overwrite a replacement domain or undo a disconnect. Changing a domain
removes the previous Vercel binding only after the site save succeeds.

## After the check: the certificate watch

Certificate issuance is asynchronous. A contractor whose DNS is right still sees
"a secure connection is not available yet", and the interactive check only ever
runs when a human clicks the button — so a domain that goes live an hour later
stays reported as pending until somebody thinks to look again.

`/api/cron/custom-domain-reconcile` (every 15 minutes,
`src/lib/custom-domain-reconciler.ts`) is that second look. It re-runs the full
activation path for pending domains only, stamps the ones that now pass, busts
the per-host page cache, and emails the owner once that their site is live. The
stamp itself is the dedupe: a row can only be promoted once.

**It promotes and never demotes.** Serving is gated on
`custom_domain_verified_at` — every route under `src/app/site-domain/[domain]`
calls `notFound()` without it — so clearing that stamp on a live domain is an
outage we caused, for what may be a DNS blip or a renewing certificate. The
re-check that catches a live domain going bad (the equivalent of
`email-domain-reconcile`'s downgrade) is deliberately NOT here: it needs a
paced `custom_domain_checked_at` column of its own, and a decision about
whether taking a website down is ever the right response to one failed probe.

Two bounds, both reported in the run summary rather than applied silently: at
most 25 domains per run (oldest `updated_at` first, `remaining` reports the
rest), and a domain saved but never configured drops out of scope after 30
days. Re-saving it in the builder moves `updated_at` and brings it back.

## Releasing a domain

`sites` cascades away with its account, so a deleted workspace used to leave its
domain attached to the project forever — we kept answering for a hostname
nobody here owned, and, because Vercel refuses the same domain on two projects,
whoever pointed that name elsewhere next could never attach it.

`src/lib/custom-domain-release.ts` is deliberately two calls, in this order:

1. `readAccountCustomDomains` BEFORE the delete, while the rows still exist.
2. `releaseCustomDomains` only AFTER the delete is confirmed. Releasing first
   would strand a live website on a deletion that failed — and account deletes
   fail routinely on the retained-ledger foreign keys.

Both `deleteAccountAction` (staff erasure) and `executeAccountClosureSaga` use
it. Release never throws: the destructive step has already happened, and a
domain that could not be detached is returned and logged for a human instead.
Changing or clearing a domain in the builder still releases through
`saveSiteAction`, as before.

Anything neither path reaches is caught by the reconciler's orphan sweep, which
reports project bindings with no `sites` row behind them. It never deletes:
that would race a domain a contractor is in the middle of connecting.

## Verification performed on 2026-09-05

- A read-only production query found no sites with a non-null `custom_domain`;
  there were no customer domains to reconcile or use for an end-to-end live test.
- The public `domains.letsgetquoted.com` target resolved successfully. The actual
  TLS probe accepted that host and `letsgetquoted.com`, and rejected
  `expired.badssl.com`.
- 104 targeted tests passed across domain activation, the Vercel API adapter,
  TLS trust and SSRF protection, action persistence, tenant routing, and existing
  website/manual contracts. App and test TypeScript checks passed. Targeted lint
  passed with the existing unused `PersistedAiLogo` import warning.
- No deployment, production environment change, or customer DNS change was made.

Run the regression checks with:

```sh
npx vitest run test/domains.test.ts test/vercel-domains.test.ts test/domain-tls.test.ts test/custom-domain-lifecycle.test.ts test/custom-domain-actions.test.ts test/custom-domain-reconciler.test.ts test/custom-domain-release.test.ts test/cron-jobs.test.ts test/account-deletion-saga.test.ts test/edge-routing-security-matrix.test.ts test/site-company-name-sync.test.ts test/user-manual.test.ts
npm run typecheck
```
