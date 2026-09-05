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
npx vitest run test/domains.test.ts test/vercel-domains.test.ts test/domain-tls.test.ts test/custom-domain-lifecycle.test.ts test/custom-domain-actions.test.ts test/edge-routing-security-matrix.test.ts test/site-company-name-sync.test.ts test/user-manual.test.ts
npm run typecheck
```
