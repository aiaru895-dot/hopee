import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from '../components/AuthPanel';
import { ActionButton, PhoneShell, ScreenHeader, TileButton } from '../components/RyadomUi';
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
  | 'databaseSetup'
  | 'elderHome'
  | 'category'
  | 'search'
  | 'found'
  | 'chat'
  | 'history'
  | 'rating'
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
  const [databaseError, setDatabaseError] = useState('');
  const searchTimerRef = useRef<number | undefined>(undefined);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
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
        if (savedProfile.role === 'volunteer') setVolunteerStats(await loadVolunteerStats(savedProfile.id));
      })
      .catch((error: Error) => {
        setDatabaseError(error.message);
        setStep('databaseSetup');
      });
  }, [session]);

  useEffect(() => () => window.clearTimeout(searchTimerRef.current), []);

  const chooseRole = async (nextRole: Role) => {
    setRole(nextRole);
    if (!session) return;

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

  const startSearch = (help: HelpCategory) => {
    window.clearTimeout(searchTimerRef.current);
    setCategory(help);
    setStep('search');
    const request = createHelpRequest(profile?.id ?? elders[0].id, help);

    searchTimerRef.current = window.setTimeout(() => {
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
    }, 1800);
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

  const sendSelectedFile = (type: 'photo' | 'video', file?: File) => {
    if (!helpSession || !file) return;
    const url = URL.createObjectURL(file);
    const fallbackText = type === 'photo' ? 'Фото' : 'Видео';
    setMessages((items) => [
      ...items,
      createMessage(helpSession.id, profile?.id ?? elders[0].id, type, file.name || fallbackText, { url, name: file.name || fallbackText }),
    ]);
  };

  const completeHelp = () => {
    if (helpSession) setHelpSession(finishHelpSession(helpSession));
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

  if (step === 'loading') return <LoadingScreen title="Загружаем" />;

  if (step === 'role') {
    return (
      <PhoneShell>
        <ScreenHeader title="Добрый день" subtitle="Выберите, как хотите использовать сервис." />
        {message ? <p className="message">{message}</p> : null}
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>Мне нужна помощь</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>Я хочу помогать</ActionButton>
        </div>
        <ActionButton tone="ghost" onClick={() => supabase.auth.signOut()}>Выйти</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'databaseSetup') {
    return (
      <PhoneShell>
        <ScreenHeader title="Нужно подключить базу" subtitle="Вход работает, но таблицы приложения еще не записаны в Supabase." />
        <div className="info-list">
          <p>Запустите миграции Supabase. После этого профиль и статистика будут сохраняться.</p>
          <p>{databaseError}</p>
        </div>
        <ActionButton onClick={() => window.location.reload()}>Проверить снова</ActionButton>
        <ActionButton tone="ghost" onClick={() => supabase.auth.signOut()}>Выйти</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'elderHome') {
    return (
      <PhoneShell>
        <header className="top-bar">
          <strong>hopee</strong>
          <button onClick={() => setStep('safety')}>Настройки</button>
        </header>
        <section className="home-panel">
          <p className="eyebrow">Добрый день, {profile?.name ?? 'Валентина'}</p>
          <h1>Нужна помощь?</h1>
          <p>Найдем проверенного человека, который сейчас готов спокойно помочь в чате.</p>
          <ActionButton onClick={() => setStep('category')}>Выбрать вид помощи</ActionButton>
        </section>
        <section className="trust-note">
          <strong>Безопасный сервис поддержки</strong>
          <p>Помощники проходят проверку и помогают с телефоном, приложениями, интернетом и повседневными цифровыми вопросами.</p>
        </section>
        <BottomNav items={['Помощь', 'История', 'Настройки']} onSecond={() => setStep('history')} onThird={() => setStep('safety')} />
      </PhoneShell>
    );
  }

  if (step === 'category') {
    return (
      <PhoneShell>
        <ScreenHeader title="С чем помочь?" subtitle="Можно не выбирать тему: мы найдем доступного проверенного помощника." />
        <ActionButton onClick={() => startSearch('any')}>Найти любого помощника</ActionButton>
        <div className="grid">
          {helpCategories.filter((item) => item.id !== 'any').map((item) => (
            <TileButton key={item.id} icon="" label={item.label} onClick={() => startSearch(item.id)} />
          ))}
        </div>
        <ActionButton tone="ghost" onClick={() => setStep('elderHome')}>Назад</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'search') {
    return (
      <PhoneShell>
        <section className="center-screen">
          <div className="search-indicator" aria-hidden="true"><span /></div>
          <p className="eyebrow">Идет поиск</p>
          <h1>Ищем помощника</h1>
          <p>Проверяем доступных людей по вашей теме. Обычно это занимает несколько секунд.</p>
          <div className="search-steps" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <ActionButton tone="ghost" onClick={() => { window.clearTimeout(searchTimerRef.current); setStep('elderHome'); }}>Отменить поиск</ActionButton>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'found' && volunteer) {
    return (
      <PhoneShell>
        <ScreenHeader title="Помощник найден" subtitle={`Тема: ${helpCategories.find((item) => item.id === category)?.label}`} />
        <VolunteerCard volunteer={volunteer} />
        <ActionButton onClick={() => setStep('chat')}>Начать разговор</ActionButton>
        <ActionButton tone="ghost" onClick={() => startSearch(category)}>Другой помощник</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const risk = messages.some((item) => hasSafetyRisk(item.text));
    return (
      <PhoneShell>
        <header className="chat-header">
          <div>
            <h1>{volunteer.name} К.</h1>
            <p>Проверенный помощник</p>
          </div>
          <button onClick={() => setStep('history')}>История</button>
        </header>
        {risk ? <div className="warning">Никогда не сообщайте пароль, SMS-код, PIN или банковские данные.</div> : null}
        <div className="chat-list">
          {messages.map((item) => (
            <div key={item.id} className={item.senderId === profile?.id ? 'message message--mine' : 'message'}>
              {item.messageType === 'photo' && item.fileUrl ? <img className="message-media" src={item.fileUrl} alt={item.fileName ?? 'Фото'} /> : null}
              {item.messageType === 'video' && item.fileUrl ? <video className="message-media" src={item.fileUrl} controls /> : null}
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="chat-tools">
          <button onClick={() => photoInputRef.current?.click()}>Фото</button>
          <button onClick={() => sendQuickMedia('voice')}>Голос</button>
          <button onClick={() => videoInputRef.current?.click()}>Видео</button>
          <input
            ref={photoInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              sendSelectedFile('photo', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={videoInputRef}
            className="file-input"
            type="file"
            accept="video/*"
            capture="environment"
            onChange={(event) => {
              sendSelectedFile('video', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        <div className="chat-input">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Написать сообщение..." />
          <button onClick={sendText}>Отправить</button>
        </div>
        <ActionButton tone="danger" onClick={completeHelp}>Закончить помощь</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'history') {
    return <HistoryScreen session={helpSession} volunteer={volunteer} messages={messages} onChat={() => setStep('chat')} onBack={() => setStep('elderHome')} />;
  }

  if (step === 'rating') {
    return (
      <PhoneShell>
        <ScreenHeader title="Спасибо" subtitle="Оцените работу помощника." />
        <div className="rating-scale">
          {[1, 2, 3, 4, 5].map((star) => <button key={star} onClick={() => setRating(star)} className={star <= rating ? 'active' : ''}>{star}</button>)}
        </div>
        <ActionButton onClick={finishRating}>Готово</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>Пожаловаться</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const baseVolunteer = volunteer ?? findRandomVolunteer('any');
    const demoStats = baseVolunteer ? addXP(baseVolunteer, 35).profile : null;
    const xp = volunteerStats?.xp ?? demoStats?.xp ?? 0;
    const level = volunteerStats?.level ?? demoStats?.level ?? 1;
    const helped = volunteerStats?.people_helped ?? demoStats?.peopleHelped ?? 0;

    return (
      <PhoneShell>
        <header className="top-bar">
          <strong>hopee</strong>
          <button onClick={() => setStep('admin')}>Профиль</button>
        </header>
        <ScreenHeader title={`Здравствуйте, ${profile?.name ?? 'Алия'}`} subtitle="Статус помощи" />
        <section className="status-card">
          <div>
            <p className="eyebrow">Готовность</p>
            <h2>Готова помогать</h2>
            <p>Вы будете получать запросы, когда кому-то понадобится помощь.</p>
          </div>
          <span>ON</span>
        </section>
        <div className="stats">
          <b><span>{helped}</span>помощи</b>
          <b><span>{volunteerStats?.rating ?? demoStats?.rating ?? 4.9}</span>оценка</b>
          <b><span>{xp}</span>XP</b>
        </div>
        <section className="level-card">
          <p>LEVEL {String(level).padStart(2, '0')}</p>
          <h2>{volunteerStats?.title ?? demoStats?.title ?? 'Надежный помощник'}</h2>
          <div className="progress"><span style={{ width: `${Math.min(100, (xp % 1000) / 10)}%` }} /></div>
          <small>{xp} / 1000 XP</small>
        </section>
        <ActionButton onClick={() => setStep('incoming')}>Показать запрос</ActionButton>
        <BottomNav items={['Помощь', 'Прогресс', 'Профиль']} onSecond={() => setStep('volunteerProfile')} onThird={() => setStep('admin')} />
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell>
        <ScreenHeader title="Новый запрос" subtitle="Пользователю нужна помощь в чате." />
        <ActionButton onClick={acceptIncomingRequest}>Принять</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>Не могу сейчас</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'safety' || step === 'volunteerProfile' || step === 'admin') {
    return <InfoScreen step={step} profile={profile} stats={volunteerStats} achievements={visibleAchievements} onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')} />;
  }

  return null;
}

function LoadingScreen({ title }: { title: string }) {
  return (
    <PhoneShell>
      <section className="center-screen">
        <div className="search-indicator" aria-hidden="true"><span /></div>
        <h1>{title}</h1>
      </section>
    </PhoneShell>
  );
}

function BottomNav({ items, onSecond, onThird }: { items: string[]; onSecond: () => void; onThird: () => void }) {
  return (
    <nav className="bottom-nav">
      <button>{items[0]}</button>
      <button onClick={onSecond}>{items[1]}</button>
      <button onClick={onThird}>{items[2]}</button>
    </nav>
  );
}

function HistoryScreen({
  session,
  volunteer,
  messages,
  onChat,
  onBack,
}: {
  session?: HelpSession;
  volunteer?: Volunteer;
  messages: ChatMessage[];
  onChat: () => void;
  onBack: () => void;
}) {
  const sessionDate = session ? new Date(session.startedAt).toLocaleDateString('ru-RU') : 'Сегодня';
  return (
    <PhoneShell>
      <ScreenHeader title="Мои помощи" subtitle="Текущие и завершенные обращения." />
      <div className="history-list">
        {session && volunteer ? (
          <button className="history-item" onClick={onChat}>
            <span>{session.status === 'completed' ? 'Завершено' : 'Сейчас'}</span>
            <strong>{volunteer.name} К.</strong>
            <p>{sessionDate} · {messages.length} сообщений</p>
          </button>
        ) : (
          <div className="history-item">
            <span>Пока пусто</span>
            <strong>Здесь появятся ваши обращения</strong>
            <p>После поиска помощника чат можно будет открыть снова.</p>
          </div>
        )}
        <div className="history-item">
          <span>Пример</span>
          <strong>Помощь с телефоном</strong>
          <p>Недавний чат · завершено</p>
        </div>
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
    </PhoneShell>
  );
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
  const title = step === 'admin' ? 'Профиль' : step === 'volunteerProfile' ? 'Прогресс' : 'Безопасность';
  return (
    <PhoneShell>
      <ScreenHeader title={title} subtitle={profile ? `${profile.name} · ${profile.city ?? 'город не указан'}` : undefined} />
      <div className="info-list">
        {step === 'safety' ? <p>Никому не сообщайте пароль, SMS-код, PIN или банковские данные.</p> : null}
        {step === 'safety' ? <p>Если разговор вызывает сомнения, завершите помощь и отправьте жалобу.</p> : null}
        {step === 'admin' ? <p>Роль сохранена в Supabase: {profile?.role === 'elder' ? 'получаю помощь' : 'помогаю'}.</p> : null}
        {step === 'volunteerProfile' && stats ? <p>{stats.rating} рейтинг · {stats.xp} XP · {stats.people_helped} помощи · {stats.thanks_received} благодарностей</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}><b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
      <ActionButton tone="ghost" onClick={() => supabase.auth.signOut()}>Выйти</ActionButton>
    </PhoneShell>
  );
}
