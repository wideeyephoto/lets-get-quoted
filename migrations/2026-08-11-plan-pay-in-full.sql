-- A payment plan is an OFFER, not a requirement.
--
-- The Send-the-quote form's payment terms are three mutually exclusive radios:
-- pay in full, deposit + balance, or Payment Plan. Choosing Payment Plan
-- therefore removed paying in full as an option — for the homeowner, not just
-- for the contractor. Somebody who would happily have settled the whole thing
-- on the spot was shown a deposit, four dated installments, and a card
-- authorization, with no way to say "I'll just pay it".
--
-- Defaults to true, deliberately. A contractor willing to be paid in four parts
-- is not unwilling to be paid in one, so every plan already out there gains the
-- option the moment this lands. A contractor who genuinely needs the schedule
-- (spreading their own cash flow, or a plan priced around it) can turn it off.
--
-- Only gates the choice BEFORE the plan starts. Paying off an active plan early
-- is a separate promise the client is already given in writing — "you can pay
-- the remaining balance in full at any time with no penalty" — and this flag
-- must never be read as taking that away.

alter table payment_plans add column if not exists allow_pay_in_full boolean not null default true;
