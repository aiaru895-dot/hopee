import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/ryadomProfile';
import { ActionButton, PhoneShell } from './RyadomUi';
import { SupabaseSetupMessage } from './SupabaseSetupMessage';

type AuthPanelProps = {
  onGuest?: () => void;
};

export function AuthPanel({ onGuest }: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <PhoneShell>
        <SupabaseSetupMessage />
      </PhoneShell>
    );
  }

  async function handleGoogle() {
    setBusy(true);
    setMessage('');
    const { error } = await signInWithGoogle();
    if (error) setMessage(error.message);
    setBusy(false);
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message);
    else if (mode === 'signup') setMessage('Проверьте почту, если Supabase попросит подтверждение.');
    setBusy(false);
  }

  return (
    <PhoneShell>
      <section className="app-intro" aria-hidden="true">
        <img src="/app-icon.svg" alt="" />
        <strong>KOMEK</strong>
      </section>
      <section className="login-hero">
        <img className="brand-symbol brand-symbol--hero" src="/app-icon.svg" alt="" aria-hidden="true" />
        <p className="eyebrow">Сервис поддержки</p>
        <h1>KOMEK</h1>
        <p className="brand-tagline">Generations helping generations.</p>
        <p>Безопасная помощь с телефоном и повседневными цифровыми вопросами.</p>
      </section>

      <ActionButton onClick={handleGoogle} disabled={busy}>Войти через Google</ActionButton>

      {onGuest ? <ActionButton tone="calm" onClick={onGuest}>Войти как гость</ActionButton> : null}

      <form className="form-card" onSubmit={handleEmail}>
        <input type="email" placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <input type="password" placeholder="пароль" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
        <button className="submit-button" disabled={busy}>{mode === 'signin' ? 'Войти' : 'Создать аккаунт'}</button>
      </form>

      {message ? <p className="message">{message}</p> : null}

      <ActionButton tone="ghost" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Создать аккаунт' : 'Уже есть аккаунт'}
      </ActionButton>
    </PhoneShell>
  );
}
