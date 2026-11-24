alter table public.trading_accounts
  add column if not exists connection_status text not null default 'not_connected'
    check (connection_status in (
      'not_connected',
      'connecting',
      'connected',
      'verified_real',
      'demo_account',
      'pending_verification',
      'connection_failed',
      'integration_not_configured',
      'disconnected'
    )),
  add column if not exists metaapi_account_id text unique,
  add column if not exists ownership_verified boolean,
  add column if not exists initial_balance numeric,
  add column if not exists balance numeric,
  add column if not exists equity numeric,
  add column if not exists free_margin numeric,
  add column if not exists used_margin numeric,
  add column if not exists leverage numeric,
  add column if not exists total_pnl numeric,
  add column if not exists daily_pnl numeric,
  add column if not exists weekly_pnl numeric,
  add column if not exists monthly_pnl numeric,
  add column if not exists yearly_pnl numeric,
  add column if not exists total_trades integer,
  add column if not exists winning_trades integer,
  add column if not exists losing_trades integer,
  add column if not exists win_rate numeric,
  add column if not exists roi numeric,
  add column if not exists maximum_drawdown numeric,
  add column if not exists first_connected_at timestamptz,
  add column if not exists last_successful_sync_at timestamptz,
  add column if not exists last_sync_error text;

create table if not exists public.trading_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  deal_id text not null,
  position_id text,
  deal_time timestamptz not null,
  deal_type text not null,
  entry_type text,
  symbol text,
  volume numeric,
  price numeric,
  profit numeric not null default 0,
  commission numeric not null default 0,
  swap numeric not null default 0,
  fee numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (account_id, deal_id)
);

create index if not exists trading_history_account_time_idx
  on public.trading_history (account_id, deal_time desc);

create table if not exists public.trading_open_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  position_id text not null,
  position_type text not null,
  symbol text not null,
  volume numeric not null,
  opened_at timestamptz not null,
  open_price numeric not null,
  current_price numeric,
  profit numeric,
  swap numeric,
  stop_loss numeric,
  take_profit numeric,
  last_synchronized_at timestamptz not null default now(),
  unique (account_id, position_id)
);

create index if not exists trading_open_positions_account_time_idx
  on public.trading_open_positions (account_id, opened_at desc);

create table if not exists public.trading_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  account_type text,
  currency text,
  balance numeric,
  equity numeric,
  free_margin numeric,
  used_margin numeric,
  leverage numeric,
  total_pnl numeric,
  daily_pnl numeric,
  weekly_pnl numeric,
  monthly_pnl numeric,
  yearly_pnl numeric,
  total_trades integer,
  winning_trades integer,
  losing_trades integer,
  win_rate numeric,
  roi numeric,
  maximum_drawdown numeric
);

create index if not exists trading_account_snapshots_account_time_idx
  on public.trading_account_snapshots (account_id, snapshot_at desc);

alter table public.trading_history enable row level security;
alter table public.trading_open_positions enable row level security;
alter table public.trading_account_snapshots enable row level security;

revoke all on public.trading_history from anon, authenticated;
revoke all on public.trading_open_positions from anon, authenticated;
revoke all on public.trading_account_snapshots from anon, authenticated;
grant select on public.trading_history to authenticated;
grant select on public.trading_open_positions to authenticated;
grant select on public.trading_account_snapshots to authenticated;
grant all on public.trading_history to service_role;
grant all on public.trading_open_positions to service_role;
grant all on public.trading_account_snapshots to service_role;

drop policy if exists "traders can read their own trading history" on public.trading_history;
create policy "traders can read their own trading history"
  on public.trading_history for select to authenticated
  using (exists (
    select 1 from public.trading_accounts account
    where account.id = trading_history.account_id
      and account.trader_id = (select auth.uid())
  ));

drop policy if exists "traders can read their own open positions" on public.trading_open_positions;
create policy "traders can read their own open positions"
  on public.trading_open_positions for select to authenticated
  using (exists (
    select 1 from public.trading_accounts account
    where account.id = trading_open_positions.account_id
      and account.trader_id = (select auth.uid())
  ));

drop policy if exists "traders can read their own account snapshots" on public.trading_account_snapshots;
create policy "traders can read their own account snapshots"
  on public.trading_account_snapshots for select to authenticated
  using (exists (
    select 1 from public.trading_accounts account
    where account.id = trading_account_snapshots.account_id
      and account.trader_id = (select auth.uid())
  ));
