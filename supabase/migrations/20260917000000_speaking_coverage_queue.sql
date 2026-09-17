create table public.english_os_speaking_sessions (
  id text primary key,
  lesson_id text not null,
  state jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.english_os_speaking_sessions enable row level security;
revoke all on public.english_os_speaking_sessions from public, anon, authenticated;
grant select, insert, update on public.english_os_speaking_sessions to service_role;
create unique index english_os_speaking_one_active_lesson on public.english_os_speaking_sessions(lesson_id) where not closed;
create index english_os_speaking_lesson_created on public.english_os_speaking_sessions(lesson_id, created_at desc);
comment on table public.english_os_speaking_sessions is 'V2.24 authoritative logical sessions. Only the Speaking Edge Function writes verified coverage; independent of legacy whole-state Cloud Sync.';
