-- Audit trail for circuit breaker state changes\r
CREATE TABLE IF NOT EXISTS circuit_breaker_audit (\r
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\r
  subsystem text NOT NULL,\r
  account_id uuid,\r
  action text NOT NULL CHECK (action IN ('trip', 'clear')),\r
  previous_state text,\r
  new_state text,\r
  triggered_by text NOT NULL,\r
  reason text,\r
  created_at timestamptz NOT NULL DEFAULT now()\r
);\r
\r
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_audit_subsystem_created\r
  ON circuit_breaker_audit (subsystem, created_at DESC);\r
\r
COMMENT ON TABLE circuit_breaker_audit IS 'Records when circuit breakers are tripped or cleared, and by whom.';
