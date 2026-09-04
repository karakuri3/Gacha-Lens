-- ISOLATED REHEARSAL CANDIDATE ONLY — not a Production migration.
--
-- Production read-only inspection on 2026-09-04 found these RLS-enabled tables
-- have zero policies but broad anon/authenticated table grants. Gacha Lens
-- Production runtime reads/writes them through the server-only service-role
-- boundary. Revoking API-role table privileges removes pg_graphql discovery
-- without changing the service_role contract.
--
-- Explicitly excluded from this candidate because Production has intentional
-- public SELECT policies: series_lineup, series_price_history,
-- series_restock_info, series_stock_reports.

begin;

revoke all privileges on table public.community_reports from anon, authenticated;
revoke all privileges on table public.forecast_snapshots from anon, authenticated;
revoke all privileges on table public.import_issues from anon, authenticated;
revoke all privileges on table public.ingestion_runs from anon, authenticated;
revoke all privileges on table public.market_listing_observations from anon, authenticated;
revoke all privileges on table public.market_listings from anon, authenticated;
revoke all privileges on table public.outbound_clicks from anon, authenticated;
revoke all privileges on table public.restock_events from anon, authenticated;
revoke all privileges on table public.series from anon, authenticated;
revoke all privileges on table public.source_weights from anon, authenticated;
revoke all privileges on table public.stock_reports from anon, authenticated;
revoke all privileges on table public.variants from anon, authenticated;
revoke all privileges on table public.x_reactions from anon, authenticated;

commit;
