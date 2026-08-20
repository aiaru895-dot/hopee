import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/ryadomProfile';
import type { Language } from '../lib/i18n';
import { uiText } from '../lib/i18n';
import { ActionButton, PhoneShell } from './RyadomUi';
import { SupabaseSetupMessage } from './SupabaseSetupMessage';

export function AuthPanel({ language }: { language: Language }) {
  const text = uiText[language];
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <PhoneShell screenKey="setup" language={language}>
        <SupabaseSetupMessage />
      </PhoneShell>
    );
  }

  async function handleGoogle() {
    setBusy(true);
    setMessage('');
    const { error } = await signInWithGoogle();
    if (error) setMessage(formatAuthError(error.message));
    setBusy(false);
  }

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
        if (!firstName.trim() || !lastName.trim()) {
          setMessage('Введите имя и фамилию.');
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName },
          },
        });
        if (error) {
          setMessage(formatAuthError(error.message));
          return;
        }
        if (data.session) return;
        setMode('signin');
        setMessage('Аккаунт создан. Подтвердите email в письме, потом войдите здесь.');
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(formatAuthError(error.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell screenKey="auth" language={language}>
      <header className="desktop-app-header">
        <strong><img className="brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />KÖMEK</strong>
        <span>{text.service}</span>
      </header>
      <div className="auth-layout">
        <section className="login-hero">
          <img className="brand-symbol brand-symbol--hero" src="/app-icon.png" alt="" aria-hidden="true" />
          <p className="eyebrow">{text.service}</p>
          <h1>KÖMEK</h1>
          <p className="brand-tagline">Generations helping generations.</p>
          <p>{text.intro}</p>
        </section>
        <section className="auth-card">
          <div className="auth-card__header">
            <p className="eyebrow">{mode === 'signin' ? text.signIn : text.signUp}</p>
            <h2>{mode === 'signin' ? text.signIn : text.signUp}</h2>
          </div>
          <div className="auth-actions">
            <ActionButton onClick={handleGoogle} disabled={busy}>{busy ? 'Загрузка...' : text.google}</ActionButton>
          </div>
          <form className="form-card" onSubmit={handleEmail}>
            {mode === 'signup' ? (
              <div className="name-grid">
                <input type="text" placeholder={text.firstName} value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
                <input type="text" placeholder={text.lastName} value={lastName} onChange={(event) => setLastName(event.target.value)} required />
              </div>
            ) : null}
            <input type="email" placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input type="password" placeholder={text.password} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            <button className="submit-button" disabled={busy}>{busy ? 'Загрузка...' : mode === 'signin' ? text.signIn : text.signUp}</button>
          </form>
          {message ? <p className="form-message">{message}</p> : null}
          <ActionButton tone="ghost" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? text.signUp : text.haveAccount}
          </ActionButton>
        </section>
      </div>
    </PhoneShell>
  );
}

function formatAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Не получилось войти. Проверьте email и пароль.';
  if (/email not confirmed/i.test(message)) return 'Почта ещё не подтверждена. Откройте письмо от Supabase и подтвердите email.';
  if (/user already registered|already registered/i.test(message)) return 'Аккаунт с этим email уже есть. Нажмите “У меня уже есть аккаунт”.';
  if (/password/i.test(message)) return 'Пароль должен быть не короче 6 символов.';
  if (/rate limit|too many/i.test(message)) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (/network|fetch/i.test(message)) return 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.';
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

