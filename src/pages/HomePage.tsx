import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLocation } from 'wouter';
import { AuthPanel } from '../components/AuthPanel';
import { ActionButton, PhoneShell, ScreenHeader, TileButton } from '../components/RyadomUi';
import { VolunteerCard } from '../components/VolunteerCard';
import { analyzeChatSafety, type AiSafetyResult } from '../lib/aiSafety';
import { achievements } from '../lib/ryadomData';
import {
  blockUser,
  createHelpRequest,
  createHelpSession,
  createMessage,
  createSafetyReport,
  findRandomVolunteer,
  finishHelpSession,
  getSafetyReports,
  hasSafetyRisk,
  resetMockBackend,
} from '../lib/ryadomServices';
import { createMyProfile, loadMyProfile, loadVolunteerStats, signInAsAnonymousGuest, updateMyProfileName, type ProfileRow, type VolunteerProfileRow } from '../lib/ryadomProfile';
import { createSupabaseHelpSession, findOnlineVolunteer, saveHelpRequest, saveSafetyReport, setMyVolunteerOnline } from '../lib/ryadomPersistence';
import { supabase } from '../lib/supabase';
import type { Language } from '../lib/i18n';
import { languageNames, uiText } from '../lib/i18n';
import { cleanDisplayName } from '../lib/displayText';
import type { Achievement, ChatMessage, HelpCategory, HelpSession, ReportReason, Role, Volunteer } from '../lib/ryadomTypes';

