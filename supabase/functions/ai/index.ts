// AI-функция на бесплатном ключе Google Gemini.
// Вызов с фронта: supabase.functions.invoke('ai', { body: { prompt, system } })
//
// Запуск (один раз):
//   1) Добавь GEMINI_API_KEY в локальный .env
//   2) Загрузи секрет:  npm run ai:secret
//   3) Задеплой:        npm run ai:deploy

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-3.5-flash';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: unknown }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Используй POST-запрос' }, 405);

  try {
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      return json({ error: 'AI пока не настроен. Попроси наставника проверить секрет.' }, 503);
    }

    const body = (await req.json()) as { prompt?: unknown; system?: unknown; mode?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const system = typeof body.system === 'string' ? body.system.trim() : '';
    const mode = body.mode === 'moderate' ? 'moderate' : 'chat';

    if (!prompt) return json({ error: 'Напиши запрос для AI.' }, 400);
    if (prompt.length > 10_000 || system.length > 5_000) {
      return json({ error: 'Запрос слишком длинный. Сделай его короче.' }, 400);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: mode === 'moderate'
            ? {
              temperature: 0,
              responseMimeType: 'application/json',
            }
            : undefined,
        }),
      },
    );

    const data = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      console.error('Gemini request failed', response.status, data);
      const geminiError = data.error?.message ? ` Gemini: ${data.error.message}` : '';
      return json({ error: `AI сейчас не ответил. Код ${response.status}.${geminiError}` }, 502);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      console.error('Gemini returned an empty response', data);
      return json({ error: 'AI вернул пустой ответ. Попробуй переформулировать запрос.' }, 502);
    }

    return json({ text });
  } catch (error) {
    console.error('AI function failed', error);
    return json({ error: 'Не получилось обратиться к AI. Попробуй ещё раз.' }, 500);
  }
});
