alter table public.profiles
  add column if not exists is_moderator boolean not null default false,
  add column if not exists safety_risk_level text not null default 'normal';

alter table public.volunteer_profiles
  add column if not exists trust_level text not null default 'NEW',
  add column if not exists account_status text not null default 'active',
  add column if not exists accepted_rules_at timestamptz,
  add column if not exists email_confirmed boolean not null default false,
  add column if not exists phone_confirmed boolean not null default false,
  add column if not exists serious_reports_count integer not null default 0,
  add column if not exists cancelled_help_count integer not null default 0,
  add column if not exists blocked_count integer not null default 0,
  add column if not exists restricted_until timestamptz,
  add column if not exists last_trust_review_at timestamptz;

alter table public.volunteer_profiles
  alter column verified set default false,
  alter column verification_status set default 'new',
  alter column trust_score set default 30;

update public.volunteer_profiles
set trust_level = case
    when account_status in ('suspended', 'banned') then 'SUSPENDED'
    when verified and trust_score >= 90 and successful_help_count >= 50 and reports_count = 0 then 'TRUSTED'
    when verified and trust_score >= 70 then 'VERIFIED'
    when successful_help_count >= 5 then 'BASIC'
    else 'NEW'
  end,
  verification_status = case
    when verified then 'verified'
    when verification_status in ('pending', 'new') then 'new'
    else verification_status
  end;

alter table public.reports
  add column if not exists reason_code text,
  add column if not exists severity text not null default 'normal',
  add column if not exists moderation_notes text,
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null;

update public.reports
set reason_code = coalesce(reason_code, reason),
    severity = case
      when lower(reason) similar to '%(password|sms|pin|bank|money|card|парол|смс|код|банк|деньг|карт)%' then 'high'
      else severity
    end;

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.help_sessions (id) on delete set null,
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  reason_code text not null,
  severity text not null default 'normal',
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.moderation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  moderation_event_id uuid references public.moderation_events (id) on delete set null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.safety_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.help_sessions (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_profile_id)
);

create index if not exists volunteer_profiles_matching_idx
  on public.volunteer_profiles (account_status, trust_level, verified, online, busy, trust_score desc, successful_help_count desc);

create index if not exists reports_moderation_idx
  on public.reports (status, severity, created_at desc);

create index if not exists moderation_events_queue_idx
  on public.moderation_events (status, severity, created_at desc);

create index if not exists safety_blocks_pair_idx
  on public.safety_blocks (blocker_id, blocked_profile_id);

alter table public.moderation_events enable row level security;
alter table public.moderation_audit_logs enable row level security;
alter table public.safety_blocks enable row level security;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.volunteer_profiles to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert on public.moderation_events to authenticated;
grant select, insert on public.moderation_audit_logs to authenticated;
grant select, insert, delete on public.safety_blocks to authenticated;

create policy "moderation events insert own"
  on public.moderation_events for insert
  to authenticated
  with check (reporter_id = public.current_profile_id());

create policy "moderators read moderation events"
  on public.moderation_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.is_moderator = true
    )
  );

create policy "moderators update moderation events"
  on public.moderation_events for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.is_moderator = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.is_moderator = true
    )
  );

create policy "moderators read audit logs"
  on public.moderation_audit_logs for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.is_moderator = true
    )
  );

create policy "moderators insert audit logs"
  on public.moderation_audit_logs for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = (select auth.uid())
        and p.is_moderator = true
    )
  );

create policy "safety blocks own rows"
  on public.safety_blocks for all
  to authenticated
  using (blocker_id = public.current_profile_id())
  with check (blocker_id = public.current_profile_id());

create policy "media update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'ryadom-media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'ryadom-media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
