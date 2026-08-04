import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

interface RowActionsMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface RowActionsMenuProps {
  items: RowActionsMenuItem[];
  ariaLabel?: string;
}

/**
 * Kebab dropdown for table-row actions. Rendered through a portal into document.body and
 * positioned with `position: fixed` from the trigger's bounding rect, so it's never clipped
 * by an ancestor's overflow (e.g. `.table-wrap`'s horizontal scrollbar, or a nested table).
 */
export function RowActionsMenu({ items, ariaLabel = 'Actions' }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    // Closes on scroll (anywhere, hence capture) rather than repositioning — the menu is
    // short-lived, so this is simpler than tracking every scrollable ancestor.
    const close = () => setOpen(false);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className="row-menu">
      <button
        type="button"
        ref={buttonRef}
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={dropdownRef}
            className="row-menu__dropdown"
            style={{ top: position.top, right: position.right }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`row-menu__item${item.danger ? ' row-menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
