import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from '../components/AuthPanel';
import { ActionButton, PhoneShell, ScreenHeader, TileButton } from '../components/RyadomUi';
import { VolunteerCard } from '../components/VolunteerCard';
import { analyzeChatSafety, type AiSafetyResult } from '../lib/aiSafety';
import { achievements, elders, helpCategories } from '../lib/ryadomData';
import {
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
import { createMyProfile, loadMyProfile, loadVolunteerStats, updateMyProfileName, type ProfileRow, type VolunteerProfileRow } from '../lib/ryadomProfile';
import { supabase } from '../lib/supabase';
import type { Language } from '../lib/i18n';
import { languageNames, uiText } from '../lib/i18n';
import { cleanDisplayName } from '../lib/displayText';
import type { Achievement, ChatMessage, HelpCategory, HelpSession, ReportReason, Role, Volunteer } from '../lib/ryadomTypes';

type Step =
  | 'loading'
  | 'role'
  | 'databaseSetup'
  | 'elderHome'
  | 'category'
  | 'search'
  | 'noVolunteer'
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
type FontMode = 'normal' | 'large';
type BrowserAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const friendsLeaderboard = [
  { name: 'Алия', score: 43 },
  { name: 'Данияр', score: 18 },
  { name: 'Мария', score: 12 },
];

const guestStats: VolunteerProfileRow = {
  xp: 0,
  level: 1,
  title: 'Новый помощник',
  rating: 0,
  people_helped: 0,
  thanks_received: 0,
  successful_help_count: 0,
  trust_level: 'NEW',
  verification_status: 'guest',
};

const aiVolunteer: Volunteer = {
  id: 'ai-helper',
  role: 'volunteer',
  name: 'AI',
  age: 0,
  city: 'Online',
  avatar: 'AI',
  createdAt: new Date().toISOString(),
  status: 'online',
  profile: {
    userId: 'ai-helper',
    verified: true,
    skills: ['any'],
    rating: 5,
    ratingCount: 0,
    xp: 0,
    level: 1,
    title: 'AI помощник',
    successfulHelpCount: 0,
    peopleHelped: 0,
    thanksReceived: 0,
    trustScore: 100,
    riskScore: 0,
    trustLevel: 'VERIFIED',
    reportsCount: 0,
    seriousReportsCount: 0,
    blockedCount: 0,
    online: true,
    busy: false,
  },
};

type LeaderboardRow = {
  name: string;
  score: number;
  current: boolean;
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
  const [fontMode, setFontMode] = useState<FontMode>(() => (localStorage.getItem('komek-font') === 'large' ? 'large' : 'normal'));
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('komek-sound') !== 'off');
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = localStorage.getItem('komek-language');
    return savedLanguage === 'kk' || savedLanguage === 'en' ? savedLanguage : 'ru';
  });
  const searchTimerRef = useRef<number | undefined>(undefined);
  const searchSoundRef = useRef<{ context: AudioContext; timer: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);
  const text = uiText[language];
  const profileName = cleanDisplayName(profile?.name, profile?.role ?? role);

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
        if (!savedProfile) {
          setProfile(null);
          setStep('role');
          return;
        }
        const cleanName = cleanDisplayName(savedProfile.name, savedProfile.role);
        const cleanProfile = cleanName === savedProfile.name ? savedProfile : { ...savedProfile, name: cleanName };
        setProfile(cleanProfile);
        if (cleanName !== savedProfile.name) void updateMyProfileName(savedProfile.id, cleanName);
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

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontMode;
    localStorage.setItem('komek-font', fontMode);
  }, [fontMode]);

  useEffect(() => {
    localStorage.setItem('komek-sound', soundEnabled ? 'on' : 'off');
    if (!soundEnabled) stopSearchSound();
  }, [soundEnabled]);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('komek-language', language);
  }, [language]);

  const chooseRole = async (nextRole: Role) => {
    setRole(nextRole);
    if (guestMode) {
      playOpenSound();
      const guestId = `guest-${nextRole}`;
      setProfile({
        id: guestId,
        auth_user_id: 'guest',
        role: nextRole,
        name: nextRole === 'elder' ? uiText[language].needHelp : uiText[language].wantHelp,
        age: null,
        city: null,
        avatar_url: null,
      });
      setVolunteerStats(nextRole === 'volunteer' ? guestStats : null);
      setHelpSession(undefined);
      setMessages([]);
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
      return;
    }
    if (!session) return;

    try {
      const fallbackName = nextRole === 'elder' ? uiText[language].needHelp : uiText[language].verifiedHelper;
      const meta = session.user.user_metadata;
      const fullName = [meta.first_name, meta.last_name].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ');
      const savedProfile = await createMyProfile(nextRole, fullName || (typeof meta.full_name === 'string' ? meta.full_name : fallbackName));
      playOpenSound();
      setProfile(savedProfile);
      if (nextRole === 'volunteer') setVolunteerStats(await loadVolunteerStats(savedProfile.id));
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText[language].retry);
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
        setVolunteer(aiVolunteer);
        setStep('noVolunteer');
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

  const startAiHelp = () => {
    const elderId = profile?.id ?? 'guest-elder';
    const request = createHelpRequest(elderId, category);
    const nextSession = createHelpSession(request, aiVolunteer);
    setVolunteer(aiVolunteer);
    setHelpSession(nextSession);
    setBlockedChat(false);
    setAiSafety(null);
    setMessages([
      createMessage(nextSession.id, aiVolunteer.id, 'system', 'Свободных волонтёров сейчас нет. AI поможет с простыми шагами и подскажет, когда нужен человек.'),
      createMessage(nextSession.id, aiVolunteer.id, 'text', 'Опишите, что не получается. Я отвечу спокойно и без просьб о паролях или кодах.'),
    ]);
    setStep('chat');
  };

  const startSearchSound = () => {
    if (!soundEnabled) return;
    stopSearchSound();
    const audioWindow = window as BrowserAudioWindow;
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const playPulse = () => {
      void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(520, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(760, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.02);
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

  const playOpenSound = () => {
    playToneSequence([520, 660, 880], 0.07);
  };

  const playCloseSound = () => {
    playToneSequence([880, 660, 440], 0.06);
  };

  const playToneSequence = (notes: number[], volume: number) => {
    if (!soundEnabled) return;
    const audioWindow = window as BrowserAudioWindow;
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    notes.forEach((frequency, index) => {
      const startAt = context.currentTime + index * 0.09;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.14);
    });
    window.setTimeout(() => void context.close(), notes.length * 95 + 180);
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
      voice: uiText[language].voice,
      photo: uiText[language].photo,
      video: uiText[language].video,
    };
    setMessages((items) => [...items, createMessage(helpSession.id, profile?.id ?? elders[0].id, type, textByType[type])]);
  };

  const sendSelectedFile = (type: 'photo' | 'video', file?: File) => {
    if (!helpSession || !file || blockedChat) return;
    const url = URL.createObjectURL(file);
    const fallbackText = type === 'photo' ? uiText[language].photo : uiText[language].video;
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
    submitReport('bad_behavior', uiText[language].unsafe);
  };

  const finishRating = async () => {
    if (profile?.role === 'volunteer' && !guestMode) setVolunteerStats(await loadVolunteerStats(profile.id));
    resetMockBackend();
    setStep(role === 'elder' ? 'elderHome' : 'volunteerHome');
  };

  const enterAsGuest = () => {
    playOpenSound();
    setGuestMode(true);
    setProfile(null);
    setVolunteerStats(null);
    setHelpSession(undefined);
    setMessages([]);
    setMessage('');
    setStep('role');
  };

  const signOutApp = async () => {
    playCloseSound();
    setGuestMode(false);
    setProfile(null);
    setVolunteerStats(null);
    setHelpSession(undefined);
    setMessages([]);
    setStep('role');
    await supabase.auth.signOut();
  };

  if (!session && !guestMode) return <AuthPanel language={language} onGuest={enterAsGuest} />;

  if (step === 'loading') return <LoadingScreen title={text.searchEyebrow} />;

  if (step === 'role') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.roleTitle} subtitle={text.roleSubtitle} />
        <RoleChoiceHero />
        {message ? <p className="message">{message}</p> : null}
        <div className="stack">
          <ActionButton onClick={() => chooseRole('elder')}>{text.needHelp}</ActionButton>
          <ActionButton tone="calm" onClick={() => chooseRole('volunteer')}>{text.wantHelp}</ActionButton>
        </div>
        <ActionButton tone="ghost" onClick={signOutApp}>{text.exit}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'databaseSetup') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.retry} subtitle={text.intro} />
        <div className="info-list">
          <p>{text.intro}</p>
          <p>{databaseError}</p>
        </div>
        <ActionButton onClick={() => window.location.reload()}>{text.retry}</ActionButton>
        <ActionButton tone="ghost" onClick={signOutApp}>{text.exit}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'elderHome') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <header className="top-bar">
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEQ</strong>
          <button onClick={() => setStep('safety')}>{text.settings}</button>
        </header>
        <section className="home-panel">
          <h1>KOMEQ</h1>
          <p className="eyebrow">{text.roleTitle}, {profileName}</p>
          <p>{text.intro}</p>
          <ActionButton onClick={() => setStep('category')}>{text.chooseHelp}</ActionButton>
        </section>
        <section className="trust-note">
          <strong>{text.service}</strong>
          <p>{text.intro}</p>
        </section>
        <BottomNav items={[text.help, text.history, text.settings]} onSecond={() => setStep('history')} onThird={() => setStep('safety')} />
      </PhoneShell>
    );
  }

  if (step === 'category') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Нужна помощь?" subtitle={text.intro} />
        <ActionButton onClick={() => startSearch('any')}>{text.anyHelper}</ActionButton>
        <div className="grid">
          {helpCategories.filter((item) => item.id !== 'any').map((item) => (
            <TileButton key={item.id} icon="" label={item.label} onClick={() => startSearch(item.id)} />
          ))}
        </div>
        <ActionButton tone="ghost" onClick={() => setStep('elderHome')}>{text.back}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'search') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <section className="center-screen">
          <div className="search-indicator" aria-hidden="true"><span /></div>
          <p className="eyebrow">{text.searchEyebrow}</p>
          <h1>{text.searchTitle}</h1>
          <p>{text.intro}</p>
          <div className="search-steps" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <ActionButton tone="ghost" onClick={() => { window.clearTimeout(searchTimerRef.current); stopSearchSound(); setStep('elderHome'); }}>{text.cancelSearch}</ActionButton>
        </section>
      </PhoneShell>
    );
  }

  if (step === 'found' && volunteer) {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.foundTitle} subtitle={`${text.theme}: ${helpCategories.find((item) => item.id === category)?.label ?? ''}`} />
        <VolunteerCard volunteer={volunteer} language={language} />
        <ActionButton onClick={() => setStep('chat')}>{text.startChat}</ActionButton>
        <ActionButton tone="ghost" onClick={() => startSearch(category)}>{text.otherHelper}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'noVolunteer') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Нет мест" subtitle="Свободных волонтёров сейчас нет, но AI может помочь сразу." />
        <div className="info-list">
          <p>AI подскажет безопасные шаги и не попросит пароль, SMS-код или банковские данные.</p>
          <p>Если появится проблема, можно отправить жалобу на модерацию.</p>
        </div>
        <ActionButton onClick={startAiHelp}>Начать с AI</ActionButton>
        <ActionButton tone="ghost" onClick={() => startSearch(category)}>Искать ещё раз</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const risk = messages.some((item) => hasSafetyRisk(item.text));
    return (
      <PhoneShell screenKey={step} language={language}>
        <header className="chat-header">
          <div>
            <h1>{volunteer.name} K.</h1>
            <p>{text.verifiedHelper}</p>
          </div>
          <button onClick={() => setStep('history')}>{text.history}</button>
        </header>
        <div className="safety-note">{text.safetyNote}</div>
        {isCheckingSafety ? <div className="ai-safety ai-safety--checking">{text.aiChecking}</div> : null}
        {aiSafety && aiSafety.risk !== 'safe' ? (
          <div className={`ai-safety ai-safety--${aiSafety.risk}`}>
            <strong>{aiSafety.action === 'block' ? text.dialogStopped : text.cautionNeeded}</strong>
            <p>{aiSafety.reason}</p>
          </div>
        ) : null}
        {risk ? (
          <div className="warning">
            <strong>{text.beCareful}</strong>
            <p>{text.safetyNote}</p>
            <button onClick={() => submitReport('password', text.suspicious)}>{text.suspicious}</button>
          </div>
        ) : null}
        {blockedChat ? <div className="warning">{text.blockedChat}</div> : null}
        <div className="chat-list">
          {messages.map((item) => (
            <div key={item.id} className={item.senderId === profile?.id ? 'message message--mine' : 'message'}>
              {item.messageType === 'photo' && item.fileUrl ? <img className="message-media" src={item.fileUrl} alt={item.fileName ?? text.photo} /> : null}
              {item.messageType === 'video' && item.fileUrl ? <video className="message-media" src={item.fileUrl} controls /> : null}
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="chat-tools">
          <button disabled={blockedChat} onClick={() => photoInputRef.current?.click()}>{text.photo}</button>
          <button disabled={blockedChat} onClick={() => sendQuickMedia('voice')}>{text.voice}</button>
          <button disabled={blockedChat} onClick={() => videoInputRef.current?.click()}>{text.video}</button>
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
          <input disabled={blockedChat} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.messagePlaceholder} />
          <button disabled={blockedChat} onClick={sendText}>{text.send}</button>
        </div>
        <div className="safety-actions">
          <button onClick={() => setStep('report')}>{text.complaint}</button>
          <button onClick={() => setStep('unsafe')}>{text.unsafe}</button>
          <button onClick={blockCurrentVolunteer}>{text.block}</button>
        </div>
        <ActionButton tone="danger" onClick={completeHelp}>{text.finishHelp}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'history') {
    return <HistoryScreen language={language} session={helpSession} volunteer={volunteer} messages={messages} onChat={() => setStep('chat')} onBack={() => setStep('elderHome')} />;
  }

  if (step === 'report' && volunteer) {
    return (
      <ReportScreen
        reason={reportReason}
        language={language}
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
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.unsafeTitle} subtitle={text.unsafeSubtitle} />
        <ActionButton tone="danger" onClick={stopUnsafeHelp}>{text.yesStop}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('chat')}>{text.cancel}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'blocked') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.blockedTitle} subtitle={text.blockedSubtitle} />
        <div className="info-list">
          <p>{text.blockedHelp}</p>
          <p>{text.safetyNote}</p>
        </div>
        <ActionButton onClick={() => setStep('elderHome')}>{text.home}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'rating') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.thanksTitle} subtitle={text.ratingSubtitle} />
        <div className="rating-scale">
          {[1, 2, 3, 4, 5].map((star) => <button key={star} onClick={() => setRating(star)} className={star <= rating ? 'active' : ''}>{star}</button>)}
        </div>
        <ActionButton onClick={finishRating}>{text.done}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>{text.complaint}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const xp = volunteerStats?.xp ?? 0;
    const level = volunteerStats?.level ?? 1;
    const helped = volunteerStats?.people_helped ?? 0;
    const ratingValue = volunteerStats?.rating ?? 0;

    return (
      <PhoneShell screenKey={step} language={language}>
        <header className="top-bar">
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEQ</strong>
          <button onClick={() => setStep('admin')}>{text.profile}</button>
        </header>
        <ScreenHeader title={`${text.hello}, ${profileName}`} subtitle={text.helpStatus} />
        <section className="status-card">
          <div>
            <p className="eyebrow">{text.readiness}</p>
            <h2>{text.readyToHelp}</h2>
            <p>{text.readyDescription}</p>
          </div>
          <span>ON</span>
        </section>
        <div className="stats">
          <b><span>{helped}</span>{text.helpedCount}</b>
          <b><span>{ratingValue.toFixed(1)}</span>{text.score}</b>
          <b><span>{xp}</span>XP</b>
        </div>
        {helped === 0 ? <p className="empty-state">{text.noActivity}</p> : null}
        <section className="level-card">
          <p>LEVEL {String(level).padStart(2, '0')}</p>
          <h2>{volunteerStats?.title ?? text.reliableHelper}</h2>
          <div className="progress"><span style={{ width: `${Math.min(100, (xp % 1000) / 10)}%` }} /></div>
          <small>{xp} / 1000 XP</small>
        </section>
        <Leaderboard title={text.leaderboard} currentName={profileName} currentScore={helped} />
        <ActionButton onClick={() => setStep('incoming')}>{text.showRequest}</ActionButton>
        <BottomNav items={[text.help, text.progress, text.profile]} onSecond={() => setStep('volunteerProfile')} onThird={() => setStep('admin')} />
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.incomingTitle} subtitle={text.incomingSubtitle} />
        <ActionButton onClick={acceptIncomingRequest}>{text.accept}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>{text.notNow}</ActionButton>
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
        fontMode={fontMode}
        soundEnabled={soundEnabled}
        language={language}
        onThemeChange={setThemeMode}
        onFontChange={setFontMode}
        onSoundChange={setSoundEnabled}
        onLanguageChange={setLanguage}
        onSignOut={signOutApp}
        onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')}
      />
    );
  }

  return null;
}

