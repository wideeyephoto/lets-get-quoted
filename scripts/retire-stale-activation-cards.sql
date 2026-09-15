-- Stage 0: Retire the 3 stale cards in ai_operator_action_requests
-- These were built with the old connect_onboarded = false query and wrong payload.
UPDATE ai_operator_action_requests
SET
  status = 'expired',
  resolution_reason = 'Superseded by corrected zero-quote activation audience query'
WHERE action_type = 'batch_activation_nudges'
  AND status = 'pending';

-- Stage 7: Backfill test_marker on fixture accounts that currently have test_marker IS NULL
UPDATE accounts
SET test_marker = 'synthetic_fixture'
WHERE test_marker IS NULL
  AND (
    business_name ILIKE 'Webhook test%'
    OR business_name ILIKE 'E2E Leads-Jobs%'
    OR business_name ILIKE 'Test Contractor%'
  );
