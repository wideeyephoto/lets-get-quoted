-- Archive table for aged operator audit logs\r
CREATE TABLE IF NOT EXISTS ai_operator_audit_archive (\r
  LIKE ai_operator_audit_log INCLUDING ALL\r
);\r
\r
COMMENT ON TABLE ai_operator_audit_archive IS 'Cold storage for AI operator audit entries older than 90 days.';
