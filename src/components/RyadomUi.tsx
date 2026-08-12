import type { ReactNode } from 'react';

type ActionButtonProps = {
  children: ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'calm' | 'danger' | 'ghost';
  disabled?: boolean;
};

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell">
      <section className="phone-shell">
        {children}
        <div className="ad-slot">
          <span>Место для рекламы</span>
        </div>
      </section>
    </main>
  );
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="screen-header">
      <strong>hopee</strong>
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
