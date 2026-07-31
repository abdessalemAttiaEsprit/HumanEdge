import { useCallback, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
}

/** Drives a single <ConfirmDialog> instance in place of window.confirm(). */
export function useConfirm() {
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);

  const requestConfirm = useCallback((options: ConfirmOptions) => setConfirmOptions(options), []);
  const closeConfirm = useCallback(() => setConfirmOptions(null), []);
  const handleConfirm = useCallback(() => {
    setConfirmOptions((current) => {
      current?.onConfirm();
      return null;
    });
  }, []);

  return { confirmOptions, requestConfirm, closeConfirm, handleConfirm };
}
