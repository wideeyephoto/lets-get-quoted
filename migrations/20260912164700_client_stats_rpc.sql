CREATE OR REPLACE FUNCTION get_client_stats(p_account_id uuid, p_today date)
RETURNS TABLE (
  client_id uuid,
  job_count bigint,
  total_value numeric,
  last_job_at timestamptz,
  next_job_at date,
  unscheduled_jobs bigint,
  last_visit_at date
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.client_id,
    count(*) AS job_count,
    sum(j.quoted_amount) AS total_value,
    max(j.created_at) AS last_job_at,
    min(case when j.scheduled_for >= p_today then j.scheduled_for else null end) AS next_job_at,
    count(case when j.scheduled_for is null then 1 else null end) AS unscheduled_jobs,
    max(case when j.scheduled_for < p_today then j.scheduled_for else null end) AS last_visit_at
  FROM jobs j
  WHERE j.account_id = p_account_id AND j.client_id IS NOT NULL
  GROUP BY j.client_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;
