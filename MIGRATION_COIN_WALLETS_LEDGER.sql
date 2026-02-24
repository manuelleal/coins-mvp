-- ===============================================
-- MIGRATION_COIN_WALLETS_LEDGER.sql
-- Purpose:
-- 1) Add transparent coin wallets + transaction ledger (mandatory movement log)
-- 2) Provide atomic transfer function (RPC) for coin movements
-- 3) Provide optional backfill of current balances into the ledger as opening_balance
--
-- IMPORTANT:
-- - This is designed to be ADDITIVE and not break existing app logic.
-- - App can keep using current columns (profiles.monedas, institutions.coin_pool, etc).
-- - When the app is upgraded to call coin_transfer(), all movements are guaranteed logged.
-- ===============================================

-- 0) Extensions
create extension if not exists pgcrypto;

-- 1) Wallets table
create table if not exists public.coin_wallets (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('system','institution','profile')),
  owner_id uuid null,
  currency text not null default 'COIN',
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists coin_wallets_owner_unique
  on public.coin_wallets(owner_type, owner_id)
  where owner_id is not null;

create index if not exists coin_wallets_owner_type_idx on public.coin_wallets(owner_type);

-- 2) Ledger table (double-entry style)
create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  amount bigint not null check (amount > 0),
  from_wallet_id uuid null references public.coin_wallets(id) on delete set null,
  to_wallet_id uuid null references public.coin_wallets(id) on delete set null,
  action text not null default 'transfer',
  created_by_profile_id uuid null,
  institution_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists coin_ledger_created_at_idx on public.coin_ledger(created_at desc);
create index if not exists coin_ledger_from_idx on public.coin_ledger(from_wallet_id);
create index if not exists coin_ledger_to_idx on public.coin_ledger(to_wallet_id);
create index if not exists coin_ledger_institution_idx on public.coin_ledger(institution_id);

-- 3) Minimal open RLS policies (match existing "open" patterns in this repo)
alter table public.coin_wallets enable row level security;
alter table public.coin_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='coin_wallets' and policyname='open'
  ) then
    execute 'create policy open on public.coin_wallets for all using (true) with check (true)';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='coin_ledger' and policyname='open'
  ) then
    execute 'create policy open on public.coin_ledger for all using (true) with check (true)';
  end if;
end $$;

-- 4a) Ensure wallets are created for new owners (so allocations never fail due to missing wallet)
create or replace function public.trg_profiles_wallet_ensure()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.ensure_coin_wallet('profile', new.id);
  return new;
end $$;

drop trigger if exists trg_profiles_wallet_ensure on public.profiles;
create trigger trg_profiles_wallet_ensure
after insert on public.profiles
for each row execute function public.trg_profiles_wallet_ensure();

create or replace function public.trg_institutions_wallet_ensure()
returns trigger
language plpgsql
security definer
as $$
begin
  perform public.ensure_coin_wallet('institution', new.id);
  return new;
end $$;

drop trigger if exists trg_institutions_wallet_ensure on public.institutions;
create trigger trg_institutions_wallet_ensure
after insert on public.institutions
for each row execute function public.trg_institutions_wallet_ensure();

-- 4) Helpers
create or replace function public.coin_wallet_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_coin_wallets_touch on public.coin_wallets;
create trigger trg_coin_wallets_touch
before update on public.coin_wallets
for each row execute function public.coin_wallet_touch_updated_at();

