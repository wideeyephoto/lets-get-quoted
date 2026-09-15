# Public incident channel

The operator opens `/admin/incidents#new-incident` from the operator cockpit or
the “Open a public incident” link in operational alert emails. All mutations
require `ops.manage` and a verified second factor. Customers read `/status`
without signing in.

## Publication policy

The on-call operator owns customer copy and updates. Publish `critical` incidents
and `warning` incidents when customer impact is confirmed, targeting publication
within 15 minutes of confirmation. Keep internal-only warnings as drafts. Publish
`info` releases only when they are useful customer notices. An automated alert
does not by itself establish customer impact and does not automatically publish.

Use a short title, affected services, observed customer impact, and the next
action. State what is known; avoid speculative recovery times. Update at least
every 30 minutes while impact continues, even if the update is “investigation
continues.” Resolve after verifying recovery and publish a plain-language
resolution summary. The on-call operator is responsible for these targets; the
system records changes but does not enforce the clock.

The public fields are title, description, severity, kind, affected services,
impact summary, resolution summary, and incident/publication/update timestamps.
The incident ID and publication flag are also readable. Never put personal data,
credentials, customer account identifiers, internal URLs, or investigation notes
in public copy. Owner, creator, root cause, and external URL remain internal at
the database permission boundary. Draft rows remain hidden.

## Operator cycle

1. Create a draft, review its customer copy, then use **Publish to status page**.
   The creation form also supports explicit publication for an urgent update.
2. Open `/status` anonymously and confirm it appears under active incidents.
3. Use **Edit public update**, save the new copy, and refresh `/status` to confirm.
4. Choose **Resolve…**, supply the public resolution summary and any separate
   internal root cause, then confirm. The incident moves to recent history.
5. Verify `admin_actions` contains `platform_incident_log`,
   `platform_incident_update`, and `platform_incident_resolve` for its ID.

Unpublish removes a row from the public page without deleting the operational
record. The public page queries active incidents separately from its latest ten
history entries, and displays unknown health if either database query fails.

## Deployment and rehearsal

Apply `migrations/20260911150644_platform_incident_public_boundary.sql` before
deploying the new app. It includes the `published` prerequisite and supersedes
the earlier broad policy, so it can be applied directly to the existing schema.
It is safe to replay; older service-role admin code can keep creating drafts.

Run `npm run test:incident-policy`, `npm run test:incident-rehearsal`, and the
public-status/operator-action tests before release. Then run the actual API
rehearsal against staging:

```powershell
npm run rehearse:incident-cycle -- --env-file "C:\dev\CLAUDE CODE FOLDER\.env.staging.local"
```

That script creates a clearly labeled temporary published incident and verifies
its cleanup. It does not exercise operator authentication or the rendered page.
Complete the operator cycle above on the exact deployed release and preserve
its SHA, anonymous HTTP/page evidence, and audit IDs before closing G5.

Rollback changes the application deployment only. Keep the forward-compatible
columns and service-role grants; unpublish an incorrect customer notice through
the operator control. Never replay the full canonical schema against production.
