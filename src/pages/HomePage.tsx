import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from '../components/AuthPanel';
import { ActionButton, PhoneShell, ScreenHeader, StatusPill, TileButton } from '../components/RyadomUi';
import { VolunteerCard } from '../components/VolunteerCard';
import { achievements, elders, helpCategories } from '../lib/ryadomData';
import {
  addXP,
  createHelpRequest,
  createHelpSession,
  createMessage,
  createStarterMessages,
  findRandomVolunteer,
  finishHelpSession,
  hasSafetyRisk,
  resetMockBackend,
} from '../lib/ryadomServices';
import { createMyProfile, loadMyProfile, loadVolunteerStats, type ProfileRow, type VolunteerProfileRow } from '../lib/ryadomProfile';
import { supabase } from '../lib/supabase';
import type { Achievement, ChatMessage, HelpCategory, HelpSession, Role, Volunteer } from '../lib/ryadomTypes';

type Step =
  | 'loading'
  | 'role'
  | 'elderHome'
  | 'category'
  | 'roulette'
  | 'found'
  | 'chat'
  | 'rating'
  | 'contacts'
  | 'safety'
  | 'volunteerHome'
  | 'incoming'
  | 'volunteerProfile'
  | 'admin';

export function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [volunteerStats, setVolunteerStats] = useState<VolunteerProfileRow | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [role, setRole] = useState<Role>('elder');
  const [volunteer, setVolunteer] = useState<Volunteer>();
  const [category, setCategory] = useState<HelpCategory>('any');
  const [helpSession, setHelpSession] = useState<HelpSession>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setStep('role');
      return;
    }

    loadMyProfile()
      .then(async (savedProfile) => {
        setProfile(savedProfile);
        if (!savedProfile) {
          setStep('role');
          return;
        }
        setRole(savedProfile.role);
        setStep(savedProfile.role === 'elder' ? 'elderHome' : 'volunteerHome');
        if (savedProfile.role === 'volunteer') {
          setVolunteerStats(await loadVolunteerStats(savedProfile.id));
        }
      })
      .catch((error: Error) => setMessage(error.message));
  }, [session]);

  const chooseRole = async (nextRole: Role) => {
    setRole(nextRole);
    if (!session) {
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
      return;
    }
    try {
      const fallbackName = nextRole === 'elder' ? 'Валентина' : 'Помощник';
      const savedProfile = await createMyProfile(nextRole, session.user.user_metadata.full_name ?? fallbackName);
      setProfile(savedProfile);
      if (nextRole === 'volunteer') setVolunteerStats(await loadVolunteerStats(savedProfile.id));
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить профиль.');
    }
  };

  const startRoulette = (help: HelpCategory) => {
    setCategory(help);
    setStep('roulette');
    const request = createHelpRequest(profile?.id ?? elders[0].id, help);
    window.setTimeout(() => {
      const matched = findRandomVolunteer(help) ?? findRandomVolunteer('any');
      if (!matched) {
        setStep('category');
        return;
      }
      const nextSession = createHelpSession(request, matched);
      setVolunteer(matched);
      setHelpSession(nextSession);
      setMessages(createStarterMessages(nextSession.id, matched.id));
      setStep('found');
    }, 2400);
  };

  const sendText = () => {
    if (!helpSession || !draft.trim()) return;
    setMessages((items) => [...items, createMessage(helpSession.id, profile?.id ?? elders[0].id, 'text', draft.trim())]);
    setDraft('');
  };

  const sendQuickMedia = (type: ChatMessage['messageType']) => {
    if (!helpSession) return;
    const textByType = {
      text: '',
      system: '',
      voice: 'Голосовое сообщение, 12 секунд',
      photo: 'Фото отправлено',
      video: 'Короткое видео отправлено',
    };
    setMessages((items) => [...items, createMessage(helpSession.id, profile?.id ?? elders[0].id, type, textByType[type])]);
  };

  const completeHelp = () => {
    if (helpSession) finishHelpSession(helpSession);
    setStep('rating');
  };

  const acceptIncomingRequest = () => {
    const matched = findRandomVolunteer('talk') ?? findRandomVolunteer('any');
    if (!matched) return;
    const request = createHelpRequest(elders[0].id, 'talk');
    const nextSession = createHelpSession(request, matched);
    setVolunteer(matched);
    setHelpSession(nextSession);
    setMessages(createStarterMessages(nextSession.id, profile?.id ?? matched.id));
    setStep('chat');
  };

  const finishRating = async () => {
    if (profile?.role === 'volunteer') setVolunteerStats(await loadVolunteerStats(profile.id));
    resetMockBackend();
    setStep(role === 'elder' ? 'elderHome' : 'volunteerHome');
  };

  if (!session) return <AuthPanel />;

  if (step === 'loading') {
    return (
      <PhoneShell>
        <section className="center-screen">
          <div className="roulette-wheel">❤️</div>
          <h1>Загружаем...</h1>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'role') {
    return (
      <PhoneShell>
        <ScreenHeader title="Добрый день ❤️" subtitle="Кто вы?" />
        {message ? <p className="message">{message}</p> : null}
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>👵 Я хочу получить помощь</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>🤝 Я хочу помогать</ActionButton>
        </div>
        <ActionButton tone="ghost" onClick={() => supabase.auth.signOut()}>Выйти</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'elderHome') {
    return (
      <PhoneShell>
        <ScreenHeader title="Добрый день ❤️" subtitle="Нужна помощь?" />
        <section className="roulette-card" aria-label="Рулетка помощи">
          <button className="roulette-button" onClick={() => startRoulette('any')}>
            <span>🎡</span>
            <strong>НАЙТИ<br />ПОМОЩНИКА</strong>
          </button>
          <p>Нажмите, и мы найдем человека, который сейчас готов вам помочь.</p>
        </section>
        <div className="bottom-nav">
          <button>🏠 Помощь</button>
          <button onClick={() => setStep('contacts')}>❤️ Близкие</button>
          <button onClick={() => setStep('safety')}>⚙️ Профиль</button>
        </div>
      </PhoneShell>
    );
  }

  if (step === 'category') {
    return (
      <PhoneShell>
        <ScreenHeader title="С чем помочь?" subtitle="Можно не выбирать. По умолчанию найдем любого помощника." />
        <ActionButton onClick={() => startRoulette('any')}>🎡 Найти любого помощника</ActionButton>
        <div className="grid">
          {helpCategories.filter((item) => item.id !== 'any').map((item) => (
            <TileButton key={item.id} icon={item.icon} label={item.label} onClick={() => startRoulette(item.id)} />
          ))}
        </div>
        <ActionButton tone="ghost" onClick={() => setStep('elderHome')}>Назад</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'roulette') {
    return (
      <PhoneShell>
        <section className="center-screen">
          <div className="roulette-wheel">🎡</div>
          <h1>Ищем помощника...</h1>
          <p>Система выбирает случайного проверенного волонтера.</p>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'found' && volunteer) {
    return (
      <PhoneShell>
        <ScreenHeader title="Помощник найден ❤️" subtitle={`Тема: ${helpCategories.find((item) => item.id === category)?.label}`} />
        <VolunteerCard volunteer={volunteer} />
        <ActionButton onClick={() => setStep('chat')}>💬 Начать помощь</ActionButton>
        <ActionButton tone="ghost" onClick={() => startRoulette(category)}>Попробовать снова</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const risk = messages.some((item) => hasSafetyRisk(item.text));
    return (
      <PhoneShell>
        <ScreenHeader title={volunteer.name} subtitle="Онлайн-чат помощи" />
        <StatusPill>🟢 Помощь идет</StatusPill>
        {risk ? <div className="warning">⚠️ Никогда не сообщайте пароль, SMS-код или PIN.</div> : null}
        <div className="chat-list">
          {messages.map((item) => (
            <div key={item.id} className={item.senderId === profile?.id ? 'message message--mine' : 'message'}>
              <span>{item.messageType === 'voice' ? '🎙️' : item.messageType === 'photo' ? '🖼️' : item.messageType === 'video' ? '📹' : '💬'}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="chat-tools">
          <button onClick={() => sendQuickMedia('voice')}>🎙️</button>
          <button onClick={() => sendQuickMedia('photo')}>🖼️</button>
          <button onClick={() => sendQuickMedia('video')}>📹</button>
        </div>
        <div className="chat-input">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Написать..." />
          <button onClick={sendText}>Отправить</button>
        </div>
        <ActionButton tone="danger" onClick={completeHelp}>Закончить помощь</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'rating') {
    return (
      <PhoneShell>
        <ScreenHeader title="Спасибо ❤️" subtitle="Оцените помощника." />
        <div className="stars">{[1, 2, 3, 4, 5].map((star) => <button key={star} onClick={() => setRating(star)}>{star <= rating ? '★' : '☆'}</button>)}</div>
        <ActionButton onClick={finishRating}>Готово</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>Пожаловаться</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const baseVolunteer = volunteer ?? findRandomVolunteer('any');
    const demoStats = baseVolunteer ? addXP(baseVolunteer, 35).profile : null;
    return (
      <PhoneShell>
        <ScreenHeader title="Готовы помогать?" subtitle="Когда вы онлайн, рулетка может выбрать вас." />
        <StatusPill>🟢 Готов помогать</StatusPill>
        <div className="stats">
          <b>{volunteerStats?.xp ?? demoStats?.xp ?? 0} XP</b>
          <b>LVL {volunteerStats?.level ?? demoStats?.level ?? 1}</b>
          <b>{volunteerStats?.people_helped ?? demoStats?.peopleHelped ?? 0} помощи</b>
        </div>
        <ActionButton onClick={() => setStep('incoming')}>Показать запрос</ActionButton>
        <div className="bottom-nav">
          <button>🏠 Помощь</button>
          <button onClick={() => setStep('volunteerProfile')}>🏆 Прогресс</button>
          <button onClick={() => setStep('admin')}>👤 Профиль</button>
        </div>
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell>
        <ScreenHeader title="Нужна ваша помощь ❤️" subtitle="Пользователь хочет просто поговорить." />
        <ActionButton onClick={acceptIncomingRequest}>Принять</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>Не могу сейчас</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'contacts' || step === 'safety' || step === 'volunteerProfile' || step === 'admin') {
    return <InfoScreen step={step} profile={profile} stats={volunteerStats} achievements={visibleAchievements} onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')} />;
  }

  return null;
}

function InfoScreen({
  step,
  profile,
  stats,
  achievements,
  onBack,
}: {
  step: Step;
  profile: ProfileRow | null;
  stats: VolunteerProfileRow | null;
  achievements: Achievement[];
  onBack: () => void;
}) {
  const title = step === 'contacts' ? 'Мои близкие' : step === 'admin' ? 'Профиль' : step === 'volunteerProfile' ? 'Мой прогресс' : 'Безопасность';
  return (
    <PhoneShell>
      <ScreenHeader title={title} subtitle={profile ? `${profile.name} · ${profile.city ?? 'город не указан'}` : undefined} />
      <div className="info-list">
        {step === 'contacts' ? <p>Дочь, сын, внук. Волонтеры не видят эти контакты.</p> : null}
        {step === 'safety' ? <p>Никому не сообщайте пароль, SMS-код, PIN или банковские данные.</p> : null}
        {step === 'admin' ? <p>Роль сохранена в Supabase: {profile?.role === 'elder' ? 'получаю помощь' : 'помогаю'}.</p> : null}
        {step === 'volunteerProfile' && stats ? <p>⭐ {stats.rating} · {stats.xp} XP · помогли {stats.people_helped} людям · спасибо {stats.thanks_received}</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}>{item.icon} <b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
      <ActionButton tone="ghost" onClick={() => supabase.auth.signOut()}>Выйти</ActionButton>
    </PhoneShell>
  );
}
