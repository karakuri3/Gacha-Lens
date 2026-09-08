-- Tighten terminal audit semantics for the one-time affiliate provider-read authorization ledger.
-- This migration does not widen provider budgets or authorize execution. It binds specific
-- terminal reason codes to durable attempt evidence and gives retry exhaustion its own reason.

create or replace function public.finalize_affiliate_provider_read_authorization_v1(
  p_authorization_id text,
  p_terminal_state text,
  p_reason_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_authorization private.affiliate_provider_read_authorizations%rowtype;
  v_attempt_count integer;
  v_completed_phase_count integer;
begin
  if coalesce(p_authorization_id, '') !~ '^affiliate-provider-read-auth-[0-9a-f]{32}$'
    or coalesce(p_terminal_state, '') not in ('completed', 'failed_before_request', 'partial_or_ambiguous')
    or coalesce(p_reason_code, '') not in (
      'completed',
      'configuration_preflight_failed',
      'executor_preflight_failed',
      'operator_cancelled_after_claim',
      'provider_terminal_failure',
      'ambiguous_transport',
      'retry_exhausted',
      'partial_batch',
      'operator_stopped_after_attempt'
    ) then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_authorization_invalid_finalization';
  end if;

  if (p_terminal_state = 'completed' and p_reason_code <> 'completed')
    or (p_terminal_state = 'failed_before_request' and p_reason_code not in (
      'configuration_preflight_failed',
      'executor_preflight_failed',
      'operator_cancelled_after_claim'
    ))
    or (p_terminal_state = 'partial_or_ambiguous' and p_reason_code not in (
      'provider_terminal_failure',
      'ambiguous_transport',
      'retry_exhausted',
      'partial_batch',
      'operator_stopped_after_attempt'
    )) then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_authorization_terminal_reason_mismatch';
  end if;

  select *
  into v_authorization
  from private.affiliate_provider_read_authorizations
  where authorization_id = p_authorization_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_missing';
  end if;

  if v_authorization.state <> 'claimed' then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_already_finalized';
  end if;

  select count(*)::integer
  into v_attempt_count
  from private.affiliate_provider_read_attempts a
  where a.authorization_id = p_authorization_id;

  select count(*)::integer
  into v_completed_phase_count
  from private.affiliate_provider_read_attempts a
  where a.authorization_id = p_authorization_id
    and a.outcome = 'success';

  if p_terminal_state = 'failed_before_request' then
    if v_attempt_count <> 0 then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_has_provider_attempts';
    end if;
  elsif p_terminal_state = 'completed' then
    if exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.outcome in ('reserved', 'terminal_failure', 'ambiguous')
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_incomplete_or_ambiguous';
    end if;

    if exists (
      select 1
      from unnest(v_authorization.request_keys) as requests(request_key)
      cross join (values ('discovery'::text), ('affiliate_enrichment'::text)) as phases(phase)
      where not exists (
        select 1
        from private.affiliate_provider_read_attempts a
        where a.authorization_id = p_authorization_id
          and a.request_key = requests.request_key
          and a.phase = phases.phase
          and a.outcome = 'success'
      )
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_missing_success_phase';
    end if;

    if v_completed_phase_count <> v_authorization.logical_provider_http_requests then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_success_count_mismatch';
    end if;
  else
    if v_attempt_count < 1 then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_no_partial_attempt';
    end if;

    if p_reason_code = 'provider_terminal_failure' and not exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.outcome = 'terminal_failure'
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_reason_evidence_mismatch';
    end if;

    if p_reason_code = 'ambiguous_transport' and not exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.outcome in ('ambiguous', 'reserved')
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_reason_evidence_mismatch';
    end if;

    if p_reason_code = 'retry_exhausted' and not exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.attempt_no = 3
        and a.outcome = 'retryable_failure'
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_reason_evidence_mismatch';
    end if;
  end if;

  update private.affiliate_provider_read_authorizations
  set state = p_terminal_state,
      terminal_reason = p_reason_code,
      finalized_at = clock_timestamp()
  where authorization_id = p_authorization_id;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'affiliate_provider_read_authorization_finalization_v1',
    'authorization_id', p_authorization_id,
    'state', p_terminal_state,
    'reason_code', p_reason_code,
    'provider_attempt_rows', v_attempt_count,
    'approval_reusable', false
  );
end;
$$;

revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from public;
revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from anon;
revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from authenticated;
grant execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) to service_role;

-- PostgreSQL truncates the original 69-character constraint identifier to 63 characters.
-- Rename that generated identifier to an explicit stable name so catalog checks and future
-- migrations never depend on an implicit truncation rule.
do $block$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'private'
      and r.relname = 'affiliate_provider_read_authorizations'
      and c.conname = 'affiliate_provider_read_authorization_approval_fingerprint_chec'
  ) and not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'private'
      and r.relname = 'affiliate_provider_read_authorizations'
      and c.conname = 'affiliate_provider_read_auth_approval_fp_check'
  ) then
    alter table private.affiliate_provider_read_authorizations
      rename constraint affiliate_provider_read_authorization_approval_fingerprint_chec
      to affiliate_provider_read_auth_approval_fp_check;
  end if;
end
$block$;

comment on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) is
  'Monotonically terminalizes a consumed authorization and binds specific failure reasons to durable attempt evidence; never reopens or makes approval reusable.';
