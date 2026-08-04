import type { Theme } from '@/lib/useTheme';

interface ThemeSwitchProps {
  theme: Theme;
  onToggle: () => void;
}

/** Sliding Day/Night switch (topbar) - visual style inspired by a stock day/night toggle asset. */
export function ThemeSwitch({ theme, onToggle }: ThemeSwitchProps) {
  const isNight = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-switch${isNight ? ' theme-switch--night' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={isNight}
      title={isNight ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isNight ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="theme-switch__label theme-switch__label--day">Day</span>
      <span className="theme-switch__label theme-switch__label--night">Night</span>
      <span className="theme-switch__thumb" />
    </button>
  );
}
