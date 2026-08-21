import { ArrowRightOnRectangleIcon, XMarkIcon } from '@heroicons/react/24/solid';

type SignOutConfirmDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SignOutConfirmDialog({ isOpen, onCancel, onConfirm }: SignOutConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="confirm-overlay"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sign-out-title"
        aria-describedby="sign-out-description"
      >
        <button className="confirm-dialog__close" aria-label="Закрыть" onClick={onCancel}>
          <XMarkIcon aria-hidden="true" />
        </button>
        <ArrowRightOnRectangleIcon className="confirm-dialog__icon" aria-hidden="true" />
        <h2 id="sign-out-title">Выйти из аккаунта?</h2>
        <p id="sign-out-description">Вы уверены, что хотите выйти? Для возвращения потребуется снова войти в аккаунт.</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__cancel" autoFocus onClick={onCancel}>Остаться</button>
          <button className="confirm-dialog__confirm" onClick={onConfirm}>Да, выйти</button>
        </div>
      </section>
    </div>
  );
}
