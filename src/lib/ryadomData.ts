import type { Achievement, HelpCategory, User, Volunteer } from './ryadomTypes';

export const helpCategories: Array<{ id: HelpCategory; label: string; icon: string }> = [
  { id: 'phone', label: 'Телефон', icon: '' },
  { id: 'messengers', label: 'Сообщения', icon: '' },
  { id: 'internet', label: 'Интернет', icon: '' },
  { id: 'settings', label: 'Настройки', icon: '' },
  { id: 'apps', label: 'Приложения', icon: '' },
  { id: 'payments', label: 'Онлайн-платежи', icon: '' },
  { id: 'talk', label: 'Разговор', icon: '' },
  { id: 'any', label: 'Любой помощник', icon: '' },
];

export const elders: User[] = [
  user('elder-1', 'elder', 'Валентина', 72, 'Алматы', 'В'),
  user('elder-2', 'elder', 'Николай', 68, 'Астана', 'Н'),
  user('elder-3', 'elder', 'Галина', 75, 'Шымкент', 'Г'),
];

export const achievements: Achievement[] = [
  { id: 'tech', icon: '', name: 'Помог 10 людям', description: 'Получено', requirement: 10 },
  { id: 'friend', icon: '', name: '10 успешных разговоров', description: 'Получено', requirement: 10 },
  { id: 'care', icon: '', name: '50 успешных помощей', description: 'В процессе', requirement: 50 },
  { id: 'safe', icon: '', name: '100 безопасных сессий', description: 'В процессе', requirement: 100 },
];

export const volunteers: Volunteer[] = [
  volunteer('vol-1', 'Алия', 24, 'Алматы', 'А', ['phone', 'messengers', 'settings'], 4.9, 870, 4, 43),
  volunteer('vol-2', 'Данияр', 21, 'Астана', 'Д', ['internet', 'apps', 'talk'], 4.8, 420, 3, 18),
  volunteer('vol-3', 'Мария', 27, 'Караганда', 'М', ['phone', 'payments', 'messengers'], 5, 1160, 6, 51),
  volunteer('vol-4', 'Максим', 22, 'Павлодар', 'М', ['settings', 'apps', 'internet'], 4.7, 260, 2, 12),
];

export const starterMessages = [
  'Здравствуйте. Я на связи и помогу спокойно.',
  'Не сообщайте пароли, SMS-коды, PIN или банковские данные.',
];

function user(id: string, role: User['role'], name: string, age: number, city: string, avatar: string): User {
  return { id, role, name, age, city, avatar, createdAt: new Date().toISOString(), status: 'offline' };
}

function volunteer(
  id: string,
  name: string,
  age: number,
  city: string,
  avatar: string,
  skills: HelpCategory[],
  rating: number,
  xp: number,
  level: number,
  helped: number,
): Volunteer {
  return {
    ...user(id, 'volunteer', name, age, city, avatar),
    status: 'online',
    profile: {
      userId: id,
      verified: true,
      skills,
      rating,
      ratingCount: helped + 5,
      xp,
      level,
      title: level >= 4 ? 'Надежный помощник' : 'Добрый помощник',
      successfulHelpCount: helped,
      peopleHelped: helped,
      thanksReceived: Math.max(4, helped - 12),
      trustScore: 92 + Math.min(level, 7),
      riskScore: Math.max(1, 8 - level),
      trustLevel: level >= 5 ? 'TRUSTED' : level >= 3 ? 'VERIFIED' : 'BASIC',
      reportsCount: 0,
      seriousReportsCount: 0,
      blockedCount: 0,
      online: true,
      busy: false,
    },
  };
}
