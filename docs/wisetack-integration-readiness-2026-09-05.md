# Wisetack integration readiness

Wisetack is the intended homeowner financing provider. The platform partner
application is pending, with no partner API documentation or sandbox access yet
(confirmed by the owner on September 5, 2026). Financing is not live.

## Current application behavior

- `src/lib/bnpl-financing.ts` supplies the shared Wisetack pending-approval state
  used by the Payments dashboard, feature catalog, and AI operator reports.
- The Payments financing tool displays its actual availability instead of
  generating or copying hypothetical lender offers.
- Customer invoices do not advertise monthly financing that cannot be obtained.
- The unused Affirm/Klarna eligibility calculator and the financing quote server
  action have been removed. Existing Stripe payments and contractor payment plans
  are separate from lender financing.
- There is no environment switch that can turn the unfinished integration on.

## Work required after partner approval

Obtain the official partner API specification, sandbox credentials, merchant
onboarding requirements, approved customer disclosures, and webhook verification
instructions from Wisetack. Public marketing pages do not specify an API contract.
Do not invent endpoints, authentication headers, callback signatures, or offer terms.

Build and verify the complete lifecycle against that contract:

1. Record platform readiness and each contractor's verified merchant approval.
2. Create an application from server-verified account, job, and invoice amounts,
   with authorization, duplicate-submission protection, and a provider-issued link.
3. Show offers and disclosures from the provider; application approval or
   prequalification must not mark an invoice paid.
4. Authenticate provider events and reconcile them idempotently. Handle amount
   changes, cancellation, completion confirmation, funding, and refunds according
   to Wisetack's contract. Prevent simultaneous financing and Stripe collection.
5. Prove tenant isolation, duplicate/out-of-order events, funding reconciliation,
   and the customer flow in the sandbox before exposing live financing.

The dormant `finance_plans` table in `schema.sql` is not a completed integration.
It stores loan summary fields but has no provider application ID, event deduplication,
or verified funding lifecycle. Design the migration from the approved API contract.

## Provider references

- [Wisetack for software platforms](https://www.wisetack.com/partnerships)
- [Wisetack sales hub](https://www.wisetack.com/sales-hub): applications and
  completion confirmation are separate steps.
- [Wisetack prequalification](https://support.wisetack.com/hc/en-us/articles/8500439328539-How-does-prequalification-work):
  prequalification does not guarantee financing approval or terms.
