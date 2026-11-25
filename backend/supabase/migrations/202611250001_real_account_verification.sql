alter table public.trading_accounts
  drop constraint if exists trading_accounts_connection_status_check,
  drop constraint if exists trading_accounts_verification_status_check;

update public.trading_accounts
set connection_status = 'pending_verification',
    verification_status = 'pending_verification',
    verified_account_type = null,
    ownership_verified = null,
    roi = null
where connection_status = 'verified_real'
  and (
    verified_account_type is distinct from 'REAL'
    or ownership_verified is distinct from true
    or metaapi_account_id is null
    or account_type is distinct from 'forex'
  );

update public.trading_accounts
set connection_status = case verified_account_type
      when 'DEMO' then 'demo_account'
      when 'CONTEST' then 'contest_account'
      else 'pending_verification'
    end,
    verification_status = case verified_account_type
      when 'DEMO' then 'demo_account'
      when 'CONTEST' then 'contest_account'
      else 'pending_verification'
    end
where connection_status = 'connected';

update public.trading_accounts
set verification_status = connection_status
where connection_status in ('demo_account', 'contest_account');

update public.trading_accounts
set balance = null,
    equity = null,
    free_margin = null,
    used_margin = null,
    leverage = null,
    total_pnl = null,
    daily_pnl = null,
    weekly_pnl = null,
    monthly_pnl = null,
    yearly_pnl = null,
    total_trades = null,
    winning_trades = null,
    losing_trades = null,
    win_rate = null,
    roi = null,
    maximum_drawdown = null
where connection_status <> 'verified_real';

delete from public.trading_open_positions position
using public.trading_accounts account
where account.id = position.account_id
  and account.connection_status <> 'verified_real';

alter table public.trading_accounts
  add constraint trading_accounts_connection_status_check
    check (connection_status in (
      'not_connected',
      'connecting',
      'connected',
      'verified_real',
      'demo_account',
      'contest_account',
      'pending_verification',
      'connection_failed',
      'integration_not_configured',
      'disconnected'
    )),
  add constraint trading_accounts_verification_status_check
    check (verification_status in (
      'connected',
      'verified_real',
      'demo_account',
      'contest_account',
      'pending_verification',
      'connection_failed',
      'disconnected'
    )),
  add constraint trading_accounts_verified_real_eligibility_check
    check (
      connection_status <> 'verified_real'
      or (
        account_type = 'forex'
        and verified_account_type = 'REAL'
        and ownership_verified is true
        and metaapi_account_id is not null
      )
    );

create table if not exists public.trading_account_verification_audit (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(user_id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  provider_account_type text check (provider_account_type in ('REAL', 'DEMO', 'CONTEST')),
  decision text not null check (decision in (
    'verified_real',
    'demo_account',
    'contest_account',
    'pending_verification',
    'connection_failed'
  )),
  reason text not null,
  decided_at timestamptz not null default now()
);

create index if not exists trading_account_verification_audit_account_time_idx
  on public.trading_account_verification_audit (account_id, decided_at desc);

alter table public.trading_account_verification_audit enable row level security;
revoke all on public.trading_account_verification_audit from anon, authenticated;
grant all on public.trading_account_verification_audit to service_role;
