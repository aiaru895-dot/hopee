import type { Achievement, HelpCategory, User, Volunteer } from './ryadomTypes';

export const helpCategories: Array<{ id: HelpCategory; label: string; icon: string }> = [
  { id: 'phone', label: 'Телефон', icon: '📱' },
  { id: 'messengers', label: 'Мессенджеры', icon: '💬' },
  { id: 'internet', label: 'Интернет', icon: '🌐' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
  { id: 'apps', label: 'Приложения', icon: '📲' },
  { id: 'payments', label: 'Онлайн-платежи', icon: '💳' },
  { id: 'talk', label: 'Просто поговорить', icon: '💬' },
  { id: 'any', label: 'Найдите любого помощника', icon: '🎲' },
];

export const elders: User[] = [
  user('elder-1', 'elder', 'Валентина', 72, 'Алматы', 'В'),
  user('elder-2', 'elder', 'Николай', 68, 'Астана', 'Н'),
  user('elder-3', 'elder', 'Галина', 75, 'Шымкент', 'Г'),
];

export const achievements: Achievement[] = [
  { id: 'tech', icon: '📱', name: 'Технарь', description: 'Помог 10 людям с телефоном.', requirement: 10 },
  { id: 'friend', icon: '💬', name: 'Друг на связи', description: 'Провел 10 добрых разговоров.', requirement: 10 },
  { id: 'care', icon: '🧓', name: 'Заботливый помощник', description: 'Помог 50 пожилым людям.', requirement: 50 },
  { id: 'safe', icon: '🛡️', name: 'Безопасный помощник', description: '100 звонков без жалоб.', requirement: 100 },
];

export const volunteers: Volunteer[] = [
  volunteer('vol-1', 'Алия', 24, 'Алматы', 'А', ['phone', 'messengers', 'settings'], 4.9, 870, 8, 24),
  volunteer('vol-2', 'Данияр', 21, 'Астана', 'Д', ['internet', 'apps', 'talk'], 4.8, 420, 5, 12),
  volunteer('vol-3', 'Мария', 27, 'Караганда', 'М', ['phone', 'payments', 'messengers'], 5, 1160, 11, 51),
  volunteer('vol-4', 'Максим', 22, 'Павлодар', 'М', ['settings', 'apps', 'internet'], 4.7, 260, 3, 7),
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
      ratingCount: helped + 3,
      xp,
      level,
      title: level > 7 ? 'Надежный помощник' : 'Добрый помощник',
      successfulCalls: helped,
      peopleHelped: helped,
      thanksReceived: Math.max(2, helped - 3),
      online: true,
      busy: false,
    },
  };
}
