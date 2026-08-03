import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/** Kebab dropdown for table-row actions (edit/delete/…) — closes on outside click, same pattern as NotificationBell. */
export function RowActionsMenu({ items, ariaLabel = 'Actions' }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="row-menu" ref={containerRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="row-menu__dropdown">
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
        </div>
      )}
    </div>
  );
}
