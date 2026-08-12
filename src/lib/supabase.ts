import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  normalizeSupabaseUrl(url) ?? 'https://not-configured.supabase.co',
  anonKey ?? 'not-configured',
);

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) return undefined;

  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  }
}
