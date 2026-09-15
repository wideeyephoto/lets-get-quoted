-- Audit trail for circuit breaker state changes
CREATE TABLE IF NOT EXISTS circuit_breaker_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem text NOT NULL,
  account_id uuid,
  action text NOT NULL CHECK (action IN ('trip', 'clear')),
  previous_state text,
  new_state text,
  triggered_by text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_audit_subsystem_created
  ON circuit_breaker_audit (subsystem, created_at DESC);

COMMENT ON TABLE circuit_breaker_audit IS 'Records when circuit breakers are tripped or cleared, and by whom.';
