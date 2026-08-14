import type { ReactNode } from 'react';
import { uiText, type Language } from '../lib/i18n';

type ActionButtonProps = {
  children: ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'calm' | 'danger' | 'ghost';
  disabled?: boolean;
};

export function PhoneShell({ children, screenKey = 'static', language = 'ru' }: { children: ReactNode; screenKey?: string; language?: Language }) {
  return (
    <main className="app-shell">
      <section className="phone-shell">
        <div key={screenKey} className="screen-transition">
          {children}
        </div>
        <div className="ad-slot">
          <span>{uiText[language].ad}</span>
        </div>
      </section>
    </main>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="screen-header">
      <strong><img className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" />KOMEQ</strong>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

export function ActionButton({ children, onClick, tone = 'primary', disabled }: ActionButtonProps) {
  return (
    <button className={`action-button action-button--${tone}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function TileButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button className="tile-button" onClick={onClick}>
      {icon ? <span>{icon}</span> : null}
      <strong>{label}</strong>
    </button>
  );
}

export function Avatar({ value }: { value: string }) {
  return <span className="avatar">{value}</span>;
}

export function StatusPill({ children }: { children: ReactNode }) {
  return <span className="status-pill">{children}</span>;
}
