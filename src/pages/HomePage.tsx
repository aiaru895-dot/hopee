import { useMemo, useState } from 'react';
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
  registerUser,
  resetMockBackend,
} from '../lib/ryadomServices';
import type { Achievement, ChatMessage, HelpCategory, HelpSession, Role, User, Volunteer } from '../lib/ryadomTypes';

type Step =
  | 'role'
  | 'elderHome'
  | 'category'
  | 'roulette'
  | 'found'
  | 'chat'
  | 'rating'
  | 'contacts'
  | 'safety'
  | 'volunteerJoin'
  | 'volunteerHome'
  | 'incoming'
  | 'volunteerProfile'
  | 'admin';

export function HomePage() {
  const [step, setStep] = useState<Step>('role');
  const [role, setRole] = useState<Role>('elder');
  const [currentUser, setCurrentUser] = useState<User>(elders[0]);
  const [volunteer, setVolunteer] = useState<Volunteer>();
  const [category, setCategory] = useState<HelpCategory>('any');
  const [session, setSession] = useState<HelpSession>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [rating, setRating] = useState(0);
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerJoin');
  };

  const startRoulette = (help: HelpCategory) => {
    setCategory(help);
    setStep('roulette');
    const request = createHelpRequest(currentUser.id, help);
    window.setTimeout(() => {
      const matched = findRandomVolunteer(help) ?? findRandomVolunteer('any');
      if (!matched) {
        setStep('category');
        return;
      }
      const nextSession = createHelpSession(request, matched);
      setVolunteer(matched);
      setSession(nextSession);
      setMessages(createStarterMessages(nextSession.id, matched.id));
      setStep('found');
    }, 2400);
  };

  const openChat = () => {
    if (!session) return;
    setStep('chat');
  };

  const sendText = () => {
    if (!session || !draft.trim()) return;
    const nextMessage = createMessage(session.id, currentUser.id, 'text', draft.trim());
    setMessages((items) => [...items, nextMessage]);
    setDraft('');
  };

  const sendQuickMedia = (type: ChatMessage['messageType']) => {
    if (!session) return;
    const textByType = {
      text: '',
      system: '',
      voice: 'Голосовое сообщение, 12 секунд',
      photo: 'Фото отправлено',
      video: 'Короткое видео отправлено',
    };
    setMessages((items) => [...items, createMessage(session.id, currentUser.id, type, textByType[type])]);
  };

  const completeHelp = () => {
    if (session) finishHelpSession(session);
    setStep('rating');
  };

  const completeVolunteerJoin = () => {
    setCurrentUser(registerUser('volunteer', 'Новый помощник', 20, 'Алматы'));
    setVolunteer(undefined);
    setStep('volunteerHome');
  };

  const acceptIncomingRequest = () => {
    const matched = findRandomVolunteer('talk') ?? findRandomVolunteer('any');
    if (!matched) return;
    const request = createHelpRequest(elders[0].id, 'talk');
    const nextSession = createHelpSession(request, matched);
    setVolunteer(matched);
    setSession(nextSession);
    setMessages(createStarterMessages(nextSession.id, currentUser.id));
    setStep('chat');
  };

  if (step === 'role') {
    return (
      <PhoneShell>
        <ScreenHeader title="Добрый день ❤️" subtitle="Кто вы?" />
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>👵 Я хочу получить помощь</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>🤝 Я хочу помогать</ActionButton>
        </div>
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
          <button onClick={() => setStep('safety')}>⚙️ Настройки</button>
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
        <ActionButton onClick={openChat}>💬 Начать помощь</ActionButton>
        <ActionButton tone="ghost" onClick={() => startRoulette(category)}>Попробовать снова</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const risk = messages.some((message) => hasSafetyRisk(message.text));
    return (
      <PhoneShell>
        <ScreenHeader title={volunteer.name} subtitle="Онлайн-чат помощи" />
        <StatusPill>🟢 Помощь идет</StatusPill>
        {risk ? <div className="warning">⚠️ Никогда не сообщайте пароль, SMS-код или PIN.</div> : null}
        <div className="chat-list">
          {messages.map((message) => (
            <div key={message.id} className={message.senderId === currentUser.id ? 'message message--mine' : 'message'}>
              <span>{message.messageType === 'voice' ? '🎙️' : message.messageType === 'photo' ? '🖼️' : message.messageType === 'video' ? '📹' : '💬'}</span>
              <p>{message.text}</p>
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
        <ActionButton onClick={() => { resetMockBackend(); setStep(role === 'elder' ? 'elderHome' : 'volunteerHome'); }}>Готово</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>Пожаловаться</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerJoin') {
    return (
      <PhoneShell>
        <ScreenHeader title="Регистрация" subtitle="Email и пароль подключаются через Supabase Auth." />
        <div className="form-card">
          <input placeholder="Email" defaultValue="aliya@example.com" />
          <input placeholder="Пароль" type="password" defaultValue="password" />
          <input placeholder="Имя" defaultValue="Алия" />
          <input placeholder="Город" defaultValue="Алматы" />
          <p>После регистрации профиль попадает на mock-проверку.</p>
        </div>
        <ActionButton onClick={completeVolunteerJoin}>Пройти mock-проверку</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const baseVolunteer = volunteer ?? findRandomVolunteer('any');
    const xpVolunteer = baseVolunteer ? addXP(baseVolunteer, 35) : undefined;
    return (
      <PhoneShell>
        <ScreenHeader title="Готовы помогать?" subtitle="Когда вы онлайн, рулетка может выбрать вас." />
        <StatusPill>🟢 Готов помогать</StatusPill>
        {xpVolunteer ? (
          <div className="stats">
            <b>{xpVolunteer.profile.xp} XP</b>
            <b>LVL {xpVolunteer.profile.level}</b>
            <b>{xpVolunteer.profile.peopleHelped} помощи</b>
          </div>
        ) : null}
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
    return <InfoScreen step={step} achievements={visibleAchievements} onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')} />;
  }

  return null;
}

function InfoScreen({ step, achievements, onBack }: { step: Step; achievements: Achievement[]; onBack: () => void }) {
  const title = step === 'contacts' ? 'Мои близкие' : step === 'admin' ? 'Mock admin' : step === 'volunteerProfile' ? 'Мой прогресс' : 'Безопасность';
  return (
    <PhoneShell>
      <ScreenHeader title={title} />
      <div className="info-list">
        {step === 'contacts' ? <p>Дочь, сын, внук. Волонтеры не видят эти контакты.</p> : null}
        {step === 'safety' ? <p>Никому не сообщайте пароль, SMS-код, PIN или банковские данные.</p> : null}
        {step === 'admin' ? <p>Mock-модерация: жалобы, блокировки, trust score и risk score готовы как интерфейсные состояния.</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}>{item.icon} <b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
    </PhoneShell>
  );
}
