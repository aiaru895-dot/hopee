import type { ComponentType, SVGProps } from 'react';
import {
  ChatBubbleOvalLeftEllipsisIcon,
  ClockIcon,
  HomeIcon,
  InboxIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/24/solid';
import { useLocation } from 'wouter';
import type { Role } from '../lib/ryadomTypes';

export type NavigationTab = 'home' | 'chat' | 'history' | 'rules' | 'profile' | 'requests';

type NavItem = {
  id: NavigationTab;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const elderItems: NavItem[] = [
  { id: 'home', label: 'Главная', href: '/elder', icon: HomeIcon },
  { id: 'chat', label: 'Чат', href: '/elder/chat', icon: ChatBubbleOvalLeftEllipsisIcon },
  { id: 'history', label: 'История', href: '/elder/history', icon: ClockIcon },
  { id: 'rules', label: 'Правила', href: '/elder/rules', icon: ShieldCheckIcon },
  { id: 'profile', label: 'Профиль', href: '/elder/profile', icon: UserCircleIcon },
];

const volunteerItems: NavItem[] = [
  { id: 'home', label: 'Главная', href: '/helper', icon: HomeIcon },
  { id: 'requests', label: 'Обращения', href: '/helper/requests', icon: InboxIcon },
  { id: 'chat', label: 'Чаты', href: '/helper/chats', icon: ChatBubbleOvalLeftEllipsisIcon },
  { id: 'profile', label: 'Профиль', href: '/helper/profile', icon: UserCircleIcon },
];

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function MobileBottomNav({ role, onSelect }: { role: Role; onSelect: (tab: NavigationTab) => void }) {
  const [location, navigate] = useLocation();
  const items = role === 'elder' ? elderItems : volunteerItems;
  const currentPath = normalizePath(location);

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.href;
        return (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav__item${isActive ? ' active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              if (isActive) return;
              onSelect(item.id);
              navigate(item.href);
            }}
          >
            <Icon className="bottom-nav__icon" aria-hidden="true" />
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
