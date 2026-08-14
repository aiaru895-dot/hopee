import { supabase } from './supabase';
import type { Role } from './ryadomTypes';
import { cleanDisplayName } from './displayText';

export type ProfileRow = {
  id: string;
  auth_user_id: string;
  role: Role;
  name: string;
  age: number | null;
  city: string | null;
  avatar_url: string | null;
};

export type VolunteerProfileRow = {
  xp: number;
  level: number;
  title: string;
  rating: number;
  people_helped: number;
  thanks_received: number;
  successful_help_count: number;
  trust_level?: string;
  verification_status?: string;
};

const volunteerStatsSelect = 'xp, level, title, rating, people_helped, thanks_received, successful_help_count, trust_level, verification_status';

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function loadMyProfile() {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function createMyProfile(role: Role, name: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const authUser = authData.user;
  if (!authUser) throw new Error('Сначала войдите в аккаунт.');

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      auth_user_id: authUser.id,
      role,
      name: cleanDisplayName(name, role),
      age: role === 'elder' ? 72 : 24,
      city: 'Алматы',
    })
    .select('*')
    .single();
  if (error) throw error;

  if (role === 'volunteer') await createVolunteerProfile(data.id);
  return data as ProfileRow;
}

export async function createVolunteerProfile(profileId: string) {
  const { error } = await supabase.from('volunteer_profiles').insert({
    user_id: profileId,
    verified: false,
    verification_status: 'new',
    trust_level: 'NEW',
    trust_score: 30,
    risk_score: 0,
    xp: 0,
    level: 1,
    title: 'Новый помощник',
  });
  if (error) throw error;
}

export async function updateMyProfileName(profileId: string, name: string) {
  const { error } = await supabase.from('profiles').update({ name }).eq('id', profileId);
  if (error) throw error;
}

export async function loadVolunteerStats(profileId: string) {
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .select(volunteerStatsSelect)
    .eq('user_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data as VolunteerProfileRow | null;
}

export async function addVolunteerThanks(profileId: string) {
  const stats = await loadVolunteerStats(profileId);
  if (!stats) return null;
  const xp = stats.xp + 35;
  const level = Math.max(1, Math.floor(xp / 200) + 1);
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .update({
      xp,
      level,
      people_helped: stats.people_helped + 1,
      successful_help_count: stats.successful_help_count + 1,
      thanks_received: stats.thanks_received + 1,
    })
    .eq('user_id', profileId)
    .select(volunteerStatsSelect)
    .single();
  if (error) throw error;
  return data as VolunteerProfileRow;
}
