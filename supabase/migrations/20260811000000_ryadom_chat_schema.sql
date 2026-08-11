create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null check (role in ('elder', 'volunteer')),
  name text not null,
  age integer check (age >= 0),
  city text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  verified boolean not null default false,
  verification_status text not null default 'pending',
  rating numeric(2, 1) not null default 5.0,
  rating_count integer not null default 0,
  xp integer not null default 0,
  level integer not null default 1,
  title text not null default 'Добрый помощник',
  successful_help_count integer not null default 0,
  people_helped integer not null default 0,
  thanks_received integer not null default 0,
  trust_score integer not null default 80,
  risk_score integer not null default 0,
  reports_count integer not null default 0,
  warnings_count integer not null default 0,
  online boolean not null default false,
  busy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'any',
  status text not null default 'waiting',
  created_at timestamptz not null default now(),
  matched_volunteer_id uuid references public.profiles (id) on delete set null,
  matched_at timestamptz
);

create table if not exists public.help_sessions (
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references public.help_requests (id) on delete cascade,
  elder_id uuid not null references public.profiles (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.help_sessions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  message_type text not null check (message_type in ('text', 'voice', 'photo', 'video', 'system')),
  text text,
  media_url text,
  thumbnail_url text,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.help_sessions (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.help_sessions (id) on delete set null,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  blocked_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, blocked_user_id)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  icon text not null,
  xp_reward integer not null default 0
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table if not exists public.volunteer_skills (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null,
  unique (volunteer_id, skill)
);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text not null,
  created_at timestamptz not null default now()
);

insert into public.achievements (code, name, description, icon, xp_reward)
values
  ('tech_helper', 'Технарь', 'Помог 10 людям с телефоном.', '📱', 100),
  ('kind_voice', 'Друг на связи', 'Провел 10 добрых разговоров.', '💬', 100),
  ('safe_helper', 'Безопасный помощник', 'Помогал без обоснованных жалоб.', '🛡️', 150)
on conflict (code) do nothing;

alter table public.profiles enable row level security;
alter table public.volunteer_profiles enable row level security;
alter table public.help_requests enable row level security;
alter table public.help_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.volunteer_skills enable row level security;
alter table public.trusted_contacts enable row level security;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid()
$$;

create policy "profiles read own" on public.profiles for select using (auth.uid() = auth_user_id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = auth_user_id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = auth_user_id);

create policy "volunteers read verified" on public.volunteer_profiles for select using (verified or user_id = public.current_profile_id());
create policy "volunteers write own" on public.volunteer_profiles for all using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());

create policy "skills read verified" on public.volunteer_skills for select using (true);
create policy "skills write own" on public.volunteer_skills for all using (volunteer_id = public.current_profile_id()) with check (volunteer_id = public.current_profile_id());

create policy "requests read participant" on public.help_requests for select using (elder_id = public.current_profile_id() or matched_volunteer_id = public.current_profile_id());
create policy "requests insert elder" on public.help_requests for insert with check (elder_id = public.current_profile_id());
create policy "requests update participant" on public.help_requests for update using (elder_id = public.current_profile_id() or matched_volunteer_id = public.current_profile_id());

create policy "sessions read participant" on public.help_sessions for select using (elder_id = public.current_profile_id() or volunteer_id = public.current_profile_id());
create policy "sessions insert participant" on public.help_sessions for insert with check (elder_id = public.current_profile_id() or volunteer_id = public.current_profile_id());
create policy "sessions update participant" on public.help_sessions for update using (elder_id = public.current_profile_id() or volunteer_id = public.current_profile_id());

create policy "messages read session participant" on public.messages for select using (
  exists (
    select 1 from public.help_sessions s
    where s.id = session_id and (s.elder_id = public.current_profile_id() or s.volunteer_id = public.current_profile_id())
  )
);
create policy "messages insert session participant" on public.messages for insert with check (
  sender_id = public.current_profile_id()
  and exists (
    select 1 from public.help_sessions s
    where s.id = session_id and (s.elder_id = public.current_profile_id() or s.volunteer_id = public.current_profile_id())
  )
);

create policy "ratings own sessions" on public.ratings for all using (from_user_id = public.current_profile_id() or to_user_id = public.current_profile_id()) with check (from_user_id = public.current_profile_id());
create policy "reports own reports" on public.reports for all using (reporter_id = public.current_profile_id()) with check (reporter_id = public.current_profile_id());
create policy "blocks own rows" on public.blocked_users for all using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
create policy "achievements public read" on public.achievements for select using (true);
create policy "user achievements own" on public.user_achievements for all using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());
create policy "trusted contacts own" on public.trusted_contacts for all using (user_id = public.current_profile_id()) with check (user_id = public.current_profile_id());

insert into storage.buckets (id, name, public)
values ('ryadom-media', 'ryadom-media', false)
on conflict (id) do nothing;

create policy "media read own folder" on storage.objects for select using (
  bucket_id = 'ryadom-media' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "media upload own folder" on storage.objects for insert with check (
  bucket_id = 'ryadom-media' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "media delete own folder" on storage.objects for delete using (
  bucket_id = 'ryadom-media' and auth.uid()::text = (storage.foldername(name))[1]
);