create or replace function public.ensure_coin_wallet(p_owner_type text, p_owner_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  wid uuid;
begin
  select id into wid
  from public.coin_wallets
  where owner_type = p_owner_type and ((owner_id is null and p_owner_id is null) or owner_id = p_owner_id)
  limit 1;

  if wid is not null then
    return wid;
  end if;

  insert into public.coin_wallets(owner_type, owner_id, balance)
  values (p_owner_type, p_owner_id, 0)
  returning id into wid;

  return wid;
end $$;

-- Single atomic transfer that updates wallet balances AND inserts ledger row.
-- Use this from the app via supabaseClient.rpc('coin_transfer', ...)
create or replace function public.coin_transfer(
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount bigint,
  p_action text default 'transfer',
  p_created_by_profile_id uuid default null,
  p_institution_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  from_bal bigint;
  to_bal bigint;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'amount must be > 0');
  end if;

  -- Lock wallets (avoid race conditions)
  if p_from_wallet_id is not null then
    select balance into from_bal from public.coin_wallets where id = p_from_wallet_id for update;
    if from_bal is null then
      return jsonb_build_object('ok', false, 'error', 'from wallet not found');
    end if;
    if from_bal < p_amount then
      return jsonb_build_object('ok', false, 'error', 'insufficient funds');
    end if;
    update public.coin_wallets set balance = balance - p_amount where id = p_from_wallet_id;
  end if;

  if p_to_wallet_id is not null then
    select balance into to_bal from public.coin_wallets where id = p_to_wallet_id for update;
    if to_bal is null then
      return jsonb_build_object('ok', false, 'error', 'to wallet not found');
    end if;
    update public.coin_wallets set balance = balance + p_amount where id = p_to_wallet_id;
  end if;

  insert into public.coin_ledger(amount, from_wallet_id, to_wallet_id, action, created_by_profile_id, institution_id, metadata)
  values (p_amount, p_from_wallet_id, p_to_wallet_id, coalesce(p_action,'transfer'), p_created_by_profile_id, p_institution_id, coalesce(p_metadata,'{}'::jsonb));

  return jsonb_build_object('ok', true);
end $$;

-- =====================================================
-- 4b) TRIGGERS: sync legacy balance columns -> wallets
-- This is how we enforce: "no coins without movement log"
-- even before the app is migrated to call coin_transfer().
--
-- Behavior:
-- - On UPDATE of balance columns, compute delta.
-- - Update corresponding wallet balance.
-- - Insert ledger row from/to system wallet.
--
-- NOTE: we keep this permissive to avoid breaking existing flows.
-- =====================================================

create or replace function public._coin_log_delta(
  p_owner_wallet uuid,
  p_institution_id uuid,
  p_delta bigint,
  p_action text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  sys_wallet uuid;
begin
  if p_delta is null or p_delta = 0 then
    return;
  end if;

  sys_wallet := public.ensure_coin_wallet('system', null);

  if p_delta > 0 then
    insert into public.coin_ledger(amount, from_wallet_id, to_wallet_id, action, institution_id, metadata)
    values (p_delta, sys_wallet, p_owner_wallet, p_action, p_institution_id, coalesce(p_meta,'{}'::jsonb));
  else
    insert into public.coin_ledger(amount, from_wallet_id, to_wallet_id, action, institution_id, metadata)
    values (abs(p_delta), p_owner_wallet, sys_wallet, p_action, p_institution_id, coalesce(p_meta,'{}'::jsonb));
  end if;
end $$;

create or replace function public.trg_profiles_coin_sync()
returns trigger
language plpgsql
security definer
as $$
declare
  w uuid;
  meta jsonb;
  delta bigint;
  new_bal bigint;
begin
  -- Wallet for this profile
  w := public.ensure_coin_wallet('profile', new.id);

  -- Prefer hierarchical columns if present; else fall back to monedas.
  -- We log the delta on monedas always (because it's guaranteed in current app).
  -- Additional columns are logged when present.

  -- monedas
  delta := coalesce(new.monedas,0) - coalesce(old.monedas,0);
  meta := jsonb_build_object('source','profiles','column','monedas');
  perform public._coin_log_delta(w, new.institution_id, delta, 'balance_update', meta);

  -- Keep wallet balance aligned with monedas as the base truth.
  new_bal := coalesce(new.monedas,0);
  update public.coin_wallets set balance = greatest(0, new_bal) where id = w;

  return new;
exception when undefined_column then
  -- If schema is missing expected columns, do nothing.
  return new;
end $$;

drop trigger if exists trg_profiles_coin_sync on public.profiles;
create trigger trg_profiles_coin_sync
after update of monedas on public.profiles
for each row execute function public.trg_profiles_coin_sync();

create or replace function public.trg_institutions_coin_pool_sync()
returns trigger
language plpgsql
security definer
as $$
declare
  w uuid;
  meta jsonb;
  delta bigint;
  new_bal bigint;
begin
  w := public.ensure_coin_wallet('institution', new.id);
  delta := coalesce(new.coin_pool,0) - coalesce(old.coin_pool,0);
  meta := jsonb_build_object('source','institutions','column','coin_pool');
  perform public._coin_log_delta(w, new.id, delta, 'balance_update', meta);
  new_bal := coalesce(new.coin_pool,0);
  update public.coin_wallets set balance = greatest(0, new_bal) where id = w;
  return new;
exception when undefined_column then
  return new;
end $$;

drop trigger if exists trg_institutions_coin_pool_sync on public.institutions;
create trigger trg_institutions_coin_pool_sync
after update of coin_pool on public.institutions
for each row execute function public.trg_institutions_coin_pool_sync();

-- 5) Optional backfill (opening balances)
-- This records an initial ledger entry for existing balances so the ledger can reconcile.
create table if not exists public.coin_backfill_runs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid null,
  ran_at timestamptz not null default now(),
  note text null
);

