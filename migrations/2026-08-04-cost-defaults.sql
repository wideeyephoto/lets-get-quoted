-- Job costing: start every account on the figures most trades actually run at.
--
-- Both settings shipped at 0, which is the one value that means "this feature
-- does nothing". A burden of 0 says a $30/hr crew member costs $30/hr, which is
-- never true and is exactly the invisible loss the feature exists to stop; a
-- margin floor of 0 flags nothing, ever. A setting whose default is "off" is a
-- setting most people never discover, and this one silently makes every job
-- look more profitable than it was.
--
-- 40% burden is the top of the range the settings card already calls industry
-- typical (20–40%), and 15% is the middle of the 10–20% it already calls the
-- recommended range. The advice was on screen; the defaults just didn't follow
-- it.
--
-- Both columns stay NOT NULL and 0 stays a legal, meaningful value — an owner
-- who deliberately sets either to zero keeps it. This only changes where an
-- account STARTS.

alter table accounts alter column default_burden_pct set default 40;
alter table accounts alter column min_margin_pct set default 15;

-- Existing accounts are all still on the shipped 0, i.e. nobody has chosen it —
-- the feature is days old and has no live contractors on it. Move those onto the
-- new defaults so the setting means something everywhere, not only for accounts
-- created after today.
--
-- Deliberately narrow: only rows still holding the old default are touched, so
-- an account that has already been configured is never overwritten. Re-running
-- this is safe but not idempotent in intent — once somebody has genuinely
-- chosen 0, a second run would move them off it. Run once.
update accounts set default_burden_pct = 40 where default_burden_pct = 0;
update accounts set min_margin_pct = 15 where min_margin_pct = 0;
