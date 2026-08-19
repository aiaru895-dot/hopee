import { supabase } from './supabase';
import type { ChatMessage, HelpCategory, HelpSession, ReportReason, Volunteer } from './ryadomTypes';

type VolunteerProfileRow = {
  user_id: string;
  verified: boolean;
  rating: number;
  rating_count: number;
  xp: number;
  level: number;
  title: string;
  successful_help_count: number;
  people_helped: number;
  thanks_received: number;
  trust_score: number;
  risk_score: number;
  reports_count: number;
  online: boolean;
  busy: boolean;
  trust_level?: Volunteer['profile']['trustLevel'];
  serious_reports_count?: number;
  blocked_count?: number;
  profiles?: {
    id: string;
    role: 'volunteer';
    name: string;
    age: number | null;
    city: string | null;
    avatar_url: string | null;
    created_at: string;
  };
};

export async function saveHelpRequest(elderId: string, category: HelpCategory) {
  const { data, error } = await supabase
    .from('help_requests')
    .insert({ elder_id: elderId, category, status: 'waiting' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function setMyVolunteerOnline(profileId: string, online: boolean) {
  const { error } = await supabase
    .from('volunteer_profiles')
    .update({ online, busy: false })
    .eq('user_id', profileId);
  if (error) throw error;
}

export async function findOnlineVolunteer(elderId: string, category: HelpCategory) {
  const { data, error } = await supabase
    .from('volunteer_profiles')
    .select(`
      user_id,
      verified,
      rating,
      rating_count,
      xp,
      level,
      title,
      successful_help_count,
      people_helped,
      thanks_received,
      trust_score,
      risk_score,
      reports_count,
      online,
      busy,
      trust_level,
      serious_reports_count,
      blocked_count,
      profiles!inner(id, role, name, age, city, avatar_url, created_at)
    `)
    .eq('online', true)
    .eq('busy', false)
    .neq('user_id', elderId)
    .limit(12);
  if (error) throw error;

  const rows = (data ?? []) as unknown as VolunteerProfileRow[];
  const available = rows
    .filter((row) => row.profiles?.role === 'volunteer')
    .filter((row) => category === 'any' || row.verified || row.trust_level !== 'BANNED')
    .sort((a, b) => b.trust_score - a.trust_score);
  const row = available[0];
  if (!row?.profiles) return null;
  return toVolunteer(row);
}

export async function createSupabaseHelpSession(requestId: string, elderId: string, volunteerId: string): Promise<HelpSession> {
  const { data, error } = await supabase
    .from('help_sessions')
    .insert({
      help_request_id: requestId,
      elder_id: elderId,
      volunteer_id: volunteerId,
      status: 'active',
    })
    .select('id, started_at, status')
    .single();
  if (error) throw error;

  await supabase
    .from('help_requests')
    .update({ status: 'matched', matched_volunteer_id: volunteerId, matched_at: new Date().toISOString() })
    .eq('id', requestId);

  return {
    id: data.id as string,
    helpRequestId: requestId,
    elderUserId: elderId,
    volunteerId,
    startedAt: data.started_at as string,
    status: data.status as HelpSession['status'],
  };
}

export async function saveChatMessage(message: ChatMessage) {
  const { error } = await supabase.from('messages').insert({
    id: message.id,
    session_id: message.sessionId,
    sender_id: message.senderId,
    message_type: message.messageType,
    text: message.text,
    media_url: message.fileUrl,
  });
  if (error) throw error;
}

export async function saveSafetyReport(
  session: HelpSession | undefined,
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  description: string,
) {
  const { error } = await supabase.from('reports').insert({
    session_id: session?.id,
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    description,
    status: 'open',
  });
  if (error) throw error;
}

function toVolunteer(row: VolunteerProfileRow): Volunteer {
  const profile = row.profiles;
  if (!profile) throw new Error('У помощника нет профиля.');
  return {
    id: row.user_id,
    role: 'volunteer',
    name: profile.name,
    age: profile.age ?? 0,
    city: profile.city ?? '',
    avatar: profile.name.slice(0, 1).toUpperCase(),
    createdAt: profile.created_at,
    status: 'online',
    profile: {
      userId: row.user_id,
      verified: row.verified,
      skills: ['any'],
      rating: Number(row.rating),
      ratingCount: row.rating_count,
      xp: row.xp,
      level: row.level,
      title: row.title,
      successfulHelpCount: row.successful_help_count,
      peopleHelped: row.people_helped,
      thanksReceived: row.thanks_received,
      trustScore: row.trust_score,
      riskScore: row.risk_score,
      trustLevel: row.trust_level ?? 'NEW',
      reportsCount: row.reports_count,
      seriousReportsCount: row.serious_reports_count ?? 0,
      blockedCount: row.blocked_count ?? 0,
      online: row.online,
      busy: row.busy,
    },
  };
}