function Leaderboard({ title, currentName, currentScore }: { title: string; currentName: string; currentScore: number }) {
  const friends = currentScore > 0 ? friendsLeaderboard : [];
  const rows: LeaderboardRow[] = [{ name: currentName, score: currentScore, current: true }, ...friends.map((friend) => ({ ...friend, current: false }))]
    .sort((first, second) => second.score - first.score)
    .slice(0, 4);

  return (
    <section className="leaderboard">
      <h2>{title}</h2>
      {rows.map((row, index) => (
        <div key={`${row.name}-${index}`} className={row.current ? 'leaderboard-row leaderboard-row--me' : 'leaderboard-row'}>
          <span>{index + 1}</span>
          <strong>{row.name}</strong>
          <b>{row.score}</b>
        </div>
      ))}
    </section>
  );
}

function LoadingScreen({ title }: { title: string }) {
  return (
    <PhoneShell screenKey="loading" language="ru">
      <section className="center-screen">
        <div className="search-indicator" aria-hidden="true"><span /></div>
        <h1>{title}</h1>
      </section>
    </PhoneShell>
  );
}

function RoleChoiceHero() {
  return (
    <section className="role-hero" aria-hidden="true">
      <div className="role-hero__glow" />
      <svg className="role-hero__art" viewBox="0 0 360 210" role="img">
        <path className="role-hero__ground" d="M58 178 C92 160, 143 162, 179 175 C216 188, 268 191, 308 172" />
        <g className="role-person role-person--elder">
          <circle cx="120" cy="64" r="37" fill="#f1c6ad" />
          <path d="M83 65 C84 30, 104 15, 130 22 C157 30, 164 51, 155 78 C143 69, 108 68, 83 65 Z" fill="#f7f1eb" />
          <path d="M89 53 C85 83, 95 98, 115 99 C98 108, 78 94, 76 71 C74 56, 80 47, 89 53 Z" fill="#f7f1eb" />
          <path d="M153 54 C162 84, 150 100, 130 99 C148 110, 168 94, 166 71 C165 57, 161 48, 153 54 Z" fill="#f7f1eb" />
          <circle cx="107" cy="66" r="3" fill="#3c3033" />
          <circle cx="132" cy="66" r="3" fill="#3c3033" />
          <path d="M109 82 C116 89, 126 89, 133 82" fill="none" stroke="#8d5f56" strokeWidth="4" strokeLinecap="round" />
          <path d="M81 180 C83 127, 97 105, 121 105 C148 105, 161 128, 164 180 Z" fill="#b85c78" />
          <path d="M96 118 C112 134, 133 134, 149 118" fill="none" stroke="#faeef1" strokeWidth="7" strokeLinecap="round" />
          <path d="M83 143 C58 147, 50 163, 62 176" fill="none" stroke="#f1c6ad" strokeWidth="13" strokeLinecap="round" />
        </g>
        <g className="role-person role-person--volunteer">
          <circle cx="239" cy="60" r="34" fill="#d99a75" />
          <path d="M203 59 C207 27, 229 13, 255 23 C274 31, 282 48, 279 68 C260 57, 232 55, 203 59 Z" fill="#3e3a3d" />
          <circle cx="227" cy="63" r="3" fill="#2c2528" />
          <circle cx="251" cy="63" r="3" fill="#2c2528" />
          <path d="M228 79 C236 86, 246 86, 253 79" fill="none" stroke="#7a3e32" strokeWidth="4" strokeLinecap="round" />
          <path d="M197 180 C201 126, 216 101, 240 101 C269 101, 287 128, 292 180 Z" fill="#4f7f67" />
          <path d="M218 107 L239 132 L261 107" fill="none" stroke="#edf6f1" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M200 139 C178 145, 157 153, 142 166" fill="none" stroke="#d99a75" strokeWidth="13" strokeLinecap="round" />
          <path d="M145 166 C136 173, 126 173, 119 166" fill="none" stroke="#d99a75" strokeWidth="10" strokeLinecap="round" />
        </g>
        <path className="role-heart" d="M179 91 C174 82, 160 83, 160 96 C160 109, 179 118, 179 118 C179 118, 199 108, 199 96 C199 83, 184 82, 179 91 Z" />
      </svg>
    </section>
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
  language,
  session,
  volunteer,
  messages,
  onChat,
  onBack,
}: {
  language: Language;
  session?: HelpSession;
  volunteer?: Volunteer;
  messages: ChatMessage[];
  onChat: () => void;
  onBack: () => void;
}) {
  const sessionDate = session ? new Date(session.startedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'ru-RU') : uiText[language].history;
  return (
    <PhoneShell screenKey="history" language={language}>
      <ScreenHeader title={uiText[language].history} subtitle={uiText[language].intro} />
      <div className="history-list">
        {session && volunteer ? (
          <button className="history-item" onClick={onChat}>
            <span>{session.status === 'completed' ? uiText[language].done : uiText[language].history}</span>
            <strong>{volunteer.name} K.</strong>
            <p>{sessionDate} · {messages.length}</p>
          </button>
        ) : (
          <div className="history-item">
            <span>{uiText[language].history}</span>
            <strong>{uiText[language].intro}</strong>
            <p>{uiText[language].searchTitle}</p>
          </div>
        )}
      </div>
      <ActionButton onClick={onBack}>{uiText[language].back}</ActionButton>
    </PhoneShell>
  );
}