type Step =
  | 'loading'
  | 'welcome'
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
  | 'safetyGuide'
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
type SpeechRecognitionResultLike = {
  readonly 0: { transcript: string };
  isFinal?: boolean;
};
type SpeechRecognitionEventLike = Event & {
  results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
type AiFunctionResponse = {
  text?: string;
  error?: string;
};

const elderHelpOptions: Array<{ id: HelpCategory; label: string }> = [
  { id: 'phone', label: 'С телефоном' },
  { id: 'apps', label: 'С приложением' },
  { id: 'internet', label: 'С интернетом' },
  { id: 'messengers', label: 'С сообщением' },
  { id: 'talk', label: 'Другое' },
];

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

const komekAiSystemPrompt = `
Ты KÖMEK AI, голосовой помощник приложения KÖMEK.
Твои рамки: поддержка пожилых людей и помощь с телефоном, интернетом, приложениями, сообщениями, настройками, безопасностью и связью с волонтёром.
Не отвечай на темы вне KÖMEK и помощи пожилым: развлечения, споры, политика, учебные задания, программирование, личные советы не по поддержке, любые случайные вопросы.
Если вопрос вне рамок, ответь коротко: "Я могу помочь только с поддержкой в KÖMEK: телефон, интернет, приложения, сообщения, безопасность или связь с волонтёром. Чем помочь?"
Внутри рамок отвечай спокойно, коротко и пошагово.
Отвечай как удобный чат: без markdown, без звездочек, без длинных списков, 2-5 коротких предложений.
Если нужны шаги, давай максимум 3 шага за раз и в конце спрашивай, получилось ли.
Никогда не проси пароли, SMS-коды, PIN или данные карт.
Если проблема опасная, банковская или срочная, предложи позвать живого волонтёра или близкого человека.
`;

type SavedAppState = {
  step: Step;
  role: Role;
  category: HelpCategory;
  helpSession?: HelpSession;
  volunteer?: Volunteer;
  messages: ChatMessage[];
  draft: string;
  blockedChat: boolean;
};

const savedStateKey = 'komek-app-state';
const restorableSteps: Step[] = [
  'role',
  'elderHome',
  'category',
  'noVolunteer',
  'found',
  'chat',
  'report',
  'unsafe',
  'blocked',
  'safetyGuide',
  'history',
  'rating',
  'safety',
  'volunteerHome',
  'incoming',
  'volunteerProfile',
  'admin',
];

function isRestorableStep(value: unknown): value is Step {
  return typeof value === 'string' && restorableSteps.includes(value as Step);
}

function loadSavedAppState(): SavedAppState | null {
  try {
    const raw = localStorage.getItem(savedStateKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedAppState>;
    if (!isRestorableStep(parsed.step)) return null;
    if (parsed.role !== 'elder' && parsed.role !== 'volunteer') return null;
    if (typeof parsed.category !== 'string') return null;
    return {
      step: parsed.step,
      role: parsed.role,
      category: parsed.category as HelpCategory,
      helpSession: parsed.helpSession,
      volunteer: parsed.volunteer,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      draft: typeof parsed.draft === 'string' ? parsed.draft : '',
      blockedChat: Boolean(parsed.blockedChat),
    };
  } catch {
    return null;
  }
}

function getSafeRestoredStep(saved: SavedAppState, fallback: Step) {
  const needsChatState: Step[] = ['found', 'chat', 'report', 'unsafe', 'blocked', 'rating'];
  if (needsChatState.includes(saved.step) && (!saved.helpSession || !saved.volunteer)) return fallback;
  if ((saved.step === 'incoming' || saved.step === 'volunteerProfile') && saved.role !== 'volunteer') return fallback;
  return saved.step;
}

function routeForRole(nextRole: Role) {
  return nextRole === 'elder' ? '/elder' : '/helper';
}


export function HomePage({ routeRole }: { routeRole?: Role }) {
  const [, navigate] = useLocation();
  const savedAppState = useMemo(() => loadSavedAppState(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [welcomeSeen, setWelcomeSeen] = useState(() => localStorage.getItem('komek-welcome-seen') === 'yes');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [volunteerStats, setVolunteerStats] = useState<VolunteerProfileRow | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [role, setRole] = useState<Role>(savedAppState?.role ?? 'elder');
  const [volunteer, setVolunteer] = useState<Volunteer | undefined>(savedAppState?.volunteer);
  const [category, setCategory] = useState<HelpCategory>(savedAppState?.category ?? 'any');
  const [helpSession, setHelpSession] = useState<HelpSession | undefined>(savedAppState?.helpSession);
  const [messages, setMessages] = useState<ChatMessage[]>(savedAppState?.messages ?? []);
  const [draft, setDraft] = useState(savedAppState?.draft ?? '');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [firstActionPraise, setFirstActionPraise] = useState('');
  const [databaseError, setDatabaseError] = useState('');
  const [reportReason, setReportReason] = useState<ReportReason>('trolling');
  const [reportComment, setReportComment] = useState('');
  const [blockedChat, setBlockedChat] = useState(savedAppState?.blockedChat ?? false);
  const [voicePrompt, setVoicePrompt] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiSpeechPaused, setIsAiSpeechPaused] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [persistenceNotice, setPersistenceNotice] = useState('');
  const [aiSafety, setAiSafety] = useState<AiSafetyResult | null>(null);
  const [isCheckingSafety, setIsCheckingSafety] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem('hopee-theme') === 'dark' ? 'dark' : 'light'));
  const [fontMode, setFontMode] = useState<FontMode>(() => (localStorage.getItem('komek-font') === 'large' ? 'large' : 'normal'));
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('komek-sound') !== 'off');
  const [soundVolume, setSoundVolume] = useState(() => Number(localStorage.getItem('komek-volume') ?? '70'));
  const [language, setLanguage] = useState<Language>(() => {
    const savedLanguage = localStorage.getItem('komek-language');
    return savedLanguage === 'kk' || savedLanguage === 'en' ? savedLanguage : 'ru';
  });
  const searchTimerRef = useRef<number | undefined>(undefined);
  const searchSoundRef = useRef<{ context: AudioContext; timer: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTranscriptRef = useRef('');
  const visibleAchievements = useMemo(() => achievements.slice(0, 3), []);
  const text = uiText[language];
  const profileName = cleanDisplayName(profile?.name, profile?.role ?? role);
  const myChatId = profile?.id ?? (role === 'elder' ? 'guest-elder' : 'guest-volunteer');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<Language>).detail;
      if (nextLanguage === 'ru' || nextLanguage === 'kk' || nextLanguage === 'en') {
        setLanguage(nextLanguage);
      }
    };
    window.addEventListener('komek-language-change', handleLanguageChange);
    return () => window.removeEventListener('komek-language-change', handleLanguageChange);
  }, []);

  useEffect(() => {
    if (routeRole && !session && !guestMode) {
      setGuestMode(true);
      void signInAsAnonymousGuest().then(({ error }) => {
        if (error) {
          setGuestMode(false);
          setMessage('Не получилось войти как гость. Проверьте Anonymous Sign-In в Supabase Auth.');
          navigate('/');
          setStep('welcome');
        }
      });
      return;
    }
    if (!routeRole || !session || profile) return;
    setGuestMode(true);
    void chooseRole(routeRole);
  }, [routeRole, session, language]);

  useEffect(() => {
    if (!session) {
      if (routeRole) return;
      if (!guestMode) {
        setProfile(null);
        setStep(welcomeSeen ? 'role' : 'welcome');
      }
      return;
    }

    loadMyProfile()
      .then(async (savedProfile) => {
        if (!savedProfile) {
          setProfile(null);
          setStep(guestMode ? 'role' : welcomeSeen ? 'role' : 'welcome');
          return;
        }
        const cleanName = cleanDisplayName(savedProfile.name, savedProfile.role);
        const cleanProfile = cleanName === savedProfile.name ? savedProfile : { ...savedProfile, name: cleanName };
        setProfile(cleanProfile);
        if (cleanName !== savedProfile.name) void updateMyProfileName(savedProfile.id, cleanName);
        setRole(savedProfile.role);
        const homeStep = savedProfile.role === 'elder' ? 'elderHome' : 'volunteerHome';
        const restoredStep = savedAppState?.role === savedProfile.role ? getSafeRestoredStep(savedAppState, homeStep) : homeStep;
        setStep(restoredStep);
        navigate(routeForRole(savedProfile.role), { replace: true });
        if (savedProfile.role === 'volunteer') {
          await setMyVolunteerOnline(savedProfile.id, true);
          setVolunteerStats(await loadVolunteerStats(savedProfile.id));
        }
      })
      .catch((error: Error) => {
        setDatabaseError(error.message);
        setStep('databaseSetup');
      });
  }, [session, guestMode, welcomeSeen]);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
    stopSearchSound();
    stopVoiceTracks();
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
    localStorage.setItem('komek-volume', String(soundVolume));
  }, [soundVolume]);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('komek-language', language);
  }, [language]);

  useEffect(() => {
    if (step === 'loading' || step === 'databaseSetup') return;
    if (!isRestorableStep(step)) return;
    const stateToSave: SavedAppState = {
      step,
      role,
      category,
      helpSession,
      volunteer,
      messages,
      draft,
      blockedChat,
    };
    localStorage.setItem(savedStateKey, JSON.stringify(stateToSave));
  }, [step, role, category, helpSession, volunteer, messages, draft, blockedChat]);

  const chooseRole = async (nextRole: Role) => {
    setRole(nextRole);
    setFirstActionPraise(nextRole === 'elder' ? 'Отлично. Теперь можно сразу попросить помощь.' : 'Отлично. Вы готовы принять первую просьбу о помощи.');
    if (guestMode) {
      localStorage.setItem('komek-guest-role', nextRole);
    }
    if (!session) return;

    try {
      const fallbackName = nextRole === 'elder' ? uiText[language].needHelp : uiText[language].verifiedHelper;
      const meta = session.user.user_metadata;
      const fullName = [meta.first_name, meta.last_name].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ');
      const guestName = nextRole === 'elder' ? 'Гость, нужна помощь' : 'Гость-помощник';
      const savedProfile = await createMyProfile(nextRole, guestMode ? guestName : fullName || (typeof meta.full_name === 'string' ? meta.full_name : fallbackName));
      playOpenSound();
      setProfile(savedProfile);
      if (nextRole === 'volunteer') {
        await setMyVolunteerOnline(savedProfile.id, true);
        setVolunteerStats(await loadVolunteerStats(savedProfile.id));
      }
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
      navigate(routeForRole(nextRole));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText[language].retry);
    }
  };

  const canSaveToSupabase = () => Boolean(profile && profile.auth_user_id !== 'guest');

  const saveRequestIfPossible = async (help: HelpCategory) => {
    if (!profile || !canSaveToSupabase()) return;
    try {
      const requestId = await saveHelpRequest(profile.id, help);
      setPersistenceNotice('');
      return requestId;
    } catch {
      setPersistenceNotice('Не получилось сохранить обращение в Supabase. Мы продолжим работу на экране, попробуйте ещё раз позже.');
      return undefined;
    }
  };

  const persistReportIfPossible = (reason: ReportReason, comment: string) => {
    if (!profile || !volunteer || !canSaveToSupabase() || volunteer.id === aiVolunteer.id) return;
    void saveSafetyReport(helpSession, profile.id, volunteer.id, reason, comment).catch(() => {
      setPersistenceNotice('Жалоба показана в приложении, но не сохранилась в Supabase. Попробуйте повторить позже.');
    });
  };

  const startSearch = (help: HelpCategory) => {
    window.clearTimeout(searchTimerRef.current);
    startSearchSound();
    setCategory(help);
    setStep('search');
    const request = createHelpRequest(profile?.id ?? 'guest-elder', help);

    searchTimerRef.current = window.setTimeout(() => {
      void (async () => {
      const elderId = profile?.id ?? 'guest-elder';
      const supabaseRequestId = await saveRequestIfPossible(help);
      let matched = canSaveToSupabase() ? await findOnlineVolunteer(elderId, help) : null;
      matched = matched ?? findRandomVolunteer(help, elderId) ?? findRandomVolunteer('any', elderId) ?? null;
      if (!matched) {
        stopSearchSound();
        setVolunteer(aiVolunteer);
        setStep('noVolunteer');
        return;
      }
      const nextSession = supabaseRequestId && canSaveToSupabase()
        ? await createSupabaseHelpSession(supabaseRequestId, elderId, matched.id)
        : createHelpSession(request, matched);
      setVolunteer(matched);
      setHelpSession(nextSession);
      setBlockedChat(false);
      setAiSafety(null);
      setMessages([]);
      stopSearchSound();
      setStep('found');
      })().catch(() => {
        stopSearchSound();
        setPersistenceNotice('Не получилось найти помощника через Supabase. Попробуйте ещё раз.');
        setVolunteer(aiVolunteer);
        setStep('noVolunteer');
      });
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
      createMessage(nextSession.id, aiVolunteer.id, 'system', 'Вы выбрали голосового помощника KÖMEK. Он поможет с простыми шагами и подскажет, когда нужен человек.'),
      createMessage(nextSession.id, aiVolunteer.id, 'text', 'Нажмите «Голос» или напишите вопрос про телефон, интернет, приложения, сообщения или безопасность. Я помогу в рамках KÖMEK.'),
    ]);
    setStep('chat');
  };

  const speakAiAnswer = (answer: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = language === 'kk' ? 'kk-KZ' : language === 'en' ? 'en-US' : 'ru-RU';
    utterance.rate = 0.92;
    utterance.onstart = () => {
      setIsAiSpeaking(true);
      setIsAiSpeechPaused(false);
    };
    utterance.onpause = () => setIsAiSpeechPaused(true);
    utterance.onresume = () => setIsAiSpeechPaused(false);
    utterance.onend = () => {
      setIsAiSpeaking(false);
      setIsAiSpeechPaused(false);
    };
    utterance.onerror = () => {
      setIsAiSpeaking(false);
      setIsAiSpeechPaused(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const toggleAiSpeechPause = () => {
    if (!('speechSynthesis' in window)) return;
    if (isAiSpeechPaused) {
      window.speechSynthesis.resume();
      setIsAiSpeechPaused(false);
      return;
    }
    window.speechSynthesis.pause();
    setIsAiSpeechPaused(true);
  };

  const answerWithAi = async (conversation: ChatMessage[], userText: string) => {
    if (!helpSession || volunteer?.id !== aiVolunteer.id || !userText.trim()) return;
    setIsAiThinking(true);
    const prompt = conversation
      .filter((item) => item.messageType !== 'system')
      .slice(-10)
      .map((item) => `${item.senderId === myChatId ? 'Пользователь' : 'KÖMEK'}: ${item.text}`)
      .join('\n');

    try {
      const { data, error } = await supabase.functions.invoke<AiFunctionResponse>('ai', {
        body: {
          prompt,
          system: komekAiSystemPrompt,
        },
      });
      const answer = data?.text?.trim();
      if (error || !answer) {
        const reason = formatAiConnectionError(data?.error || error?.message || 'пустой ответ от функции');
        setMessages([...conversation, createMessage(helpSession.id, aiVolunteer.id, 'text', reason)]);
        return;
      }
      setMessages([...conversation, createMessage(helpSession.id, aiVolunteer.id, 'text', answer)]);
      speakAiAnswer(answer);
    } catch (error) {
      const reason = formatAiConnectionError(error instanceof Error ? error.message : 'неизвестная ошибка');
      setMessages([...conversation, createMessage(helpSession.id, aiVolunteer.id, 'text', reason)]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const formatAiConnectionError = (reason: string) => {
    if (/429|credits are depleted|prepayment credits/i.test(reason)) {
      return 'ИИ-помощник сейчас не отвечает: у Gemini API закончились кредиты. Нужно обновить billing/credits в Google AI Studio, потом чат снова заработает.';
    }
    if (/GEMINI_API_KEY|не настроен|secret/i.test(reason)) {
      return 'ИИ-помощник сейчас не подключён: ключ Gemini не загружен в Supabase. Нужно выполнить npm run ai:secret.';
    }
    return `ИИ-помощник сейчас не ответил: ${reason}`;
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
      gain.gain.exponentialRampToValueAtTime(0.075 * (soundVolume / 100), context.currentTime + 0.02);
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
    playToneSequence([520, 660, 880], 0.07 * (soundVolume / 100));
  };

  const playCloseSound = () => {
    playToneSequence([880, 660, 440], 0.06 * (soundVolume / 100));
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
    const userText = draft.trim();
    voiceTranscriptRef.current = '';
    const nextMessage = createMessage(helpSession.id, myChatId, 'text', userText);
    const nextMessages = [...messages, nextMessage];
    setMessages(nextMessages);
    setDraft('');
    if (volunteer?.id === aiVolunteer.id) {
      await answerWithAi(nextMessages, userText);
      return;
    }
    if (role === 'volunteer') return;
    setIsCheckingSafety(true);
    const result = await analyzeChatSafety(nextMessages);
    setAiSafety(result);
    setIsCheckingSafety(false);

    if (result.action === 'block' && volunteer) {
      createSafetyReport(helpSession, profile?.id ?? 'guest-elder', volunteer.id, 'password', result.reason);
      persistReportIfPossible('password', result.reason);
      blockUser(profile?.id ?? 'guest-elder', volunteer.id);
      setBlockedChat(true);
      setHelpSession((current) => (current ? { ...current, status: 'reported', endedAt: new Date().toISOString() } : current));
      return;
    }
    await answerWithAi(nextMessages, userText);
  };

  const startSpeechRecognition = () => {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionClass = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setVoiceError('Браузер запишет голосовое, но не сможет сам написать текст. Лучше открыть в Chrome.');
      return;
    }
    const recognition = new SpeechRecognitionClass();
    recognition.lang = language === 'kk' ? 'kk-KZ' : language === 'en' ? 'en-US' : 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = event.results.length - 1; index >= 0; index -= 1) {
        const result = event.results[index];
        transcript = result[0].transcript.trim();
        if (transcript) break;
      }
      voiceTranscriptRef.current = transcript;
      setDraft(transcript);
    };
    recognition.onerror = () => setVoiceError('Не получилось распознать речь. Можно написать сообщение вручную.');
    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
  };

  const toggleVoiceRecording = async () => {
    if (!helpSession || blockedChat) return;
    if (isRecordingVoice) {
      speechRecognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceError('Голосовые сообщения не поддерживаются в этом браузере.');
      return;
    }

    try {
      setVoiceError('');
      setVoicePrompt(true);
      voiceChunksRef.current = [];
      voiceTranscriptRef.current = '';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current = [...voiceChunksRef.current, event.data];
      };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const spokenText = voiceTranscriptRef.current.trim();
        const messageText = spokenText || 'Голосовое сообщение';
        setMessages((items) => {
          const nextMessages = [
            ...items,
            createMessage(helpSession.id, myChatId, 'voice', messageText, { url, name: 'voice-message.webm' }),
          ];
          if (spokenText && volunteer?.id === aiVolunteer.id) void answerWithAi(nextMessages, spokenText);
          return nextMessages;
        });
        voiceTranscriptRef.current = '';
        setDraft('');
        setIsRecordingVoice(false);
        setVoicePrompt(false);
        stopVoiceTracks();
      };
      recorder.start();
      startSpeechRecognition();
      setIsRecordingVoice(true);
    } catch {
      setVoiceError('Не получилось включить микрофон. Проверьте разрешение в браузере.');
      setVoicePrompt(false);
      setIsRecordingVoice(false);
      stopVoiceTracks();
    }
  };

  const stopVoiceTracks = () => {
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
  };

  const sendSelectedFile = (type: 'photo' | 'video', file?: File) => {
    if (!helpSession || !file || blockedChat) return;
    const url = URL.createObjectURL(file);
    const fallbackText = type === 'photo' ? uiText[language].photo : uiText[language].video;
    setMessages((items) => [
      ...items,
      createMessage(helpSession.id, profile?.id ?? 'guest-elder', type, file.name || fallbackText, { url, name: file.name || fallbackText }),
    ]);
  };

  const completeHelp = () => {
    if (helpSession) setHelpSession(finishHelpSession(helpSession));
    setStep('rating');
  };


  const submitReport = (reason: ReportReason, comment = reportComment) => {
    if (!volunteer) return;
    createSafetyReport(helpSession, profile?.id ?? 'guest-elder', volunteer.id, reason, comment);
    persistReportIfPossible(reason, comment);
    setReportComment('');
    setStep('safety');
  };

  const blockCurrentVolunteer = () => {
    if (!volunteer) return;
    blockUser(profile?.id ?? 'guest-elder', volunteer.id);
    setBlockedChat(true);
    setHelpSession((current) => (current ? { ...current, status: 'reported', endedAt: new Date().toISOString() } : current));
    setStep('blocked');
  };

  const stopUnsafeHelp = () => {
    if (!volunteer) return;
    createSafetyReport(helpSession, profile?.id ?? 'guest-elder', volunteer.id, 'bad_behavior', uiText[language].unsafe);
    persistReportIfPossible('bad_behavior', uiText[language].unsafe);
    blockUser(profile?.id ?? 'guest-elder', volunteer.id);
    setBlockedChat(true);
    setHelpSession((current) => (current ? { ...current, status: 'reported', endedAt: new Date().toISOString() } : current));
    setStep('blocked');
  };

  const finishRating = async () => {
    if (profile?.role === 'volunteer' && !guestMode) setVolunteerStats(await loadVolunteerStats(profile.id));
    resetMockBackend();
    setStep(role === 'elder' ? 'elderHome' : 'volunteerHome');
  };

  const enterAsGuest = async () => {
    playOpenSound();
    const savedGuestRole = localStorage.getItem('komek-guest-role');
    try {
      setGuestMode(true);
      setProfile(null);
      setVolunteerStats(null);
      setHelpSession(undefined);
      setMessages([]);
      setMessage('');
      if (!session) {
        const { error } = await signInAsAnonymousGuest();
        if (error) throw error;
      }
      if (savedGuestRole === 'elder' || savedGuestRole === 'volunteer') {
        navigate(savedGuestRole === 'elder' ? '/elder' : '/helper');
        return;
      }
      setStep('role');
    } catch {
      setGuestMode(false);
      setMessage('Не получилось войти как гость. Проверьте, включён ли Anonymous Sign-In в Supabase Auth.');
      setStep('welcome');
    }
  };

  const registerFromGuest = () => {
    playCloseSound();
    localStorage.removeItem('komek-guest-role');
    localStorage.removeItem(savedStateKey);
    setGuestMode(false);
    setProfile(null);
    setVolunteerStats(null);
    setHelpSession(undefined);
    setMessages([]);
    setStep('welcome');
    navigate('/');
  };

  const finishWelcome = () => {
    localStorage.setItem('komek-welcome-seen', 'yes');
    setWelcomeSeen(true);
    setStep('role');
    navigate('/');
  };

  const signOutApp = async () => {
    playCloseSound();
    setGuestMode(false);
    localStorage.removeItem('komek-guest-role');
    localStorage.removeItem(savedStateKey);
    setProfile(null);
    setVolunteerStats(null);
    setHelpSession(undefined);
    setMessages([]);
    setStep('welcome');
    navigate('/');
    await supabase.auth.signOut();
  };

  if (!session && !guestMode && !routeRole && welcomeSeen && step !== 'welcome') return <AuthPanel language={language} onGuest={enterAsGuest} />;

  if (step === 'loading') return <LoadingScreen title={text.searchEyebrow} language={language} />;

  if (step === 'welcome') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <section className="welcome-screen">
          <img className="brand-symbol brand-symbol--hero" src="/app-icon.png" alt="" aria-hidden="true" />
          <p className="eyebrow">KÖMEK</p>
          <h1>Помощь рядом</h1>
          <p>KÖMEK помогает пожилым людям быстро получить поддержку с телефоном, интернетом, приложениями и сообщениями.</p>
          <div className="welcome-points">
            <span>Пожилой человек просит помощь</span>
            <span>Волонтёр отвечает в чате</span>
            <span>ИИ помогает, когда нужен быстрый совет</span>
          </div>
          <div className="welcome-actions">
            <ActionButton onClick={finishWelcome}>Начать</ActionButton>
            {!session ? <ActionButton tone="calm" onClick={enterAsGuest}>Попробовать как гость</ActionButton> : null}
          </div>
        </section>
      </PhoneShell>
    );
  }

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
        <ActionButton tone="ghost" onClick={guestMode ? registerFromGuest : signOutApp}>{guestMode ? 'Зарегистрироваться' : text.exit}</ActionButton>
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
          <strong><img className="brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />KÖMEK</strong>
          <button onClick={() => setStep('safety')}>{text.settings}</button>
        </header>
        <section className="home-panel elder-home-panel">
          {firstActionPraise ? <div className="praise-banner">{firstActionPraise}</div> : null}
          <p className="eyebrow">KÖMEK</p>
          <h1>Добрый день, {profileName}.</h1>
          <p>Чем мы можем вам помочь?</p>
          <ActionButton onClick={() => setStep('category')}>Мне нужна помощь</ActionButton>
          <ActionButton tone="ghost" onClick={startAiHelp}>Голосовой помощник KÖMEK</ActionButton>
          <p className="help-undertext">Мы найдём человека, который вам поможет.</p>
        </section>
        <section className="trust-note calm-panel">
          <img className="elder-trust-image" src="/komek-support.png" alt="Волонтёр помогает пожилому человеку с телефоном" />
          <div className="trust-note__text">
            <strong>Важное правило</strong>
            <p>Никому не сообщайте пароль, код из SMS, PIN-код и данные банковской карты.</p>
          </div>
        </section>
        <div className="secondary-actions">
          <button onClick={() => setStep('history')}>{text.history}</button>
          <button onClick={() => setStep('safety')}>{text.settings}</button>
          <button onClick={() => setStep('safetyGuide')}>Правила безопасности</button>
        </div>
      </PhoneShell>
    );
  }

  if (step === 'category') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Чем вам нужна помощь?" subtitle="Можно сразу найти помощника, если вы не знаете, что выбрать." />
        <ActionButton onClick={() => startSearch('any')}>Найти помощника</ActionButton>
        <p className="help-undertext">Мы найдём свободного проверенного волонтёра.</p>
        <div className="grid elder-help-grid">
          {elderHelpOptions.map((item) => (
            <TileButton key={item.id} icon="" label={item.label} onClick={() => startSearch(item.id)} />
          ))}
        </div>
        <section className="choice-help">
          <p>Не знаете, что выбрать?</p>
          <button onClick={() => startSearch('any')}>Помогите мне</button>
          <button onClick={startAiHelp}>Спросить голосового помощника</button>
        </section>
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
          <h1>Ищем помощника...</h1>
          <p>Ищем свободного проверенного помощника. Обычно это занимает немного времени.</p>
          {persistenceNotice ? <div className="warning">{persistenceNotice}</div> : null}
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
        <ScreenHeader title="Помощник найден" subtitle="Проверенный помощник готов вам помочь." />
        <VolunteerCard volunteer={volunteer} language={language} />
        <ActionButton onClick={() => setStep('chat')}>Начать помощь</ActionButton>
        <ActionButton tone="ghost" onClick={() => startSearch(category)}>{text.otherHelper}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'noVolunteer') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Сейчас все помощники заняты" subtitle="Мы можем продолжить поиск." />
        <div className="info-list">
          <p>Мы можем продолжить искать свободного помощника.</p>
          <p>Или вы можете поговорить с голосовым помощником KÖMEK.</p>
        </div>
        <ActionButton onClick={() => startSearch(category)}>Продолжить поиск</ActionButton>
        <ActionButton tone="ghost" onClick={startAiHelp}>Поговорить с KÖMEK</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const isAiChat = volunteer.id === aiVolunteer.id;
    const isVolunteerChat = role === 'volunteer' || profile?.role === 'volunteer';
    const showSafetyTools = !isAiChat && !isVolunteerChat;
    const risk = showSafetyTools && messages.some((item) => hasSafetyRisk(item.text));
    return (
      <PhoneShell screenKey={step} language={language}>
        <header className="chat-header">
          <button className="back-button" onClick={() => setStep(isVolunteerChat ? 'volunteerHome' : isAiChat ? 'elderHome' : 'found')}>{text.back}</button>
          <div>
            <h1>{isAiChat ? 'KÖMEK AI' : isVolunteerChat ? volunteer.name : `${volunteer.name} K.`}</h1>
            <p>{isAiChat ? 'Голосовой помощник' : isVolunteerChat ? 'Пожилой пользователь пишет вам' : `${text.verifiedHelper}. Сейчас помогает вам.`}</p>
          </div>
          {!isAiChat && !isVolunteerChat ? <button onClick={() => setStep('history')}>{text.history}</button> : null}
        </header>
        {showSafetyTools ? (
          <aside className="chat-side-alerts">
            <button className="safety-note safety-note-button" onClick={() => setStep('safetyGuide')}>Никому не сообщайте пароль, код из SMS, PIN-код и данные банковской карты. Читать правила</button>
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
          </aside>
        ) : null}
        <div className={`chat-content${showSafetyTools ? ' chat-content--with-alerts' : ''}`}>
          <div className="chat-list">
            {messages.map((item) => (
              <div key={item.id} className={item.senderId === myChatId ? 'message message--mine' : 'message'}>
                {item.messageType === 'photo' && item.fileUrl ? <img className="message-media" src={item.fileUrl} alt={item.fileName ?? text.photo} /> : null}
                {item.messageType === 'video' && item.fileUrl ? <video className="message-media" src={item.fileUrl} controls /> : null}
                {item.messageType === 'voice' && item.fileUrl ? <audio className="voice-message" src={item.fileUrl} controls /> : null}
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <aside className="chat-ad-card" aria-label="Рекламное место">
            <img src="/komek-support.png" alt="" aria-hidden="true" />
            <strong>Здесь могла быть ваша реклама</strong>
            <p>Партнёрские объявления будут показываться аккуратно и не мешать помощи.</p>
          </aside>
        </div>
        {isAiChat && isAiThinking ? <div className="voice-status voice-status--thinking">KÖMEK AI печатает ответ...</div> : null}
        {persistenceNotice ? <div className="warning">{persistenceNotice}</div> : null}
        {voicePrompt ? <div className="voice-status">Говорите. Мы вас слушаем.</div> : null}
        {isAiChat && isAiSpeaking ? (
          <div className="voice-status voice-status--ai">
            <span>{isAiSpeechPaused ? 'KÖMEK AI на паузе' : 'KÖMEK AI говорит'}</span>
            <button onClick={toggleAiSpeechPause}>{isAiSpeechPaused ? 'Продолжить' : 'Стоп'}</button>
          </div>
        ) : null}
        {voiceError ? <div className="warning">{voiceError}</div> : null}
        <div className="chat-input">
          <input
            disabled={blockedChat || isAiThinking}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void sendText();
              }
            }}
            placeholder={text.messagePlaceholder}
          />
          <button className="voice-round-button" data-recording={isRecordingVoice ? 'true' : 'false'} disabled={blockedChat || isAiThinking} onClick={toggleVoiceRecording}>{isRecordingVoice ? 'Стоп' : 'Голос'}</button>
          <button disabled={blockedChat || isAiThinking} onClick={sendText}>{isAiThinking ? 'Ждём' : text.send}</button>
        </div>
        {!isAiChat ? <div className="chat-tools">
          <button disabled={blockedChat} onClick={() => photoInputRef.current?.click()}>Прикрепить фото</button>
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
        </div> : null}
        {showSafetyTools ? <div className="safety-actions safety-zone">
          <strong>Безопасность</strong>
          <button onClick={stopUnsafeHelp}>{text.unsafe}</button>
        </div> : null}
        {showSafetyTools ? <details className="more-safety-actions">
          <summary>Другие действия</summary>
          <button onClick={() => setStep('report')}>{text.complaint}</button>
          <button onClick={blockCurrentVolunteer}>{text.block}</button>
        </details> : null}
        {!isAiChat ? <ActionButton tone="danger" onClick={isVolunteerChat ? () => setStep('volunteerHome') : completeHelp}>{isVolunteerChat ? 'Закончить разговор' : text.finishHelp}</ActionButton> : null}
      </PhoneShell>
    );
  }

  if (step === 'safetyGuide') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Правила безопасности" subtitle="Как безопасно пользоваться интернетом и KÖMEK." />
        <section className="safety-guide">
          <article>
            <h2>Никому не сообщайте</h2>
            <p>Пароль, код из SMS, PIN-код, данные банковской карты и коды из банковского приложения.</p>
          </article>
          <article>
            <h2>Помощник не должен просить деньги</h2>
            <p>Если вас просят перевести деньги или открыть банк, остановите общение.</p>
          </article>
          <article>
            <h2>Если стало тревожно</h2>
            <p>Нажмите “Мне небезопасно”. Мы остановим чат, заблокируем человека и отправим жалобу на проверку.</p>
          </article>
          <article>
            <h2>В KÖMEK</h2>
            <p>Общайтесь только в чате приложения. Не переходите по подозрительным ссылкам и не устанавливайте неизвестные приложения.</p>
          </article>
        </section>
        <ActionButton onClick={() => setStep(volunteer ? 'chat' : role === 'elder' ? 'elderHome' : 'volunteerHome')}>{text.back}</ActionButton>
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
        <ScreenHeader title="Вы уверены, что хотите завершить общение?" subtitle="Если вам небезопасно, мы сразу остановим разговор и заблокируем помощника." />
        <ActionButton tone="danger" onClick={stopUnsafeHelp}>Да, мне небезопасно</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('chat')}>Нет, всё в порядке</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'blocked') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Общение завершено" subtitle="Вы больше не будете получать сообщения от этого человека." />
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
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={star <= rating ? 'active' : ''}
              aria-label={`Оценка ${star} из 5`}
            >
              {star <= rating ? '★' : '☆'}
            </button>
          ))}
        </div>
        <ActionButton onClick={finishRating}>{text.done}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>{text.complaint}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'volunteerHome') {
    const helped = volunteerStats?.people_helped ?? 0;
    const ratingValue = volunteerStats?.rating ?? 0;

    return (
      <PhoneShell screenKey={step} language={language}>
        <section className="volunteer-dashboard">
          <aside className="volunteer-sidebar">
            <strong><img className="brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />KÖMEK</strong>
            <nav>
              <button className="active">Главная</button>
              <button onClick={() => setStep('incoming')}>Обращения</button>
              <button onClick={() => setStep('history')}>Чаты</button>
              <button onClick={() => setStep('history')}>История</button>
              <button onClick={() => setStep('volunteerProfile')}>Достижения</button>
              <button onClick={() => setStep('admin')}>Профиль</button>
              <button onClick={() => setStep('safety')}>Настройки</button>
            </nav>
            <div className="volunteer-online">
              <span>Вы онлайн</span>
              <button>Стать недоступным</button>
            </div>
          </aside>
          <main className="volunteer-workspace">
            <header className="volunteer-topline">
              <div>
                <p className="eyebrow">Панель волонтёра</p>
                <h1>{profileName}</h1>
              </div>
              <button onClick={() => setStep('admin')}>Профиль</button>
            </header>
            {firstActionPraise ? <div className="praise-banner">{firstActionPraise}</div> : null}
            <section className="volunteer-requests">
              <div>
                <h2>Обращения</h2>
                <p>Здесь появятся настоящие просьбы от пожилых пользователей.</p>
              </div>
              <button onClick={() => setStep('incoming')}>Открыть обращения</button>
            </section>
            <section className="volunteer-chat-preview">
              <div>
                <h2>Чаты</h2>
                <p>Пока активных чатов нет. Когда вы примете реальное обращение, переписка откроется здесь.</p>
              </div>
            </section>
          </main>
          <aside className="volunteer-profile-panel">
            <img className="volunteer-panel-image" src="/komek-support.png" alt="" aria-hidden="true" />
            <p className="eyebrow">Репутация</p>
            <h2>{profileName}</h2>
            <p>Проверенный помощник</p>
            <div className="volunteer-reputation">
              <b><span>{helped}</span>успешных помощей</b>
              <b><span>{ratingValue.toFixed(1)}</span>рейтинг</b>
              <b><span>{helped > 0 ? 'Высокая' : 'Новая'}</span>надёжность</b>
            </div>
            {helped === 0 ? <p className="empty-state">{text.noActivity}</p> : null}
          </aside>
        </section>
        <BottomNav
          items={['Главная', 'Обращения', 'Чаты', 'Профиль']}
          activeIndex={0}
          onFirst={() => setStep('volunteerHome')}
          onSecond={() => setStep('incoming')}
          onThird={() => setStep('history')}
          onFourth={() => setStep('admin')}
        />
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="Нет запросов" subtitle="Когда появится новое обращение, оно будет здесь." />
        <div className="info-list">
          <p>Сейчас новых обращений нет.</p>
          <p>Вы онлайн и готовы помогать.</p>
        </div>
        <ActionButton tone="ghost" onClick={() => setStep('volunteerHome')}>{text.notNow}</ActionButton>
        <BottomNav
          items={['Главная', 'Обращения', 'Чаты', 'Профиль']}
          activeIndex={1}
          onFirst={() => setStep('volunteerHome')}
          onSecond={() => setStep('incoming')}
          onThird={() => setStep('history')}
          onFourth={() => setStep('admin')}
        />
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
        soundVolume={soundVolume}
        language={language}
        onThemeChange={setThemeMode}
        onFontChange={setFontMode}
        onSoundChange={setSoundEnabled}
        onSoundVolumeChange={setSoundVolume}
        onLanguageChange={setLanguage}
        onSignOut={guestMode ? registerFromGuest : signOutApp}
        signOutLabel={guestMode ? 'Зарегистрироваться' : uiText[language].signOut}
        onBack={() => setStep(role === 'elder' ? 'elderHome' : 'volunteerHome')}
      />
    );
  }

  return null;
}

