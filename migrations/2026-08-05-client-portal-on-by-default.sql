-- The past-customer portal ships ON.
--
-- It arrived off (2026-08-03-client-portal.sql), on the reasoning that a public
-- page which emails links to anyone who types a matching address is a decision
-- a contractor should make on purpose. That reasoning was about the SURPRISE,
-- not the risk — and it produced a feature nobody ever saw: two switches, both
-- off, one of them buried in an Automations tab, guarding a page that turns a
-- contractor's own website into somewhere their customers come back to.
--
-- The risk it was guarding against does not survive a second look. The lookup
-- never reveals whether an email matched anybody (every visitor gets the same
-- acknowledgement), only a hash of each link is stored, and a link is scoped to
-- ONE client of ONE account. See lib/client-portal.ts, which states all three as
-- the security properties they are.
--
-- Off remains one click away, in Settings → Automations, and switching it off
-- also takes the "Client Login" link off their website (portalLinkRemoved) so
-- their own header never advertises a dead end.

alter table accounts
  alter column client_portal_enabled set default true;

-- Existing accounts get it too. Safe today because the flag has never been
-- exposed as a considered choice: it defaulted to false and the only way to see
-- the switch at all was to go looking for it, so a stored `false` here means
-- "never decided", not "decided against".
--
-- If this is ever re-run after contractors HAVE made real choices, drop this
-- statement — it cannot tell the two apart.
update accounts set client_portal_enabled = true where client_portal_enabled = false;
