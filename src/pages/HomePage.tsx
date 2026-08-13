import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from '../components/AuthPanel';
import { ActionButton, PhoneShell, ScreenHeader, TileButton } from '../components/RyadomUi';
import { VolunteerCard } from '../components/VolunteerCard';
import { analyzeChatSafety, type AiSafetyResult } from '../lib/aiSafety';
import { achievements, elders, helpCategories } from '../lib/ryadomData';
import {
  addXP,
  blockUser,
  createHelpRequest,
  createHelpSession,
  createMessage,
  createSafetyReport,
  createStarterMessages,
  findRandomVolunteer,
  finishHelpSession,
  getSafetyReports,
  hasSafetyRisk,
  resetMockBackend,
} from '../lib/ryadomServices';
import { createMyProfile, loadMyProfile, loadVolunteerStats, type ProfileRow, type VolunteerProfileRow } from '../lib/ryadomProfile';
import { supabase } from '../lib/supabase';
import type { Achievement, ChatMessage, HelpCategory, HelpSession, ReportReason, Role, Volunteer } from '../lib/ryadomTypes';

type Step =
  | 'loading'
  | 'role'
  | 'databaseSetup'
  | 'elderHome'
  | 'category'
  | 'search'
  | 'found'
  | 'chat'
  | 'report'
  | 'unsafe'
  | 'blocked'
  | 'history'
  | 'rating'
  | 'safety'
  | 'volunteerHome'
  | 'incoming'
  | 'volunteerProfile'
  | 'admin';