function LoadingScreen({ title, language }: { title: string; language: Language }) {
  return (
    <PhoneShell screenKey="loading" language={language}>
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

function BottomNav({
  items,
  activeIndex,
  onFirst,
  onSecond,
  onThird,
  onFourth,
}: {
  items: string[];
  activeIndex: number;
  onFirst: () => void;
  onSecond: () => void;
  onThird: () => void;
  onFourth: () => void;
}) {
  const icons = ['home', 'requests', 'chats', 'profile'];
  return (
    <nav className="bottom-nav">
      {items.map((item, index) => {
        const actions = [onFirst, onSecond, onThird, onFourth];
        return (
          <button
            key={item}
            className={`bottom-nav__item bottom-nav__item--${icons[index]}${index === activeIndex ? ' active' : ''}`}
            onClick={actions[index]}
          >
            <span aria-hidden="true" />
            <b>{item}</b>
          </button>
        );
      })}
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
  soundVolume,
  language,
  onThemeChange,
  onFontChange,
  onSoundChange,
  onSoundVolumeChange,
  onLanguageChange,
  onSignOut,
  signOutLabel,
  onBack,
}: {
  step: Step;
  profile: ProfileRow | null;
  stats: VolunteerProfileRow | null;
  achievements: Achievement[];
  themeMode: ThemeMode;
  fontMode: FontMode;
  soundEnabled: boolean;
  soundVolume: number;
  language: Language;
  onThemeChange: (theme: ThemeMode) => void;
  onFontChange: (font: FontMode) => void;
  onSoundChange: (enabled: boolean) => void;
  onSoundVolumeChange: (volume: number) => void;
  onLanguageChange: (language: Language) => void;
  onSignOut: () => void;
  signOutLabel: string;
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
            <div className="volume-control">
              <div className="volume-control__top">
                <button onClick={() => {
                  const nextVolume = Math.max(0, soundVolume - 10);
                  onSoundVolumeChange(nextVolume);
                  onSoundChange(nextVolume > 0);
                }}>−</button>
                <span>{soundEnabled ? `${soundVolume}%` : uiText[language].soundOff}</span>
                <button onClick={() => {
                  const nextVolume = Math.min(100, soundVolume + 10);
                  onSoundVolumeChange(nextVolume);
                  onSoundChange(nextVolume > 0);
                }}>+</button>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundEnabled ? soundVolume : 0}
                style={{
                  background: `linear-gradient(90deg, var(--primary) 0%, var(--primary) ${soundEnabled ? soundVolume : 0}%, var(--line) ${soundEnabled ? soundVolume : 0}%, var(--line) 100%)`,
                }}
                onChange={(event) => {
                  const nextVolume = Number(event.target.value);
                  onSoundVolumeChange(nextVolume);
                  onSoundChange(nextVolume > 0);
                }}
              />
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
      <ActionButton tone="ghost" onClick={onSignOut}>{signOutLabel}</ActionButton>
    </PhoneShell>
  );
}


