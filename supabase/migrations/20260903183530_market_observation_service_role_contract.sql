-- Normalize the fresh-database service_role table contract before the R4
-- SECURITY INVOKER runtime proof. Production already grants service_role table
-- access here, but the historical fresh migration chain created this table after
-- the initial Foundation service_role grants and never added the equivalent grant.
-- Keep client roles unchanged; this is server-only contract repair.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.market_listing_observations
TO service_role;
