-- Fail closed once any provider-read phase has exhausted its third retryable attempt.
-- This replaces only the reservation RPC from the immediately preceding authorization-ledger migration.

create or replace function public.reserve_affiliate_provider_read_attempt_v1(
  p_authorization_id text,
  p_request_key text,
  p_phase text,
  p_attempt_no integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_authorization private.affiliate_provider_read_authorizations%rowtype;
  v_previous_outcome text;
begin
  if coalesce(p_authorization_id, '') !~ '^affiliate-provider-read-auth-[0-9a-f]{32}$'
    or coalesce(p_request_key, '') !~ '^affiliate-read-[0-9a-f]{20}$'
    or coalesce(p_phase, '') not in ('discovery', 'affiliate_enrichment')
    or p_attempt_no is null
    or p_attempt_no not between 1 and 3 then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_attempt_invalid_reservation';
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
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_terminal';
  end if;

  if not (p_request_key = any(v_authorization.request_keys)) then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_request_not_bound';
  end if;

  if exists (
    select 1
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and a.outcome = 'reserved'
  ) then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_outstanding_reservation';
  end if;

  if exists (
    select 1
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and (
        a.outcome in ('terminal_failure', 'ambiguous')
        or (a.attempt_no = 3 and a.outcome = 'retryable_failure')
      )
  ) then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_batch_requires_terminalization';
  end if;

  if p_phase = 'affiliate_enrichment' and not exists (
    select 1
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and a.request_key = p_request_key
      and a.phase = 'discovery'
      and a.outcome = 'success'
  ) then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_discovery_not_complete';
  end if;

  if exists (
    select 1
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and a.request_key = p_request_key
      and a.phase = p_phase
      and a.outcome = 'success'
  ) then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_phase_already_succeeded';
  end if;

  if p_attempt_no = 1 then
    if exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.request_key = p_request_key
        and a.phase = p_phase
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_sequence_mismatch';
    end if;
  else
    select a.outcome
    into v_previous_outcome
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and a.request_key = p_request_key
      and a.phase = p_phase
      and a.attempt_no = p_attempt_no - 1;

    if not found or v_previous_outcome <> 'retryable_failure' then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_previous_not_retryable';
    end if;

    if exists (
      select 1
      from private.affiliate_provider_read_attempts a
      where a.authorization_id = p_authorization_id
        and a.request_key = p_request_key
        and a.phase = p_phase
        and a.attempt_no >= p_attempt_no
    ) then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_sequence_mismatch';
    end if;
  end if;

  begin
    insert into private.affiliate_provider_read_attempts (
      authorization_id,
      request_key,
      phase,
      attempt_no,
      outcome
    ) values (
      p_authorization_id,
      p_request_key,
      p_phase,
      p_attempt_no,
      'reserved'
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_replay';
  end;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'affiliate_provider_read_attempt_reservation_v1',
    'authorization_id', p_authorization_id,
    'request_key', p_request_key,
    'phase', p_phase,
    'attempt_no', p_attempt_no,
    'state', 'reserved'
  );
end;
$$;

revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from public;
revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from anon;
revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from authenticated;
grant execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) to service_role;

comment on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) is
  'Serially reserves one bounded provider HTTP attempt before network I/O and fail-closes the batch after terminal, ambiguous, or exhausted-third-retry outcomes.';
