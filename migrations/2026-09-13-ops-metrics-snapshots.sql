-- Daily operational metrics snapshot for trend analysis\r
-- Written by the ops-metrics-snapshot cron; read by the AI Operator\r
-- get_ops_trend_history tool.\r
CREATE TABLE IF NOT EXISTS ops_metrics_snapshots (\r
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\r
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,\r
  mrr_estimated numeric NOT NULL DEFAULT 0,\r
  active_subscriptions integer NOT NULL DEFAULT 0,\r
  total_active_contractors integer NOT NULL DEFAULT 0,\r
  stripe_connected_contractors integer NOT NULL DEFAULT 0,\r
  sms_deliverability_pct numeric,\r
  unresolved_webhooks_count integer NOT NULL DEFAULT 0,\r
  incident_count integer NOT NULL DEFAULT 0,\r
  new_signups_count integer NOT NULL DEFAULT 0,\r
  quotes_created_count integer NOT NULL DEFAULT 0,\r
  cron_troubled_count integer NOT NULL DEFAULT 0,\r
  dunning_count integer NOT NULL DEFAULT 0,\r
  dunning_total_amount_cents integer NOT NULL DEFAULT 0,\r
  created_at timestamptz NOT NULL DEFAULT now(),\r
  UNIQUE(snapshot_date)\r
);\r
\r
COMMENT ON TABLE ops_metrics_snapshots IS 'Daily point-in-time capture of platform KPIs for the AI Operator trend analysis tool.';
