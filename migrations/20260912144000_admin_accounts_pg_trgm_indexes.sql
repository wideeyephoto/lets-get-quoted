CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS accounts_business_name_trgm_idx ON accounts USING gin (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sites_company_name_trgm_idx ON sites USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS accounts_call_tracking_trgm_idx ON accounts USING gin (call_tracking_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS accounts_sms_number_trgm_idx ON accounts USING gin (sms_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS accounts_alert_phone_trgm_idx ON accounts USING gin (alert_phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sites_phone_trgm_idx ON sites USING gin (phone gin_trgm_ops);
