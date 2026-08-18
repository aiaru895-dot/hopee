import { supabase } from './supabase';
import type { ChatMessage, HelpCategory, HelpSession, ReportReason } from './ryadomTypes';

export async function saveHelpRequest(elderId: string, category: HelpCategory) {
  const { data, error } = await supabase
    .from('help_requests')
    .insert({ elder_id: elderId, category, status: 'waiting' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
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
