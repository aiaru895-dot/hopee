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

export const elders: User[] = [];

export const achievements: Achievement[] = [
  { id: 'tech', icon: '', name: 'Помог 10 людям', description: 'Получено', requirement: 10 },
  { id: 'friend', icon: '', name: '10 успешных разговоров', description: 'Получено', requirement: 10 },
  { id: 'care', icon: '', name: '50 успешных помощей', description: 'В процессе', requirement: 50 },
  { id: 'safe', icon: '', name: '100 безопасных сессий', description: 'В процессе', requirement: 100 },
];

export const volunteers: Volunteer[] = [];

export const starterMessages: string[] = [];

