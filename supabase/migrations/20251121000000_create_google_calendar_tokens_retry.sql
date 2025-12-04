create table if not exists public.google_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  token_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table public.google_calendar_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'google_calendar_tokens'
      and policyname = 'Allow service role full access'
  ) then
    create policy "Allow service role full access" on public.google_calendar_tokens
      for all
      using (auth.role() = 'service_role');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'google_calendar_tokens'
      and policyname = 'Allow user read own google calendar tokens'
  ) then
    create policy "Allow user read own google calendar tokens"
      on public.google_calendar_tokens
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
