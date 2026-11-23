create table if not exists public.trader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  trading_alias text not null,
  email text not null,
  phone text not null,
  region text not null,
  social_profile text not null default '',
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'flagged')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists trader_profiles_email_lower_unique
  on public.trader_profiles (lower(email));

create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(user_id) on delete cascade,
  account_type text not null check (account_type in ('forex', 'crypto')),
  account_category text check (account_category in ('live', 'prop')),
  prop_firm text,
  platform text check (platform in ('MT4', 'MT5')),
  broker_name text,
  server_name text,
  account_number text,
  exchange_name text check (exchange_name in ('Binance', 'Bybit', 'OKX', 'Other')),
  account_label text,
  show_balance boolean not null default false,
  created_at timestamptz not null default now(),
  check (
    (account_type = 'forex' and account_category is not null and platform is not null
      and broker_name is not null and server_name is not null and account_number is not null
      and exchange_name is null)
    or
    (account_type = 'crypto' and exchange_name is not null and account_category is null
      and platform is null and broker_name is null and server_name is null and account_number is null)
  )
);

alter table public.trader_profiles enable row level security;
alter table public.trading_accounts enable row level security;

revoke all on public.trader_profiles from anon, authenticated;
revoke all on public.trading_accounts from anon, authenticated;
grant select on public.trader_profiles to authenticated;
grant select on public.trading_accounts to authenticated;
grant all on public.trader_profiles to service_role;
grant all on public.trading_accounts to service_role;

drop policy if exists "traders can read their own profile" on public.trader_profiles;
create policy "traders can read their own profile"
  on public.trader_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "traders can read their own accounts" on public.trading_accounts;
create policy "traders can read their own accounts"
  on public.trading_accounts for select to authenticated
  using ((select auth.uid()) = trader_id);

create or replace function public.create_trader_registration(
  p_user_id uuid,
  p_full_name text,
  p_alias text,
  p_email text,
  p_phone text,
  p_region text,
  p_social text,
  p_account jsonb,
  p_consent_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not authorized';
  end if;

  insert into public.trader_profiles
    (user_id, full_name, trading_alias, email, phone, region, social_profile, consent_at)
  values
    (p_user_id, p_full_name, p_alias, lower(p_email), p_phone, p_region, p_social, p_consent_at);

  if p_account->>'type' = 'forex' then
    insert into public.trading_accounts
      (trader_id, account_type, account_category, prop_firm, platform, broker_name, server_name, account_number, show_balance)
    values
      (p_user_id, 'forex', p_account->>'category', nullif(p_account->>'propFirm', ''),
        p_account->>'platform', p_account->>'brokerName', p_account->>'server',
        p_account->>'accountNumber', coalesce((p_account->>'showBalance')::boolean, false));
  elsif p_account->>'type' = 'crypto' then
    insert into public.trading_accounts
      (trader_id, account_type, exchange_name, account_label, show_balance)
    values
      (p_user_id, 'crypto', p_account->>'exchange', coalesce(p_account->>'accountLabel', ''),
        coalesce((p_account->>'showBalance')::boolean, false));
  else
    raise exception 'invalid account type';
  end if;
end;
$$;

revoke all on function public.create_trader_registration(uuid, text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_trader_registration(uuid, text, text, text, text, text, text, jsonb, timestamptz)
  to service_role;
