-- Archive table for aged operator audit logs
CREATE TABLE IF NOT EXISTS ai_operator_audit_archive (
  LIKE ai_operator_logs INCLUDING ALL
);

COMMENT ON TABLE ai_operator_audit_archive IS 'Cold storage for AI operator audit entries older than 90 days.';
