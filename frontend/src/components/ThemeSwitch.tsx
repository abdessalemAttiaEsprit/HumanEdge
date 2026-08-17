import { useLanguage } from '@/i18n/useLanguage';
import type { Theme } from '@/lib/useTheme';

interface ThemeSwitchProps {
  theme: Theme;
  onToggle: () => void;
}

/** Sliding Day/Night switch (topbar) - visual style inspired by a stock day/night toggle asset. */
export function ThemeSwitch({ theme, onToggle }: ThemeSwitchProps) {
  const { t } = useLanguage();
  const isNight = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-switch${isNight ? ' theme-switch--night' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={isNight}
      title={isNight ? t.themeSwitch.switchToLight : t.themeSwitch.switchToDark}
      aria-label={isNight ? t.themeSwitch.switchToLight : t.themeSwitch.switchToDark}
    >
      <span className="theme-switch__label theme-switch__label--day">{t.themeSwitch.day}</span>
      <span className="theme-switch__label theme-switch__label--night">{t.themeSwitch.night}</span>
      <span className="theme-switch__thumb" />
    </button>
  );
}
