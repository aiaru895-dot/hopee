drop policy if exists "profiles read active volunteers" on public.profiles;
create policy "profiles read active volunteers"
  on public.profiles for select
  using (
    auth.uid() = auth_user_id
    or role = 'volunteer'
  );

drop policy if exists "volunteers read available" on public.volunteer_profiles;
create policy "volunteers read available"
  on public.volunteer_profiles for select
  using (
    user_id = public.current_profile_id()
    or verified
    or online
  );

drop policy if exists "requests read waiting by volunteers" on public.help_requests;
create policy "requests read waiting by volunteers"
  on public.help_requests for select
  using (
    elder_id = public.current_profile_id()
    or matched_volunteer_id = public.current_profile_id()
    or (
      status = 'waiting'
      and exists (
        select 1
        from public.profiles p
        where p.id = public.current_profile_id()
          and p.role = 'volunteer'
      )
    )
  );
