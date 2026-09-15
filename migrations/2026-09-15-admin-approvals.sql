-- Migration: Four-Eyes Approval Queue
CREATE TABLE IF NOT EXISTS admin_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL,
  payload jsonb NOT NULL,
  requested_by uuid REFERENCES auth.users(id) NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  notes text
);
