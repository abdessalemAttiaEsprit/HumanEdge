interface IconButtonProps {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  type?: 'button' | 'submit';
}

/** Icon-only action button used in table rows — the accessible name/tooltip is `label`. */
export function IconButton({ icon, label, onClick, disabled, variant = 'default', type = 'button' }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`icon-btn${variant === 'danger' ? ' icon-btn--danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
