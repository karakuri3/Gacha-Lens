-- Production migration applied 2026-09-05 JST during company infrastructure Final Release/Cutover.
-- Isolated rehearsal source: Stage 5 Supabase hardening PASS.

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
