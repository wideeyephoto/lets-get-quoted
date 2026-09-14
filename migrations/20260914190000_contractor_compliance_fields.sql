-- Contractor compliance & tax identification fields.
-- Folded into accounts to eliminate network round-trip in permit compilation
-- and avoid creating an unnecessary single-row child table.

alter table public.accounts add column if not exists fein text;
alter table public.accounts add column if not exists state_employer_number text;
alter table public.accounts add column if not exists license_type text;