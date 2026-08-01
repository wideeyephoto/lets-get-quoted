-- ============================================================================
-- Extra Stops can reach past today.
--
-- The owner's side already handled any date — the offer form takes a free date
-- input and the route is computed for whatever day it's given. Only the customer
-- ever assumed "today": the booking page asked "can they squeeze you in today"
-- and never recorded which day the customer actually wanted.
--
-- That mismatch quietly capped the feature at the hours left in the afternoon.
-- A contractor whose max visit is four hours has almost no same-day slot for it
-- by 2pm, but plenty of room at 8am tomorrow — and the customer with a dripping
-- faucet is usually fine with tomorrow. Same route-filling idea, a day wider.
--
-- days_ahead is a COUNT OF DAYS BEYOND TODAY, so 0 preserves the old behaviour
-- exactly and is a real choice, not a disabled state. Default 1 (today and
-- tomorrow): the point of the feature is filling a gap you can still see.
-- ============================================================================

alter table accounts add column if not exists extra_stop_days_ahead int not null default 1
  check (extra_stop_days_ahead >= 0 and extra_stop_days_ahead <= 7);

-- Which day the CUSTOMER asked for. Distinct from arrival_date, which is the day
-- the contractor committed to in their offer: the two are usually the same and
-- the whole negotiation lives in the times they aren't. Null on rows created
-- before this existed, and read as "today" — which is what they meant.
alter table extra_stop_requests add column if not exists requested_date date;
