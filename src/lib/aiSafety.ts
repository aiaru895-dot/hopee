import { supabase } from './supabase';
import type { ChatMessage } from './ryadomTypes';

export type AiSafetyResult = {
  risk: 'safe' | 'warning' | 'high';
  reason: string;
  action: 'allow' | 'warn' | 'block';
};

const safetySystem = `
Ты проверяешь чат приложения помощи пожилым людям.
Нужно выявлять мошенничество, давление, троллинг и просьбы сделать опасные действия.
Высокий риск: просьба сообщить пароль, SMS-код, PIN, банковские данные, перевести деньги, установить неизвестное приложение, перейти по подозрительной ссылке, запугивание или давление.
Не считай опасными системные предупреждения о безопасности.
Ответь только JSON без markdown:
{"risk":"safe|warning|high","reason":"коротко по-русски","action":"allow|warn|block"}
`;

export async function analyzeChatSafety(messages: ChatMessage[]): Promise<AiSafetyResult> {
  const recent = messages.slice(-8).map((item) => ({
    type: item.messageType,
    text: item.text,
    isSystem: item.messageType === 'system',
  }));

  const fallback = localSafetyCheck(recent.map((item) => item.text).join('\n'));

  try {
    const { data, error } = await supabase.functions.invoke('ai', {
      body: {
        mode: 'moderate',
        prompt: JSON.stringify({ messages: recent }),
        system: safetySystem,
      },
    });

    if (error) return fallback;
    const text = typeof data?.text === 'string' ? data.text : '';
    return parseSafetyJson(text) ?? fallback;
  } catch {
    return fallback;
  }
}

function parseSafetyJson(text: string): AiSafetyResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Partial<AiSafetyResult>;
    if (!isRisk(parsed.risk) || !isAction(parsed.action)) return null;
    return {
      risk: parsed.risk,
      action: parsed.action,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'Нужна проверка сообщения.',
    };
  } catch {
    return null;
  }
}

function localSafetyCheck(text: string): AiSafetyResult {
  const highRisk = /парол|password|sms|смс|pin|пин|код|банк|карт|деньг|перевед|установи|ссылк|личн/i.test(text);
  if (highRisk) {
    return {
      risk: 'high',
      action: 'block',
      reason: 'Обнаружена просьба о кодах, деньгах, паролях или банковских данных.',
    };
  }
  return { risk: 'safe', action: 'allow', reason: 'Опасных признаков не найдено.' };
}

function isRisk(value: unknown): value is AiSafetyResult['risk'] {
  return value === 'safe' || value === 'warning' || value === 'high';
}

function isAction(value: unknown): value is AiSafetyResult['action'] {
  return value === 'allow' || value === 'warn' || value === 'block';
}
