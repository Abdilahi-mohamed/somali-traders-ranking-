create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9._-]{3,32}$'),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant all on public.admin_users to service_role;
