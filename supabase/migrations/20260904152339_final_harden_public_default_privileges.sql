-- Production migration applied 2026-09-05 JST during company infrastructure Final Release/Cutover.
-- This is Stage 5 Candidate A only. Candidate B remains HOLD.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
