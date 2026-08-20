import { supabase } from './supabase';
import type { ChatMessage, HelpCategory, HelpSession } from './ryadomTypes';

export type VolunteerConversation = {
  requestId: string;
  category: HelpCategory;
  requestedAt: string;
  elderId: string;
  elderName: string;
  session: HelpSession;
};

type SessionRow = {
  id: string;
  help_request_id: string;
  elder_id: string;
  volunteer_id: string;
  status: HelpSession['status'];
  started_at: string;
  ended_at: string | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  sender_id: string;
  message_type: ChatMessage['messageType'];
  text: string | null;
  media_url: string | null;
  created_at: string;
};

export async function loadLatestVolunteerConversation(volunteerId: string): Promise<VolunteerConversation | null> {
  const { data, error } = await supabase
    .from('help_sessions')
    .select('id, help_request_id, elder_id, volunteer_id, status, started_at, ended_at')
    .eq('volunteer_id', volunteerId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as SessionRow;
  const [{ data: request }, { data: elder }] = await Promise.all([
    supabase.from('help_requests').select('category, created_at').eq('id', row.help_request_id).maybeSingle(),
    supabase.from('profiles').select('name').eq('id', row.elder_id).maybeSingle(),
  ]);

  return {
    requestId: row.help_request_id,
    category: toHelpCategory(request?.category),
    requestedAt: request?.created_at ?? row.started_at,
    elderId: row.elder_id,
    elderName: elder?.name?.trim() || 'Пожилой пользователь',
    session: {
      id: row.id,
      helpRequestId: row.help_request_id,
      elderUserId: row.elder_id,
      volunteerId: row.volunteer_id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? undefined,
    },
  };
}

export async function loadChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, session_id, sender_id, message_type, text, media_url, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MessageRow[]).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    senderId: row.sender_id,
    messageType: row.message_type,
    text: row.text ?? '',
    fileUrl: row.media_url ?? undefined,
    createdAt: row.created_at,
  }));
}

export function watchVolunteerConversations(volunteerId: string, onChanged: () => void) {
  const channel = supabase
    .channel(`volunteer-sessions-${volunteerId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'help_sessions',
      filter: `volunteer_id=eq.${volunteerId}`,
    }, onChanged)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function watchChatMessages(sessionId: string, onChanged: () => void) {
  const channel = supabase
    .channel(`chat-messages-${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `session_id=eq.${sessionId}`,
    }, onChanged)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

function toHelpCategory(value: unknown): HelpCategory {
  const categories: HelpCategory[] = ['phone', 'messengers', 'internet', 'settings', 'apps', 'payments', 'talk', 'any'];
  return typeof value === 'string' && categories.includes(value as HelpCategory) ? value as HelpCategory : 'any';
}
