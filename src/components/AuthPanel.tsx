import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/ryadomProfile';
import type { Language } from '../lib/i18n';
import { uiText } from '../lib/i18n';
import { ActionButton, PhoneShell } from './RyadomUi';
import { SupabaseSetupMessage } from './SupabaseSetupMessage';

type AuthPanelProps = {
  language: Language;
  onGuest?: () => void;
};

export function AuthPanel({ language, onGuest }: AuthPanelProps) {
  const text = uiText[language];
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
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setMessage(error.message);
          return;
        }
        if (data.session) return;
        setMode('signin');
        setMessage('Аккаунт создан. Подтвердите email в письме, потом войдите здесь.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage('Не получилось войти. Проверьте email, пароль и подтверждение почты.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <section className="app-intro" aria-hidden="true">
        <img src="/app-icon.svg" alt="" />
        <strong>KOMEK</strong>
      </section>
      <section className="login-hero">
        <img className="brand-symbol brand-symbol--hero" src="/app-icon.svg" alt="" aria-hidden="true" />
        <p className="eyebrow">{text.service}</p>
        <h1>KOMEK</h1>
        <p className="brand-tagline">Generations helping generations.</p>
        <p>{text.intro}</p>
      </section>

      <ActionButton onClick={handleGoogle} disabled={busy}>{text.google}</ActionButton>

      {onGuest ? <ActionButton tone="calm" onClick={onGuest}>{text.guest}</ActionButton> : null}

      <form className="form-card" onSubmit={handleEmail}>
        <input type="email" placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <input type="password" placeholder={text.password} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
        <button className="submit-button" disabled={busy}>{mode === 'signin' ? text.signIn : text.signUp}</button>
      </form>

      {message ? <p className="message">{message}</p> : null}

      <ActionButton tone="ghost" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? text.signUp : text.haveAccount}
      </ActionButton>
    </PhoneShell>
  );
}
