create table if not exists google_calendar_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  scope text,
  token_type text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table google_calendar_tokens enable row level security;

create policy "Allow service role full access" on google_calendar_tokens
  for all
  using (auth.role() = 'service_role');

create policy "Allow user read own google calendar tokens"
  on google_calendar_tokens
  for select
  using (auth.uid() = user_id);
