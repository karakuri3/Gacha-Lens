-- Production migration applied 2026-09-05 JST during company infrastructure Final Release/Cutover.
-- Fresh dependency preflight found no application/public function references.
-- Intentionally non-CASCADE so unexpected dependencies fail closed.

drop extension pg_graphql;
