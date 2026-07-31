import { useEscapeKey } from '@/lib/useEscapeKey';
import type { ConfirmOptions } from '@/lib/useConfirm';

interface ConfirmDialogProps {
  options: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Styled replacement for window.confirm(), driven by useConfirm(). */
export function ConfirmDialog({ options, onConfirm, onCancel }: ConfirmDialogProps) {
  useEscapeKey(onCancel, !!options);
  if (!options) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title">{options.title}</h2>
        <p className="field-hint">{options.message}</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={options.variant === 'danger' ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
