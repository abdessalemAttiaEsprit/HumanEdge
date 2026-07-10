import { useEffect } from 'react';

/** Closes the active modal on Escape. Pass `active=false` (or omit) when the modal is closed. */
export function useEscapeKey(onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}