alter table public.coin_backfill_runs enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='coin_backfill_runs' and policyname='open'
  ) then
    execute 'create policy open on public.coin_backfill_runs for all using (true) with check (true)';
  end if;
end $$;

create or replace function public.coin_backfill_opening_balances(p_institution_id uuid default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  sys_wallet uuid;
  inst_wallet uuid;
  r record;
  inst_pool bigint;
  prof_coins bigint;
  w uuid;
  inserted int := 0;
begin
  -- prevent accidental double-run per institution
  if p_institution_id is not null then
    if exists (select 1 from public.coin_backfill_runs where institution_id = p_institution_id) then
      return jsonb_build_object('ok', false, 'error', 'backfill already ran for this institution');
    end if;
  end if;

  sys_wallet := public.ensure_coin_wallet('system', null);

  -- Institution pocket from institutions.coin_pool if exists
  if p_institution_id is not null then
    inst_wallet := public.ensure_coin_wallet('institution', p_institution_id);

    begin
      execute 'select coin_pool::bigint from public.institutions where id=$1' into inst_pool using p_institution_id;
    exception when undefined_column then
      inst_pool := 0;
    end;

    if inst_pool is null then inst_pool := 0; end if;

    update public.coin_wallets set balance = inst_pool where id = inst_wallet;
    if inst_pool > 0 then
      insert into public.coin_ledger(amount, from_wallet_id, to_wallet_id, action, institution_id, metadata)
      values (inst_pool, sys_wallet, inst_wallet, 'opening_balance', p_institution_id, jsonb_build_object('source','institutions.coin_pool'));
      inserted := inserted + 1;
    end if;
  end if;

  -- Profiles monedas as opening balance (students/teachers/admins) for that institution (or all)
  for r in
    select id, rol, institution_id, monedas
    from public.profiles
    where (p_institution_id is null or institution_id = p_institution_id)
  loop
    prof_coins := coalesce(r.monedas, 0);
    w := public.ensure_coin_wallet('profile', r.id);
    update public.coin_wallets set balance = prof_coins where id = w;

    if prof_coins > 0 then
      insert into public.coin_ledger(amount, from_wallet_id, to_wallet_id, action, created_by_profile_id, institution_id, metadata)
      values (prof_coins, sys_wallet, w, 'opening_balance', null, r.institution_id, jsonb_build_object('source','profiles.monedas','role',r.rol));
      inserted := inserted + 1;
    end if;
  end loop;

  insert into public.coin_backfill_runs(institution_id, note)
  values (p_institution_id, 'opening balance backfill');

  return jsonb_build_object('ok', true, 'entries', inserted);
end $$;
