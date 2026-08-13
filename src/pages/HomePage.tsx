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
import type { Language } from '../lib/i18n';
import { fixMojibake, languageNames, uiText } from '../lib/i18n';
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
type FontMode = 'normal' | 'large';
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
      playEnterSound();
      setProfile({
        id: elders[0].id,
        auth_user_id: 'guest',
        role: nextRole,
        name: 'Р“РѕСЃС‚СЊ',
        age: null,
        city: null,
        avatar_url: null,
      });
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
      return;
    }
    if (!session) return;

    try {
      const fallbackName = nextRole === 'elder' ? 'Р’Р°Р»РµРЅС‚РёРЅР°' : 'РџРѕРјРѕС‰РЅРёРє';
      const savedProfile = await createMyProfile(nextRole, session.user.user_metadata.full_name ?? fallbackName);
      playEnterSound();
      setProfile(savedProfile);
      if (nextRole === 'volunteer') setVolunteerStats(await loadVolunteerStats(savedProfile.id));
      setStep(nextRole === 'elder' ? 'elderHome' : 'volunteerHome');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂРѕС„РёР»СЊ.');
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

  const playEnterSound = () => {
    if (!soundEnabled) return;
    const audioWindow = window as BrowserAudioWindow;
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const noiseLength = Math.floor(context.sampleRate * 0.42);
    const buffer = context.createBuffer(1, noiseLength, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < noiseLength; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / noiseLength);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2200, context.currentTime + 0.28);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    noise.start();
    noise.stop(context.currentTime + 0.44);
    window.setTimeout(() => void context.close(), 520);
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
      voice: 'Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ, 12 СЃРµРєСѓРЅРґ',
      photo: 'Р¤РѕС‚Рѕ РѕС‚РїСЂР°РІР»РµРЅРѕ',
      video: 'РљРѕСЂРѕС‚РєРѕРµ РІРёРґРµРѕ РѕС‚РїСЂР°РІР»РµРЅРѕ',
    };
    setMessages((items) => [...items, createMessage(helpSession.id, profile?.id ?? elders[0].id, type, textByType[type])]);
  };

  const sendSelectedFile = (type: 'photo' | 'video', file?: File) => {
    if (!helpSession || !file || blockedChat) return;
    const url = URL.createObjectURL(file);
    const fallbackText = type === 'photo' ? 'Р¤РѕС‚Рѕ' : 'Р’РёРґРµРѕ';
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
    submitReport('bad_behavior', 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅР°Р¶Р°Р» РєРЅРѕРїРєСѓ "РњРЅРµ РЅРµР±РµР·РѕРїР°СЃРЅРѕ".');
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

  if (!session && !guestMode) return <AuthPanel language={language} onGuest={enterAsGuest} />;

  if (step === 'loading') return <LoadingScreen title="Р—Р°РіСЂСѓР¶Р°РµРј" />;

  if (step === 'role') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title={text.roleTitle} subtitle={text.roleSubtitle} />
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
        <ScreenHeader title="РќСѓР¶РЅРѕ РїРѕРґРєР»СЋС‡РёС‚СЊ Р±Р°Р·Сѓ" subtitle="Р’С…РѕРґ СЂР°Р±РѕС‚Р°РµС‚, РЅРѕ С‚Р°Р±Р»РёС†С‹ РїСЂРёР»РѕР¶РµРЅРёСЏ РµС‰Рµ РЅРµ Р·Р°РїРёСЃР°РЅС‹ РІ Supabase." />
        <div className="info-list">
          <p>Р—Р°РїСѓСЃС‚РёС‚Рµ РјРёРіСЂР°С†РёРё Supabase. РџРѕСЃР»Рµ СЌС‚РѕРіРѕ РїСЂРѕС„РёР»СЊ Рё СЃС‚Р°С‚РёСЃС‚РёРєР° Р±СѓРґСѓС‚ СЃРѕС…СЂР°РЅСЏС‚СЊСЃСЏ.</p>
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
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEK</strong>
          <button onClick={() => setStep('safety')}>{text.settings}</button>
        </header>
        <section className="home-panel">
          <p className="eyebrow">{text.roleTitle}, {fixMojibake(profile?.name ?? 'Р’Р°Р»РµРЅС‚РёРЅР°')}</p>
          <h1>{text.needHelp}</h1>
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
        <ScreenHeader title={text.categoryTitle} subtitle={text.intro} />
        <ActionButton onClick={() => startSearch('any')}>{text.anyHelper}</ActionButton>
        <div className="grid">
          {helpCategories.filter((item) => item.id !== 'any').map((item) => (
            <TileButton key={item.id} icon="" label={fixMojibake(item.label)} onClick={() => startSearch(item.id)} />
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
        <ScreenHeader title={text.foundTitle} subtitle={`${text.theme}: ${fixMojibake(helpCategories.find((item) => item.id === category)?.label ?? '')}`} />
        <VolunteerCard volunteer={volunteer} language={language} />
        <ActionButton onClick={() => setStep('chat')}>{text.startChat}</ActionButton>
        <ActionButton tone="ghost" onClick={() => startSearch(category)}>{text.otherHelper}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'chat' && volunteer) {
    const risk = messages.some((item) => hasSafetyRisk(item.text));
    return (
      <PhoneShell screenKey={step} language={language}>
        <header className="chat-header">
          <div>
            <h1>{fixMojibake(volunteer.name)} K.</h1>
            <p>{text.verifiedHelper}</p>
          </div>
          <button onClick={() => setStep('history')}>{text.history}</button>
        </header>
        <div className="safety-note">РќРёРєРѕРјСѓ РЅРµ СЃРѕРѕР±С‰Р°Р№С‚Рµ РїР°СЂРѕР»Рё, SMS-РєРѕРґС‹ Рё РґР°РЅРЅС‹Рµ Р±Р°РЅРєРѕРІСЃРєРѕР№ РєР°СЂС‚С‹. РќР°СЃС‚РѕСЏС‰РёР№ РїРѕРјРѕС‰РЅРёРє РЅРёРєРѕРіРґР° РЅРµ РґРѕР»Р¶РµРЅ РёС… РїСЂРѕСЃРёС‚СЊ.</div>
        {isCheckingSafety ? <div className="ai-safety ai-safety--checking">РР РїСЂРѕРІРµСЂСЏРµС‚ РґРёР°Р»РѕРі РЅР° РјРѕС€РµРЅРЅРёС‡РµСЃС‚РІРѕ...</div> : null}
        {aiSafety && aiSafety.risk !== 'safe' ? (
          <div className={`ai-safety ai-safety--${aiSafety.risk}`}>
            <strong>{aiSafety.action === 'block' ? 'Р”РёР°Р»РѕРі РѕСЃС‚Р°РЅРѕРІР»РµРЅ' : 'РќСѓР¶РЅР° РѕСЃС‚РѕСЂРѕР¶РЅРѕСЃС‚СЊ'}</strong>
            <p>{aiSafety.reason}</p>
          </div>
        ) : null}
        {risk ? (
          <div className="warning">
            <strong>Р‘СѓРґСЊС‚Рµ РѕСЃС‚РѕСЂРѕР¶РЅС‹</strong>
            <p>РќРµ СЃРѕРѕР±С‰Р°Р№С‚Рµ РєРѕРґС‹, РїР°СЂРѕР»Рё РёР»Рё Р±Р°РЅРєРѕРІСЃРєРёРµ РґР°РЅРЅС‹Рµ.</p>
            <button onClick={() => submitReport('password', 'Р’ С‡Р°С‚Рµ РѕР±РЅР°СЂСѓР¶РµРЅ РїРѕС‚РµРЅС†РёР°Р»СЊРЅРѕ РѕРїР°СЃРЅС‹Р№ Р·Р°РїСЂРѕСЃ.')}>{text.suspicious}</button>
          </div>
        ) : null}
        {blockedChat ? <div className="warning">Р Р°Р·РіРѕРІРѕСЂ РѕСЃС‚Р°РЅРѕРІР»РµРЅ. Р­С‚РѕС‚ РїРѕРјРѕС‰РЅРёРє Р±РѕР»СЊС€Рµ РЅРµ СЃРјРѕР¶РµС‚ РЅР°РїРёСЃР°С‚СЊ РІР°Рј РІ СЌС‚РѕРј С‡Р°С‚Рµ.</div> : null}
        <div className="chat-list">
          {messages.map((item) => (
            <div key={item.id} className={item.senderId === profile?.id ? 'message message--mine' : 'message'}>
              {item.messageType === 'photo' && item.fileUrl ? <img className="message-media" src={item.fileUrl} alt={item.fileName ?? 'Р¤РѕС‚Рѕ'} /> : null}
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
        <ScreenHeader title="Р’Р°Рј РЅРµР±РµР·РѕРїР°СЃРЅРѕ?" subtitle="РњРѕР¶РЅРѕ СЃСЂР°Р·Сѓ РїСЂРµРєСЂР°С‚РёС‚СЊ РїРѕРјРѕС‰СЊ Рё Р·Р°Р±Р»РѕРєРёСЂРѕРІР°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ." />
        <ActionButton tone="danger" onClick={stopUnsafeHelp}>{text.yesStop}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('chat')}>{text.cancel}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'blocked') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ Р·Р°Р±Р»РѕРєРёСЂРѕРІР°РЅ" subtitle="Р Р°Р·РіРѕРІРѕСЂ РѕСЃС‚Р°РЅРѕРІР»РµРЅ. Р–Р°Р»РѕР±Р° РѕС‚РїСЂР°РІР»РµРЅР° РЅР° РїСЂРѕРІРµСЂРєСѓ." />
        <div className="info-list">
          <p>Р’С‹ РјРѕР¶РµС‚Рµ РІРµСЂРЅСѓС‚СЊСЃСЏ РЅР° РіР»Р°РІРЅС‹Р№ СЌРєСЂР°РЅ Рё РЅР°Р№С‚Рё РґСЂСѓРіРѕРіРѕ РїРѕРјРѕС‰РЅРёРєР°.</p>
          <p>РџР°СЂРѕР»Рё, SMS-РєРѕРґС‹ Рё Р±Р°РЅРєРѕРІСЃРєРёРµ РґР°РЅРЅС‹Рµ РЅРёРєРѕРјСѓ СЃРѕРѕР±С‰Р°С‚СЊ РЅРµР»СЊР·СЏ.</p>
        </div>
        <ActionButton onClick={() => setStep('elderHome')}>{text.home}</ActionButton>
      </PhoneShell>
    );
  }

  if (step === 'rating') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="РЎРїР°СЃРёР±Рѕ" subtitle="РћС†РµРЅРёС‚Рµ СЂР°Р±РѕС‚Сѓ РїРѕРјРѕС‰РЅРёРєР°." />
        <div className="rating-scale">
          {[1, 2, 3, 4, 5].map((star) => <button key={star} onClick={() => setRating(star)} className={star <= rating ? 'active' : ''}>{star}</button>)}
        </div>
        <ActionButton onClick={finishRating}>{text.done}</ActionButton>
        <ActionButton tone="ghost" onClick={() => setStep('safety')}>{text.complaint}</ActionButton>
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
      <PhoneShell screenKey={step} language={language}>
        <header className="top-bar">
          <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEK</strong>
          <button onClick={() => setStep('admin')}>{text.profile}</button>
        </header>
        <ScreenHeader title={`Р—РґСЂР°РІСЃС‚РІСѓР№С‚Рµ, ${profile?.name ?? 'РђР»РёСЏ'}`} subtitle="РЎС‚Р°С‚СѓСЃ РїРѕРјРѕС‰Рё" />
        <section className="status-card">
          <div>
            <p className="eyebrow">Р“РѕС‚РѕРІРЅРѕСЃС‚СЊ</p>
            <h2>Р“РѕС‚РѕРІР° РїРѕРјРѕРіР°С‚СЊ</h2>
            <p>Р’С‹ Р±СѓРґРµС‚Рµ РїРѕР»СѓС‡Р°С‚СЊ Р·Р°РїСЂРѕСЃС‹, РєРѕРіРґР° РєРѕРјСѓ-С‚Рѕ РїРѕРЅР°РґРѕР±РёС‚СЃСЏ РїРѕРјРѕС‰СЊ.</p>
          </div>
          <span>ON</span>
        </section>
        <div className="stats">
          <b><span>{helped}</span>РїРѕРјРѕС‰Рё</b>
          <b><span>{volunteerStats?.rating ?? demoStats?.rating ?? 4.9}</span>РѕС†РµРЅРєР°</b>
          <b><span>{xp}</span>XP</b>
        </div>
        <section className="level-card">
          <p>LEVEL {String(level).padStart(2, '0')}</p>
          <h2>{volunteerStats?.title ?? demoStats?.title ?? 'РќР°РґРµР¶РЅС‹Р№ РїРѕРјРѕС‰РЅРёРє'}</h2>
          <div className="progress"><span style={{ width: `${Math.min(100, (xp % 1000) / 10)}%` }} /></div>
          <small>{xp} / 1000 XP</small>
        </section>
        <ActionButton onClick={() => setStep('incoming')}>{text.showRequest}</ActionButton>
        <BottomNav items={[text.help, text.progress, text.profile]} onSecond={() => setStep('volunteerProfile')} onThird={() => setStep('admin')} />
      </PhoneShell>
    );
  }

  if (step === 'incoming') {
    return (
      <PhoneShell screenKey={step} language={language}>
        <ScreenHeader title="РќРѕРІС‹Р№ Р·Р°РїСЂРѕСЃ" subtitle="РџРѕР»СЊР·РѕРІР°С‚РµР»СЋ РЅСѓР¶РЅР° РїРѕРјРѕС‰СЊ РІ С‡Р°С‚Рµ." />
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
  const sessionDate = session ? new Date(session.startedAt).toLocaleDateString('ru-RU') : 'РЎРµРіРѕРґРЅСЏ';
  return (
    <PhoneShell screenKey="history">
      <ScreenHeader title="РњРѕРё РїРѕРјРѕС‰Рё" subtitle="РўРµРєСѓС‰РёРµ Рё Р·Р°РІРµСЂС€РµРЅРЅС‹Рµ РѕР±СЂР°С‰РµРЅРёСЏ." />
      <div className="history-list">
        {session && volunteer ? (
          <button className="history-item" onClick={onChat}>
            <span>{session.status === 'completed' ? 'Р—Р°РІРµСЂС€РµРЅРѕ' : 'РЎРµР№С‡Р°СЃ'}</span>
            <strong>{volunteer.name} Рљ.</strong>
            <p>{sessionDate} В· {messages.length} СЃРѕРѕР±С‰РµРЅРёР№</p>
          </button>
        ) : (
          <div className="history-item">
            <span>РџРѕРєР° РїСѓСЃС‚Рѕ</span>
            <strong>Р—РґРµСЃСЊ РїРѕСЏРІСЏС‚СЃСЏ РІР°С€Рё РѕР±СЂР°С‰РµРЅРёСЏ</strong>
            <p>РџРѕСЃР»Рµ РїРѕРёСЃРєР° РїРѕРјРѕС‰РЅРёРєР° С‡Р°С‚ РјРѕР¶РЅРѕ Р±СѓРґРµС‚ РѕС‚РєСЂС‹С‚СЊ СЃРЅРѕРІР°.</p>
          </div>
        )}
        <div className="history-item">
          <span>РџСЂРёРјРµСЂ</span>
          <strong>РџРѕРјРѕС‰СЊ СЃ С‚РµР»РµС„РѕРЅРѕРј</strong>
          <p>РќРµРґР°РІРЅРёР№ С‡Р°С‚ В· Р·Р°РІРµСЂС€РµРЅРѕ</p>
        </div>
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
    { id: 'trolling', label: 'РћСЃРєРѕСЂР±Р»РµРЅРёСЏ РёР»Рё С‚СЂРѕР»Р»РёРЅРі' },
    { id: 'money', label: 'РџСЂРѕСЃРёС‚ РґРµРЅСЊРіРё' },
    { id: 'password', label: 'РџСЂРѕСЃРёС‚ РїР°СЂРѕР»СЊ РёР»Рё SMS-РєРѕРґ' },
    { id: 'bank_data', label: 'РџСЂРѕСЃРёС‚ Р±Р°РЅРєРѕРІСЃРєРёРµ РґР°РЅРЅС‹Рµ' },
    { id: 'suspicious_app', label: 'РџСЂРѕСЃРёС‚ СѓСЃС‚Р°РЅРѕРІРёС‚СЊ РїРѕРґРѕР·СЂРёС‚РµР»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ' },
    { id: 'suspicious_content', label: 'РћС‚РїСЂР°РІР»СЏРµС‚ РїРѕРґРѕР·СЂРёС‚РµР»СЊРЅС‹Р№ РєРѕРЅС‚РµРЅС‚' },
    { id: 'bad_behavior', label: 'РќРµРїСЂРёРµРјР»РµРјРѕРµ РїРѕРІРµРґРµРЅРёРµ' },
    { id: 'other', label: 'Р”СЂСѓРіРѕРµ' },
  ];

  return (
    <PhoneShell screenKey="report">
      <ScreenHeader title="РџРѕР¶Р°Р»РѕРІР°С‚СЊСЃСЏ" subtitle="Р’С‹Р±РµСЂРёС‚Рµ РїСЂРёС‡РёРЅСѓ Рё РґРѕР±Р°РІСЊС‚Рµ РєРѕСЂРѕС‚РєРёР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№." />
      <div className="report-options">
        {reasons.map((item) => (
          <button key={item.id} className={item.id === reason ? 'active' : ''} onClick={() => onReasonChange(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <textarea className="report-comment" value={comment} onChange={(event) => onCommentChange(event.target.value)} placeholder="РљРѕСЂРѕС‚РєРёР№ РєРѕРјРјРµРЅС‚Р°СЂРёР№..." />
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
  const title = step === 'admin' ? 'РџСЂРѕС„РёР»СЊ' : step === 'volunteerProfile' ? 'РџСЂРѕРіСЂРµСЃСЃ' : 'Р‘РµР·РѕРїР°СЃРЅРѕСЃС‚СЊ';
  const reports = getSafetyReports();
  return (
    <PhoneShell screenKey={step} language={language}>
      <ScreenHeader title={title} subtitle={profile ? `${profile.name} В· ${profile.city ?? 'РіРѕСЂРѕРґ РЅРµ СѓРєР°Р·Р°РЅ'}` : undefined} />
      <div className="info-list">
        {step === 'safety' ? <p>РќРёРєРѕРјСѓ РЅРµ СЃРѕРѕР±С‰Р°Р№С‚Рµ РїР°СЂРѕР»СЊ, SMS-РєРѕРґ, PIN РёР»Рё Р±Р°РЅРєРѕРІСЃРєРёРµ РґР°РЅРЅС‹Рµ.</p> : null}
        {step === 'safety' ? <p>Р•СЃР»Рё СЂР°Р·РіРѕРІРѕСЂ РІС‹Р·С‹РІР°РµС‚ СЃРѕРјРЅРµРЅРёСЏ, Р·Р°РІРµСЂС€РёС‚Рµ РїРѕРјРѕС‰СЊ Рё РѕС‚РїСЂР°РІСЊС‚Рµ Р¶Р°Р»РѕР±Сѓ.</p> : null}
        {step === 'admin' ? <p>Р РѕР»СЊ СЃРѕС…СЂР°РЅРµРЅР° РІ Supabase: {profile?.role === 'elder' ? 'РїРѕР»СѓС‡Р°СЋ РїРѕРјРѕС‰СЊ' : 'РїРѕРјРѕРіР°СЋ'}.</p> : null}
        {step === 'admin' ? <p>РњРѕРґРµСЂР°С†РёСЏ: {reports.length} Р¶Р°Р»РѕР± РІ РѕС‡РµСЂРµРґРё, {reports.filter((item) => item.severity === 'high').length} РІС‹СЃРѕРєРѕРіРѕ СЂРёСЃРєР°.</p> : null}
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
            <strong>{uiText[language].sound}</strong>
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
        {step === 'volunteerProfile' && stats ? <p>{stats.rating} СЂРµР№С‚РёРЅРі В· {stats.xp} XP В· {stats.people_helped} РїРѕРјРѕС‰Рё В· {stats.thanks_received} Р±Р»Р°РіРѕРґР°СЂРЅРѕСЃС‚РµР№</p> : null}
        {step === 'volunteerProfile' ? achievements.map((item) => <p key={item.id}><b>{item.name}</b><br />{item.description}</p>) : null}
      </div>
      <ActionButton onClick={onBack}>{uiText[language].back}</ActionButton>
      <ActionButton tone="ghost" onClick={onSignOut}>{uiText[language].signOut}</ActionButton>
    </PhoneShell>
  );
}
