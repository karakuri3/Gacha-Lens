-- Durable one-time authorization ledger for the bounded affiliate-demand provider-read experiment.
-- Repository-only prerequisite. Applying this migration to Production is separately approval-bound.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create or replace function private.affiliate_provider_read_request_keys_valid_v1(p_values text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_values is not null
    and cardinality(p_values) between 1 and 10
    and cardinality(p_values) = (
      select count(distinct value)::integer
      from unnest(p_values) as keys(value)
    )
    and not exists (
      select 1
      from unnest(p_values) as keys(value)
      where value is null
        or value !~ '^affiliate-read-[0-9a-f]{20}$'
    );
$$;

revoke execute on function private.affiliate_provider_read_request_keys_valid_v1(text[]) from public;
revoke execute on function private.affiliate_provider_read_request_keys_valid_v1(text[]) from anon;
revoke execute on function private.affiliate_provider_read_request_keys_valid_v1(text[]) from authenticated;
grant execute on function private.affiliate_provider_read_request_keys_valid_v1(text[]) to service_role;

create table if not exists private.affiliate_provider_read_authorizations (
  authorization_id text primary key,
  plan_kind text not null,
  head_sha text not null,
  batch_digest text not null unique,
  approval_fingerprint text not null,
  target_count integer not null,
  logical_provider_http_requests integer not null,
  max_http_attempts integer not null,
  request_keys text[] not null,
  state text not null default 'claimed',
  terminal_reason text,
  claimed_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  constraint affiliate_provider_read_authorization_id_check
    check (authorization_id ~ '^affiliate-provider-read-auth-[0-9a-f]{32}$'),
  constraint affiliate_provider_read_authorization_plan_kind_check
    check (plan_kind = 'affiliate_demand_provider_read_plan_v1'),
  constraint affiliate_provider_read_authorization_head_check
    check (head_sha ~ '^[0-9a-f]{40}$'),
  constraint affiliate_provider_read_authorization_digest_check
    check (batch_digest ~ '^[0-9a-f]{64}$'),
  constraint affiliate_provider_read_authorization_approval_fingerprint_check
    check (approval_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint affiliate_provider_read_authorization_target_budget_check
    check (
      target_count between 1 and 10
      and target_count = cardinality(request_keys)
      and logical_provider_http_requests = target_count * 2
      and max_http_attempts = logical_provider_http_requests * 3
      and private.affiliate_provider_read_request_keys_valid_v1(request_keys)
    ),
  constraint affiliate_provider_read_authorization_state_check
    check (state in ('claimed', 'completed', 'failed_before_request', 'partial_or_ambiguous')),
  constraint affiliate_provider_read_authorization_terminal_check
    check (
      (state = 'claimed' and terminal_reason is null and finalized_at is null)
      or (state <> 'claimed' and terminal_reason is not null and finalized_at is not null)
    )
);

alter table private.affiliate_provider_read_authorizations enable row level security;

revoke all on table private.affiliate_provider_read_authorizations from public;
revoke all on table private.affiliate_provider_read_authorizations from anon;
revoke all on table private.affiliate_provider_read_authorizations from authenticated;
grant select, insert, update on table private.affiliate_provider_read_authorizations to service_role;

create table if not exists private.affiliate_provider_read_attempts (
  authorization_id text not null references private.affiliate_provider_read_authorizations(authorization_id) on delete restrict,
  request_key text not null,
  phase text not null,
  attempt_no integer not null,
  outcome text not null default 'reserved',
  response_fingerprint text,
  reserved_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  primary key (authorization_id, request_key, phase, attempt_no),
  constraint affiliate_provider_read_attempt_request_key_check
    check (request_key ~ '^affiliate-read-[0-9a-f]{20}$'),
  constraint affiliate_provider_read_attempt_phase_check
    check (phase in ('discovery', 'affiliate_enrichment')),
  constraint affiliate_provider_read_attempt_number_check
    check (attempt_no between 1 and 3),
  constraint affiliate_provider_read_attempt_outcome_check
    check (outcome in ('reserved', 'success', 'retryable_failure', 'terminal_failure', 'ambiguous')),
  constraint affiliate_provider_read_attempt_response_fingerprint_check
    check (response_fingerprint is null or response_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint affiliate_provider_read_attempt_terminal_shape_check
    check (
      (outcome = 'reserved' and finished_at is null and response_fingerprint is null)
      or (outcome <> 'reserved' and finished_at is not null and (outcome <> 'success' or response_fingerprint is not null))
    )
);

alter table private.affiliate_provider_read_attempts enable row level security;

revoke all on table private.affiliate_provider_read_attempts from public;
revoke all on table private.affiliate_provider_read_attempts from anon;
revoke all on table private.affiliate_provider_read_attempts from authenticated;
grant select, insert, update on table private.affiliate_provider_read_attempts to service_role;

create or replace function public.claim_affiliate_provider_read_authorization_v1(
  p_plan_kind text,
  p_head_sha text,
  p_batch_digest text,
  p_approval_fingerprint text,
  p_target_count integer,
  p_logical_provider_http_requests integer,
  p_max_http_attempts integer,
  p_request_keys text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_authorization_id text;
  v_expected_approval_fingerprint text;
begin
  if p_plan_kind is distinct from 'affiliate_demand_provider_read_plan_v1'
    or coalesce(p_head_sha, '') !~ '^[0-9a-f]{40}$'
    or coalesce(p_batch_digest, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_approval_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_target_count is null
    or p_target_count not between 1 and 10
    or p_target_count is distinct from cardinality(p_request_keys)
    or p_logical_provider_http_requests is distinct from p_target_count * 2
    or p_max_http_attempts is distinct from p_logical_provider_http_requests * 3
    or not private.affiliate_provider_read_request_keys_valid_v1(p_request_keys) then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_authorization_invalid_claim';
  end if;

  v_expected_approval_fingerprint := encode(extensions.digest(
    convert_to(
      'APPROVE_AFFILIATE_DEMAND_PROVIDER_READ_V1:' || p_head_sha || ':' || p_batch_digest,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  if p_approval_fingerprint is distinct from v_expected_approval_fingerprint then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_authorization_approval_mismatch';
  end if;

  v_authorization_id := 'affiliate-provider-read-auth-' || substr(encode(extensions.digest(
    convert_to(concat_ws(chr(31),
      'gacha-lens',
      'affiliate_demand_provider_read_authorization_v1',
      p_head_sha,
      p_batch_digest
    ), 'UTF8'),
    'sha256'
  ), 'hex'), 1, 32);

  begin
    insert into private.affiliate_provider_read_authorizations (
      authorization_id,
      plan_kind,
      head_sha,
      batch_digest,
      approval_fingerprint,
      target_count,
      logical_provider_http_requests,
      max_http_attempts,
      request_keys,
      state
    ) values (
      v_authorization_id,
      p_plan_kind,
      p_head_sha,
      p_batch_digest,
      p_approval_fingerprint,
      p_target_count,
      p_logical_provider_http_requests,
      p_max_http_attempts,
      p_request_keys,
      'claimed'
    );
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_replay';
  end;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'affiliate_provider_read_authorization_claim_v1',
    'authorization_id', v_authorization_id,
    'head_sha', p_head_sha,
    'batch_digest', p_batch_digest,
    'target_count', p_target_count,
    'logical_provider_http_requests', p_logical_provider_http_requests,
    'max_http_attempts', p_max_http_attempts,
    'state', 'claimed',
    'approval_reusable', false
  );
end;
$$;

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
      and a.outcome in ('terminal_failure', 'ambiguous')
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

create or replace function public.finish_affiliate_provider_read_attempt_v1(
  p_authorization_id text,
  p_request_key text,
  p_phase text,
  p_attempt_no integer,
  p_outcome text,
  p_response_fingerprint text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_authorization private.affiliate_provider_read_authorizations%rowtype;
  v_attempt private.affiliate_provider_read_attempts%rowtype;
begin
  if coalesce(p_authorization_id, '') !~ '^affiliate-provider-read-auth-[0-9a-f]{32}$'
    or coalesce(p_request_key, '') !~ '^affiliate-read-[0-9a-f]{20}$'
    or coalesce(p_phase, '') not in ('discovery', 'affiliate_enrichment')
    or p_attempt_no is null
    or p_attempt_no not between 1 and 3
    or coalesce(p_outcome, '') not in ('success', 'retryable_failure', 'terminal_failure', 'ambiguous')
    or (p_response_fingerprint is not null and p_response_fingerprint !~ '^[0-9a-f]{64}$')
    or (p_outcome = 'success' and coalesce(p_response_fingerprint, '') !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'affiliate_provider_read_attempt_invalid_completion';
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

  select *
  into v_attempt
  from private.affiliate_provider_read_attempts
  where authorization_id = p_authorization_id
    and request_key = p_request_key
    and phase = p_phase
    and attempt_no = p_attempt_no
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_missing';
  end if;

  if v_attempt.outcome <> 'reserved' or v_attempt.finished_at is not null then
    raise exception using errcode = 'P0001', message = 'affiliate_provider_read_attempt_already_finished';
  end if;

  update private.affiliate_provider_read_attempts
  set outcome = p_outcome,
      response_fingerprint = p_response_fingerprint,
      finished_at = clock_timestamp()
  where authorization_id = p_authorization_id
    and request_key = p_request_key
    and phase = p_phase
    and attempt_no = p_attempt_no;

  return jsonb_build_object(
    'schema_version', 1,
    'kind', 'affiliate_provider_read_attempt_completion_v1',
    'authorization_id', p_authorization_id,
    'request_key', p_request_key,
    'phase', p_phase,
    'attempt_no', p_attempt_no,
    'outcome', p_outcome
  );
end;
$$;

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

    select count(*)::integer
    into v_completed_phase_count
    from private.affiliate_provider_read_attempts a
    where a.authorization_id = p_authorization_id
      and a.outcome = 'success';

    if v_completed_phase_count <> v_authorization.logical_provider_http_requests then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_success_count_mismatch';
    end if;
  else
    if v_attempt_count < 1 then
      raise exception using errcode = 'P0001', message = 'affiliate_provider_read_authorization_no_partial_attempt';
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

revoke execute on function public.claim_affiliate_provider_read_authorization_v1(text, text, text, text, integer, integer, integer, text[]) from public;
revoke execute on function public.claim_affiliate_provider_read_authorization_v1(text, text, text, text, integer, integer, integer, text[]) from anon;
revoke execute on function public.claim_affiliate_provider_read_authorization_v1(text, text, text, text, integer, integer, integer, text[]) from authenticated;
grant execute on function public.claim_affiliate_provider_read_authorization_v1(text, text, text, text, integer, integer, integer, text[]) to service_role;

revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from public;
revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from anon;
revoke execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) from authenticated;
grant execute on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) to service_role;

revoke execute on function public.finish_affiliate_provider_read_attempt_v1(text, text, text, integer, text, text) from public;
revoke execute on function public.finish_affiliate_provider_read_attempt_v1(text, text, text, integer, text, text) from anon;
revoke execute on function public.finish_affiliate_provider_read_attempt_v1(text, text, text, integer, text, text) from authenticated;
grant execute on function public.finish_affiliate_provider_read_attempt_v1(text, text, text, integer, text, text) to service_role;

revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from public;
revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from anon;
revoke execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) from authenticated;
grant execute on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) to service_role;

comment on table private.affiliate_provider_read_authorizations is
  'One-time affiliate provider-read authorization claims. Claim is permanent; no automatic reclaim/retry path.';
comment on table private.affiliate_provider_read_attempts is
  'Per-request/phase provider HTTP attempt reservations for one-time affiliate provider-read authorizations.';
comment on function public.claim_affiliate_provider_read_authorization_v1(text, text, text, text, integer, integer, integer, text[]) is
  'Atomically consumes one exact #267 authorization fingerprint. Service-role only; no provider call or persistence.';
comment on function public.reserve_affiliate_provider_read_attempt_v1(text, text, text, integer) is
  'Serially reserves one bounded provider HTTP attempt before network I/O. Service-role only.';
comment on function public.finish_affiliate_provider_read_attempt_v1(text, text, text, integer, text, text) is
  'Records only bounded outcome/fingerprint evidence for a previously reserved provider attempt.';
comment on function public.finalize_affiliate_provider_read_authorization_v1(text, text, text) is
  'Monotonically terminalizes a consumed authorization; never reopens or makes approval reusable.';
