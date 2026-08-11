import { useMemo, useState } from 'react';
import { ActionButton, Avatar, PhoneShell, ScreenHeader, StatusPill, TileButton } from '../components/RyadomUi';
import { VolunteerCard } from '../components/VolunteerCard';
import { achievements, elders, helpCategories } from '../lib/ryadomData';
import { addXP, createHelpRequest, endCall, findRandomVolunteer, registerUser, resetMockBackend, startCall } from '../lib/ryadomServices';
import { ScreenShareService } from '../lib/screenShareService';
import type { Achievement, CallSession, HelpCategory, Role, User, Volunteer } from '../lib/ryadomTypes';

type Step = 'splash' | 'role' | 'elderHome' | 'category' | 'search' | 'found' | 'call' | 'rating' | 'contacts' | 'safety' | 'volunteerJoin' | 'volunteerHome' | 'incoming' | 'volunteerProfile' | 'admin';

const screenShare = new ScreenShareService();

export function HomePage() {
  const [step, setStep] = useState<Step>('splash');
  const [role, setRole] = useState<Role>('elder');
  const [currentUser, setCurrentUser] = useState<User>(elders[0]);
  const [volunteer, setVolunteer] = useState<Volunteer>();
  const [category, setCategory] = useState<HelpCategory>('any');
  const [call, setCall] = useState<CallSession>();
  const [sharing, setSharing] = useState(false);
  const [rating, setRating] = useState(0);
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);

  const chooseRole = (nextRole: Role) => {
    setRole(nextRole);
    setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerJoin');
  };

  const searchVolunteer = (help: HelpCategory) => {
    setCategory(help);
    setStep('search');
    createHelpRequest(currentUser.id, help);
    window.setTimeout(() => {
      const matched = findRandomVolunteer(help);
      setVolunteer(matched);
      setStep(matched ? 'found' : 'category');
    }, 900);
  };

  const beginCall = () => {
    if (!volunteer) return;
    setCall(startCall(currentUser.id, volunteer.id));
    setStep('call');
  };

  const finishCall = () => {
    if (call) setCall(endCall(call));
    setSharing(false);
    setStep('rating');
  };

  const completeVolunteerJoin = () => {
    const user = registerUser('volunteer', 'Новый помощник', 20, 'Алматы');
    setCurrentUser(user);
    setVolunteer(undefined);
    setStep('volunteerHome');
  };

  const acceptIncomingRequest = () => {
    const matched = findRandomVolunteer('talk') ?? findRandomVolunteer('any');
    if (!matched) {
      setStep('volunteerHome');
      return;
    }
    setVolunteer(matched);
    setCall(startCall(currentUser.id, matched.id));
    setStep('call');
  };

  if (step === 'splash') {
    return (
      <PhoneShell>
        <section className="splash">
          <div className="brand-mark">Р</div>
          <h1>Рядом</h1>
          <p>Помощь с телефоном от доброго человека.</p>
          <ActionButton onClick={() => setStep('role')}>Начать</ActionButton>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'role') {
    return (
      <PhoneShell>
        <ScreenHeader title="Добрый день" subtitle="Кто вы?" />
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>👵 Мне нужна помощь</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>🤝 Я хочу помогать</ActionButton>
        </div>
      </PhoneShell>
    );
  }

  if (step === 'elderHome') {
    return (
      <PhoneShell>
        <ScreenHeader title="Здравствуйте!" subtitle="Нужна помощь с телефоном?" />
        <ActionButton onClick={() => setStep('category')}>🆘 Найти помощника</ActionButton>
        <div className="grid">
          <TileButton icon="☎️" label="Мои контакты" onClick={() => setStep('contacts')} />
          <TileButton icon="🛡️" label="Безопасность" onClick={() => setStep('safety')} />
          <TileButton icon="⚙️" label="Настройки" onClick={() => setStep('safety')} />
        </div>
      </PhoneShell>
    );
  }

  if (step === 'category') {
    return (
      <PhoneShell>
        <ScreenHeader title="С чем помочь?" subtitle="Можно выбрать тему или найти любого помощника." />
        <div className="grid">
          {helpCategories.map((item) => <TileButton key={item.id} icon={item.icon} label={item.label} onClick={() => searchVolunteer(item.id)} />)}
        </div>
        <ActionButton tone="ghost" onClick={() => setStep('elderHome')}>Назад</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'search') {
    return (
      <PhoneShell>
        <section className="center-screen">
          <div className="loader" />
          <h1>Ищем помощника</h1>
          <p>Подбираем проверенного свободного волонтера.</p>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'found' && volunteer) {
    return (
      <PhoneShell>
        <ScreenHeader title="Помощник найден" subtitle={`Тема: ${helpCategories.find((item) => item.id === category)?.label}`} />
        <VolunteerCard volunteer={volunteer} />
        <ActionButton onClick={beginCall}>📞 Начать звонок</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('category')}>Искать другого</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'call' && volunteer) {
    return (
      <PhoneShell>
        <section className="call-screen">
          <Avatar value={volunteer.avatar} />
          <h1>{volunteer.name} на связи</h1>
          <StatusPill>{sharing ? 'Экран показывается' : 'Звонок идет'}</StatusPill>
          <div className="mock-phone">{sharing ? 'Mock-показ экрана телефона' : 'Видео и аудио mock'}</div>
          <ActionButton tone="calm" onClick={() => { const state = sharing ? screenShare.stopScreenShare() : screenShare.startScreenShare(); setSharing(state.enabled); }}>
            {sharing ? '🔒 Остановить показ экрана' : '📱 Показать мой экран'}
          </ActionButton>
          <ActionButton tone="danger" onClick={finishCall}>Завершить звонок</ActionButton>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'rating') {
    return (
      <PhoneShell>
        <ScreenHeader title="Спасибо!" subtitle="Оцените помощь." />
        <div className="stars">{[1, 2, 3, 4, 5].map((star) => <button key={star} onClick={() => setRating(star)}>{star <= rating ? '★' : '☆'}</button>)}</div>
        <ActionButton onClick={() => { resetMockBackend(); setStep(role === 'elder' ? 'elderHome' : 'volunteerHome'); }}>Готово</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>Пожаловаться</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerJoin') {
    return (
      <PhoneShell>
        <ScreenHeader title="Регистрация" subtitle="Заполните профиль помощника." />
        <div className="form-card">
          <input placeholder="Имя" defaultValue="Алия" />
          <input placeholder="Возраст" defaultValue="24" />
          <input placeholder="Email или телефон" defaultValue="aliya@example.com" />
          <input placeholder="Город" defaultValue="Алматы" />
          <p>Навыки: смартфоны, мессенджеры, настройки.</p>
        </div>
        <ActionButton onClick={completeVolunteerJoin}>Пройти mock-проверку</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const xpVolunteer = addXP(volunteer ?? findRandomVolunteer('any')!, 35);
    return (
      <PhoneShell>
        <ScreenHeader title="Вы проверенный волонтер" subtitle="Можно принимать случайные запросы." />
        <StatusPill>🟢 Вы готовы помогать</StatusPill>
        <div className="stats"><b>{xpVolunteer.profile.xp} XP</b><b>Уровень {xpVolunteer.profile.level}</b><b>{xpVolunteer.profile.peopleHelped} помог</b></div>
        <ActionButton onClick={() => setStep('incoming')}>🎲 Найти человека</ActionButton>
        <div className="grid">
          <TileButton icon="🏆" label="Достижения" onClick={() => setStep('volunteerProfile')} />
          <TileButton icon="🛠️" label="Mock admin" onClick={() => setStep('admin')} />
        </div>
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell>
        <ScreenHeader title="Входящий запрос" subtitle="Пользователь хочет помощь: просто поговорить." />
        <ActionButton onClick={acceptIncomingRequest}>Принять</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>Пропустить</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'contacts' || step === 'safety' || step === 'volunteerProfile' || step === 'admin') {
    return <InfoScreen step={step} achievements={visibleAchievements} onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')} />;
  }

  return null;
}

function InfoScreen({ step, achievements, onBack }: { step: Step; achievements: Achievement[]; onBack: () => void }) {
  const title = step === 'contacts' ? 'Мои контакты' : step === 'admin' ? 'Mock admin' : step === 'volunteerProfile' ? 'Профиль' : 'Безопасность';
  return (
    <PhoneShell>
      <ScreenHeader title={title} />
      <div className="info-list">
        {step === 'contacts' ? <p>Дочь, сын, внук, сосед. В MVP контакты сохранены как mock.</p> : null}
        {step === 'safety' ? <p>Никому не сообщайте пароль, SMS-код или PIN. Помощник никогда не просит эти данные.</p> : null}
        {step === 'admin' ? <p>Mock-модерация: жалобы, блокировки и проверки отмечаются локально, без production backend.</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}>{item.icon} <b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>Назад</ActionButton>
    </PhoneShell>
  );
}