type ThemeMode = 'light' | 'dark';
type BrowserAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [guestMode, setGuestMode] = useState(false);
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
  const [reportReason, setReportReason] = useState<ReportReason>('trolling');
  const [reportComment, setReportComment] = useState('');
  const [blockedChat, setBlockedChat] = useState(false);
  const [aiSafety, setAiSafety] = useState<AiSafetyResult | null>(null);
  const [isCheckingSafety, setIsCheckingSafety] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('hopee-theme') === 'dark' ? 'dark' : 'light'));
  const searchTimerRef = useRef<number | undefined>(undefined);
  const searchSoundRef = useRef<{ context: AudioContext; timer: number } | null>(null);
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
      if (!guestMode) {
        setProfile(null);
        setStep('role');
      }
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
  }, [session, guestMode]);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    stopSearchSound();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('hopee-theme', themeMode);
  }, [themeMode]);

  const chooseRole = async (nextRole: Role) => {
    setRole(nextRole);
    if (guestMode) {
      setProfile({
        id: elders[0].id,
        auth_user_id: 'guest',
        role: nextRole,
        name: 'Гость',
        age: null,
        city: null,
        avatar_url: null,
      });
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
      return;
    }
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
    startSearchSound();
    setCategory(help);
    setStep('search');
    const request = createHelpRequest(profile?.id ?? elders[0].id, help);

    searchTimerRef.current = window.setTimeout(() => {
      const elderId = profile?.id ?? elders[0].id;
      const matched = findRandomVolunteer(help, elderId) ?? findRandomVolunteer('any', elderId);
      if (!matched) {
        stopSearchSound();
        setStep('category');
        return;
      }
      const nextSession = createHelpSession(request, matched);
      setVolunteer(matched);
      setHelpSession(nextSession);
      setBlockedChat(false);
      setAiSafety(null);
      setMessages(createStarterMessages(nextSession.id, matched.id));
      stopSearchSound();
      setStep('found');
    }, 1800);
  };

  const startSearchSound = () => {
    stopSearchSound();
    const audioWindow = window as BrowserAudioWindow;
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const playPulse = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(520, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(760, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    };
    playPulse();
    const timer = window.setInterval(playPulse, 620);
    searchSoundRef.current = { context, timer };
  };

  const stopSearchSound = () => {
    const sound = searchSoundRef.current;
    if (!sound) return;
    window.clearInterval(sound.timer);
    void sound.context.close();
    searchSoundRef.current = null;
  };

  const sendText = async () => {
    if (!helpSession || !draft.trim() || blockedChat) return;
    const nextMessage = createMessage(helpSession.id, profile?.id ?? elders[0].id, 'text', draft.trim());
    const nextMessages = [...messages, nextMessage];
    setMessages(nextMessages);
    setDraft('');
    setIsCheckingSafety(true);
    const result = await analyzeChatSafety(nextMessages);
    setAiSafety(result);
    setIsCheckingSafety(false);

    if (result.action === 'block' && volunteer) {
      createSafetyReport(helpSession, profile?.id ?? elders[0].id, volunteer.id, 'password', result.reason);
      blockUser(profile?.id ?? elders[0].id, volunteer.id);
      setBlockedChat(true);
      setHelpSession((current) => (current ? { ...current, status: 'reported', endedAt: new Date().toISOString() } : current));
    }
  };

  const sendQuickMedia = (type: ChatMessage['messageType']) => {
    if (!helpSession || blockedChat) return;
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
    if (!helpSession || !file || blockedChat) return;
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
    setBlockedChat(false);
    setAiSafety(null);
    setMessages(createStarterMessages(nextSession.id, profile?.id ?? matched.id));
    setStep('chat');
  };

  const submitReport = (reason: ReportReason, comment = reportComment) => {
    if (!volunteer) return;
    createSafetyReport(helpSession, profile?.id ?? elders[0].id, volunteer.id, reason, comment);
    setReportComment('');
    setStep('safety');
  };

  const blockCurrentVolunteer = () => {
    if (!volunteer) return;
    blockUser(profile?.id ?? elders[0].id, volunteer.id);
    setBlockedChat(true);
    setHelpSession((current) => (current ? { ...current, status: 'reported', endedAt: new Date().toISOString() } : current));
    setStep('blocked');
  };

  const stopUnsafeHelp = () => {
    submitReport('bad_behavior', 'Пользователь нажал кнопку "Мне небезопасно".');
    blockCurrentVolunteer();
  };

  const finishRating = async () => {
    if (profile?.role === 'volunteer') setVolunteerStats(await loadVolunteerStats(profile.id));
    resetMockBackend();
    setStep(role === 'elder' ? 'elderHome' : 'volunteerHome');
  };

  const enterAsGuest = () => {
    setGuestMode(true);
    setProfile(null);
    setMessage('');
    setStep('role');
  };

  const signOutApp = async () => {
    setGuestMode(false);
    setProfile(null);
    setStep('role');
    await supabase.auth.signOut();
  };

  if (!session && !guestMode) return <AuthPanel onGuest={enterAsGuest} />;

  if (step === 'loading') return <LoadingScreen title="Загружаем" />;

  if (step === 'role') {
    return (
      <PhoneShell screenKey={step}>
        <ScreenHeader title="Добрый день" subtitle="Выберите, как хотите использовать сервис." />
        {message ? <p className="message">{message}</p> : null}
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>Мне нужна помощь</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>Я хочу помогать</ActionButton>
        </div>
        <ActionButton tone="ghost" onClick={signOutApp}>Выйти</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'databaseSetup') {
    return (
      <PhoneShell screenKey={step}>
        <ScreenHeader title="Нужно подключить базу" subtitle="Вход работает, но таблицы приложения еще не записаны в Supabase." />
        <div className="info-list">
          <p>Запустите миграции Supabase. После этого профиль и статистика будут сохраняться.</p>
          <p>{databaseError}</p>
        </div>
        <ActionButton onClick={() => window.location.reload()}>Проверить снова</ActionButton>
        <ActionButton tone="ghost" onClick={signOutApp}>Выйти</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'elderHome') {
    return (
      <PhoneShell screenKey={step}>
        <header className="top-bar">
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEK</strong>
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
      <PhoneShell screenKey={step}>
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
      <PhoneShell screenKey={step}>
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
          <ActionButton tone="ghost" onClick={() => { window.clearTimeout(searchTimerRef.current); stopSearchSound(); setStep('elderHome'); }}>Отменить поиск</ActionButton>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'found' && volunteer) {
    return (
      <PhoneShell screenKey={step}>
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
      <PhoneShell screenKey={step}>
        <header className="chat-header">
          <div>
            <h1>{volunteer.name} К.</h1>
            <p>Проверенный помощник</p>
          </div>
          <button onClick={() => setStep('history')}>История</button>
        </header>
        <div className="safety-note">Никому не сообщайте пароли, SMS-коды и данные банковской карты. Настоящий помощник никогда не должен их просить.</div>
        {isCheckingSafety ? <div className="ai-safety ai-safety--checking">ИИ проверяет диалог на мошенничество...</div> : null}
        {aiSafety && aiSafety.risk !== 'safe' ? (
          <div className={`ai-safety ai-safety--${aiSafety.risk}`}>
            <strong>{aiSafety.action === 'block' ? 'Диалог остановлен' : 'Нужна осторожность'}</strong>
            <p>{aiSafety.reason}</p>
          </div>
        ) : null}
        {risk ? (
          <div className="warning">
            <strong>Будьте осторожны</strong>
            <p>Не сообщайте коды, пароли или банковские данные.</p>
            <button onClick={() => submitReport('password', 'В чате обнаружен потенциально опасный запрос.')}>Это подозрительно</button>
          </div>
        ) : null}
        {blockedChat ? <div className="warning">Разговор остановлен. Этот помощник больше не сможет написать вам в этом чате.</div> : null}
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
          <button disabled={blockedChat} onClick={() => photoInputRef.current?.click()}>Фото</button>
          <button disabled={blockedChat} onClick={() => sendQuickMedia('voice')}>Голос</button>
          <button disabled={blockedChat} onClick={() => videoInputRef.current?.click()}>Видео</button>
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
          <input disabled={blockedChat} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Написать сообщение..." />
          <button disabled={blockedChat} onClick={sendText}>Отправить</button>
        </div>
        <div className="safety-actions">
          <button onClick={() => setStep('report')}>Пожаловаться</button>
          <button onClick={() => setStep('unsafe')}>Мне небезопасно</button>
          <button onClick={blockCurrentVolunteer}>Заблокировать</button>
        </div>
        <ActionButton tone="danger" onClick={completeHelp}>Закончить помощь</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'history') {
    return <HistoryScreen session={helpSession} volunteer={volunteer} messages={messages} onChat={() => setStep('chat')} onBack={() => setStep('elderHome')} />;
  }

  if (step === 'report' && volunteer) {
    return (
      <ReportScreen
        reason={reportReason}
        comment={reportComment}
        onReasonChange={setReportReason}
        onCommentChange={setReportComment}
        onSubmit={() => submitReport(reportReason)}
        onBack={() => setStep('chat')}
      />
    );
  }

  if (step === 'unsafe') {
    return (
      <PhoneShell screenKey={step}>
        <ScreenHeader title="Вам небезопасно?" subtitle="Можно сразу прекратить помощь и заблокировать пользователя." />
        <ActionButton tone="danger" onClick={stopUnsafeHelp}>Да, прекратить</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('chat')}>Отмена</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'blocked') {
    return (
      <PhoneShell screenKey={step}>
        <ScreenHeader title="Пользователь заблокирован" subtitle="Разговор остановлен. Жалоба отправлена на проверку." />
        <div className="info-list">
          <p>Вы можете вернуться на главный экран и найти другого помощника.</p>
          <p>Пароли, SMS-коды и банковские данные никому сообщать нельзя.</p>
        </div>
        <ActionButton onClick={() => setStep('elderHome')}>На главный экран</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'rating') {
    return (
      <PhoneShell screenKey={step}>
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
      <PhoneShell screenKey={step}>
        <header className="top-bar">
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEK</strong>
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
      <PhoneShell screenKey={step}>
        <ScreenHeader title="Новый запрос" subtitle="Пользователю нужна помощь в чате." />
        <ActionButton onClick={acceptIncomingRequest}>Принять</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>Не могу сейчас</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'safety' || step === 'volunteerProfile' || step === 'admin') {
    return (
      <InfoScreen
        step={step}
        profile={profile}
        stats={volunteerStats}
        achievements={visibleAchievements}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        onSignOut={signOutApp}
        onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')}
      />
    );
  }

  return null;
}

function LoadingScreen({ title }: { title: string }) {
  return (
    <PhoneShell screenKey="loading">
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
    <PhoneShell screenKey="history">
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

function ReportScreen({
  reason,
  comment,
  onReasonChange,
  onCommentChange,
  onSubmit,
  onBack,
}: {
  reason: ReportReason;
  comment: string;
  onReasonChange: (reason: ReportReason) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const reasons: Array<{ id: ReportReason; label: string }> = [
    { id: 'trolling', label: 'Оскорбления или троллинг' },
    { id: 'money', label: 'Просит деньги' },
    { id: 'password', label: 'Просит пароль или SMS-код' },
    { id: 'bank_data', label: 'Просит банковские данные' },
    { id: 'suspicious_app', label: 'Просит установить подозрительное приложение' },
    { id: 'suspicious_content', label: 'Отправляет подозрительный контент' },
    { id: 'bad_behavior', label: 'Неприемлемое поведение' },
    { id: 'other', label: 'Другое' },
  ];

  return (
    <PhoneShell screenKey="report">
      <ScreenHeader title="Пожаловаться" subtitle="Выберите причину и добавьте короткий комментарий." />
      <div className="report-options">
        {reasons.map((item) => (
          <button key={item.id} className={item.id === reason ? 'active' : ''} onClick={() => onReasonChange(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <textarea className="report-comment" value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder="Короткий комментарий..." />
      <ActionButton onClick={onSubmit}>Отправить жалобу</ActionButton>
      <ActionButton tone="ghost" onClick={onBack}>Назад</ActionButton>
    </PhoneShell>
  );
}
function InfoScreen({
  step,
  profile,
  stats,
  achievements,
  themeMode,
  onThemeChange,
  onSignOut,
  onBack,
}: {
  step: Step;
  profile: ProfileRow | null;
  stats: VolunteerProfileRow | null;
  achievements: Achievement[];
  themeMode: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const title = step === 'admin' ? 'Профиль' : step === 'volunteerProfile' ? 'Прогресс' : 'Безопасность';
  const reports = getSafetyReports();
  return (
    <PhoneShell screenKey={step}>
      <ScreenHeader title={title} subtitle={profile ? `${profile.name} · ${profile.city ?? 'город не указан'}` : undefined} />
      <div className="info-list">
        {step === 'safety' ? <p>Никому не сообщайте пароль, SMS-код, PIN или банковские данные.</p> : null}
        {step === 'safety' ? <p>Если разговор вызывает сомнения, завершите помощь и отправьте жалобу.</p> : null}
        {step === 'admin' ? <p>Роль сохранена в Supabase: {profile?.role === 'elder' ? 'получаю помощь' : 'помогаю'}.</p> : null}
        {step === 'admin' ? <p>Модерация: {reports.length} жалоб в очереди, {reports.filter((item) => item.severity === 'high').length} высокого риска.</p> : null}
        {step === 'safety' ? (
          <div className="settings-group">
            <strong>Тема приложения</strong>
            <div className="theme-toggle" role="group" aria-label="Тема приложения">
              <button className={themeMode === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>По умолчанию</button>
              <button className={themeMode === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>Тёмная</button>
            </div>
          </div>
        ) : null}
        {step === 'volunteerProfile' && stats ? <p>{stats.rating} рейтинг · {stats.xp} XP · {stats.people_helped} помощи · {stats.thanks_received} благодарностей</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}><b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
      <ActionButton tone="ghost" onClick={onSignOut}>Выйти из аккаунта</ActionButton>
    </PhoneShell>
  );
}
