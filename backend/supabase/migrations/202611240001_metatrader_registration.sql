alter table public.trading_accounts
  alter column account_category drop not null;

alter table public.trading_accounts
  drop constraint if exists trading_accounts_check;

alter table public.trading_accounts
  add column if not exists account_currency text,
  add column if not exists verification_status text not null default 'pending_verification'
    check (verification_status in (
      'connected',
      'verified_real',
      'demo_account',
      'pending_verification',
      'connection_failed',
      'disconnected'
    )),
  add column if not exists verified_account_type text
    check (verified_account_type in ('REAL', 'DEMO', 'CONTEST')),
  add column if not exists last_synced_at timestamptz;

create unique index if not exists trading_accounts_mt_login_unique
  on public.trading_accounts (platform, lower(broker_name), lower(server_name), account_number)
  where account_type = 'forex';

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
      (trader_id, account_type, platform, broker_name, server_name, account_number, account_currency, show_balance)
    values
      (p_user_id, 'forex', p_account->>'platform', p_account->>'brokerName', p_account->>'server',
        p_account->>'accountNumber', p_account->>'currency',
        coalesce((p_account->>'showBalance')::boolean, false));
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