function ReportScreen({
  reason,
  language,
  comment,
  onReasonChange,
  onCommentChange,
  onSubmit,
  onBack,
}: {
  reason: ReportReason;
  language: Language;
  comment: string;
  onReasonChange: (reason: ReportReason) => void;
  onCommentChange: (comment: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const reasons: Array<{ id: ReportReason; label: string }> = [
    { id: 'trolling', label: uiText[language].complaint },
    { id: 'money', label: uiText[language].suspicious },
    { id: 'password', label: uiText[language].safetyNote },
    { id: 'bank_data', label: uiText[language].safetyNote },
    { id: 'suspicious_app', label: uiText[language].suspicious },
    { id: 'suspicious_content', label: uiText[language].suspicious },
    { id: 'bad_behavior', label: uiText[language].beCareful },
    { id: 'other', label: uiText[language].complaint },
  ];

  return (
    <PhoneShell screenKey="report" language={language}>
      <ScreenHeader title={uiText[language].complaint} subtitle={uiText[language].safetyNote} />
      <div className="report-options">
        {reasons.map((item) => (
          <button key={item.id} className={item.id === reason ? 'active' : ''} onClick={() => onReasonChange(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <textarea className="report-comment" value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder={uiText[language].messagePlaceholder} />
      <ActionButton onClick={onSubmit}>{uiText[language].submitReport}</ActionButton>
      <ActionButton tone="ghost" onClick={onBack}>{uiText[language].back}</ActionButton>
    </PhoneShell>
  );
}
function InfoScreen({
  step,
  profile,
  stats,
  achievements,
  themeMode,
  fontMode,
  soundEnabled,
  language,
  onThemeChange,
  onFontChange,
  onSoundChange,
  onLanguageChange,
  onSignOut,
  onBack,
}: {
  step: Step;
  profile: ProfileRow | null;
  stats: VolunteerProfileRow | null;
  achievements: Achievement[];
  themeMode: ThemeMode;
  fontMode: FontMode;
  soundEnabled: boolean;
  language: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onFontChange: (font: FontMode) => void;
  onSoundChange: (enabled: boolean) => void;
  onLanguageChange: (language: Language) => void;
  onSignOut: () => void;
  onBack: () => void;
}) {
  const title = step === 'admin' ? uiText[language].profile : step === 'volunteerProfile' ? uiText[language].progress : uiText[language].settings;
  const reports = getSafetyReports();
  const profileName = cleanDisplayName(profile?.name, profile?.role);
  return (
    <PhoneShell screenKey={step} language={language}>
      <ScreenHeader title={title} subtitle={profile ? `${profileName} · ${profile.city ?? ''}` : undefined} />
      <div className="info-list">
        {step === 'safety' ? <p>{uiText[language].safetyNote}</p> : null}
        {step === 'admin' ? <p>{uiText[language].profile}: {profile?.role === 'elder' ? uiText[language].needHelp : uiText[language].wantHelp}</p> : null}
        {step === 'admin' ? <p>{uiText[language].complaint}: {reports.length}</p> : null}

        {step === 'safety' ? (
          <div className="settings-group">
            <strong>{uiText[language].theme}</strong>
            <div className="theme-toggle" role="group" aria-label={uiText[language].theme}>
              <button className={themeMode === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>{uiText[language].defaultTheme}</button>
              <button className={themeMode === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>{uiText[language].darkTheme}</button>
            </div>
          </div>
        ) : null}
        {step === 'safety' ? (
          <div className="settings-group">
            <strong>{uiText[language].textSize}</strong>
            <div className="theme-toggle" role="group" aria-label={uiText[language].textSize}>
              <button className={fontMode === 'normal' ? 'active' : ''} onClick={() => onFontChange('normal')}>{uiText[language].normalText}</button>
              <button className={fontMode === 'large' ? 'active' : ''} onClick={() => onFontChange('large')}>{uiText[language].largeText}</button>
            </div>
          </div>
        ) : null}
        {step === 'safety' ? (
          <div className="settings-group">
            <strong>{uiText[language].gameSounds}</strong>
            <div className="theme-toggle" role="group" aria-label={uiText[language].sound}>
              <button className={soundEnabled ? 'active' : ''} onClick={() => onSoundChange(true)}>{uiText[language].soundOn}</button>
              <button className={!soundEnabled ? 'active' : ''} onClick={() => onSoundChange(false)}>{uiText[language].soundOff}</button>
            </div>
          </div>
        ) : null}
        {step === 'safety' ? (
          <div className="settings-group">
            <strong>{uiText[language].language}</strong>
            <div className="language-toggle" role="group" aria-label={uiText[language].language}>
              {(['ru', 'kk', 'en'] as const).map((item) => (
                <button key={item} className={language === item ? 'active' : ''} onClick={() => onLanguageChange(item)}>
                  {languageNames[item]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {step === 'volunteerProfile' && stats ? <p>{stats.rating} {uiText[language].rating} · {stats.xp} XP · {stats.people_helped} {uiText[language].helpedCount}</p> : null}
        {step === 'volunteerProfile' && stats?.people_helped === 0 ? <p>{uiText[language].noActivity}</p> : null}
        {step === 'volunteerProfile' && stats && stats.people_helped > 0 ? achievements.map((item) => {
          const unlocked = stats.people_helped >= item.requirement;
          return <p key={item.id}><b>{item.name}</b><br />{unlocked ? uiText[language].done : uiText[language].noActivity}</p>;
        }) : null}
      </div>
      <ActionButton onClick={onBack}>{uiText[language].back}</ActionButton>
      <ActionButton tone="ghost" onClick={onSignOut}>{uiText[language].signOut}</ActionButton>
    </PhoneShell>
  );
}
