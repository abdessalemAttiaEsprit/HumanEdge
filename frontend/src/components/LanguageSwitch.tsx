import type { Lang } from '@/i18n/context';

interface LanguageSwitchProps {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

/** EN/FR sliding switch (topbar) — same interaction pattern as ThemeSwitch, theme-aware colors. */
export function LanguageSwitch({ lang, onChange }: LanguageSwitchProps) {
  const isFr = lang === 'fr';
  return (
    <button
      type="button"
      className={`lang-switch${isFr ? ' lang-switch--fr' : ''}`}
      onClick={() => onChange(isFr ? 'en' : 'fr')}
      role="switch"
      aria-checked={isFr}
      title={isFr ? 'Switch to English' : 'Passer en français'}
      aria-label={isFr ? 'Switch to English' : 'Passer en français'}
    >
      <span className="lang-switch__label lang-switch__label--en">EN</span>
      <span className="lang-switch__label lang-switch__label--fr">FR</span>
      <span className="lang-switch__thumb" />
    </button>
  );
}
