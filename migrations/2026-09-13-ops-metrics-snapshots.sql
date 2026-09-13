-- Daily operational metrics snapshot for trend analysis
-- Written by the ops-metrics-snapshot cron; read by the AI Operator
-- get_ops_trend_history tool.
CREATE TABLE IF NOT EXISTS ops_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  mrr_estimated numeric NOT NULL DEFAULT 0,
  active_subscriptions integer NOT NULL DEFAULT 0,
  total_active_contractors integer NOT NULL DEFAULT 0,
  stripe_connected_contractors integer NOT NULL DEFAULT 0,
  sms_deliverability_pct numeric,
  unresolved_webhooks_count integer NOT NULL DEFAULT 0,
  incident_count integer NOT NULL DEFAULT 0,
  new_signups_count integer NOT NULL DEFAULT 0,
  quotes_created_count integer NOT NULL DEFAULT 0,
  cron_troubled_count integer NOT NULL DEFAULT 0,
  dunning_count integer NOT NULL DEFAULT 0,
  dunning_total_amount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date)
);

COMMENT ON TABLE ops_metrics_snapshots IS 'Daily point-in-time capture of platform KPIs for the AI Operator trend analysis tool.';
