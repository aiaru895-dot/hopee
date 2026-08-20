alter table public.help_sessions replica identity full;
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'help_sessions'
  ) then
    alter publication supabase_realtime add table public.help_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

drop policy if exists "profiles read conversation participants" on public.profiles;
create policy "profiles read conversation participants"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.help_sessions session
      where (session.elder_id = profiles.id or session.volunteer_id = profiles.id)
        and public.current_profile_id() in (session.elder_id, session.volunteer_id)
    )
  );
