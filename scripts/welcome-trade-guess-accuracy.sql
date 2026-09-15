-- Share of completed first runs where trade was guessed and retained without change in the builder.
-- Check this 7 days after deploy to evaluate whether Phase 1 (trade guess) stays or comes out.
--
-- Metric:
--   retention_rate_pct >= 80%  -> trade guess is accurate and saving contractor effort
--   retention_rate_pct < 60%   -> trade guess causes confusion or mis-categorization, revert Phase 1

WITH first_runs AS (
  SELECT
    ae.account_id,
    ae.created_at AS first_run_at,
    ae.meta->>'trade_source' AS trade_source,
    ae.meta->>'trade' AS initial_trade,
    (ae.meta->>'zip_resolved')::boolean AS zip_resolved,
    a.trade AS current_account_trade
  FROM account_events ae
  JOIN accounts a ON a.id = ae.account_id
  WHERE ae.kind = 'first_run_completed'
)
SELECT
  COUNT(*) AS total_first_runs,
  COUNT(*) FILTER (WHERE trade_source = 'guessed') AS guessed_count,
  COUNT(*) FILTER (WHERE trade_source = 'typed') AS typed_count,
  COUNT(*) FILTER (WHERE trade_source = 'url') AS url_count,
  COUNT(*) FILTER (WHERE trade_source = 'guessed' AND initial_trade IS NOT NULL AND initial_trade = current_account_trade) AS guessed_and_retained,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE trade_source = 'guessed' AND initial_trade IS NOT NULL AND initial_trade = current_account_trade)
    / NULLIF(COUNT(*) FILTER (WHERE trade_source = 'guessed'), 0),
    1
  ) AS trade_guess_retention_rate_pct,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE zip_resolved = true)
    / NULLIF(COUNT(*), 0),
    1
  ) AS zip_resolution_rate_pct
FROM first_runs;
