import { useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { signInWithGoogle } from '../lib/ryadomProfile';
import { ActionButton, PhoneShell } from './RyadomUi';
import { SupabaseSetupMessage } from './SupabaseSetupMessage';

export function AuthPanel() {
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
      <section className="login-hero">
        <div className="heart-badge">❤️</div>
        <h1>Рядом</h1>
        <p>Войдите, и ваша помощь сохранится.</p>
        <div className="elder-people" aria-label="Пожилые люди улыбаются">
          <AnimatedElder icon="👵" name="Валентина" />
          <AnimatedElder icon="👴" name="Николай" />
        </div>
      </section>

      <ActionButton onClick={handleGoogle} disabled={busy}>Войти через Google</ActionButton>

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

function AnimatedElder({ icon, name }: { icon: string; name: string }) {
  return (
    <article className="elder-card">
      <span>{icon}</span>
      <strong>{name}</strong>
      <small>ждет помощи</small>
    </article>
  );
}
