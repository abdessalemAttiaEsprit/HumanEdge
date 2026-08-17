import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LanguageContext, type Lang } from './context';
import { en } from './en';
import { fr } from './fr';

const STORAGE_KEY = 'hr-lang';
const DICTIONARIES = { en, fr };

function getStoredLang(): Lang | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'fr' ? stored : null;
}

function getBrowserLang(): Lang {
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Explicit EN/FR toggle, persisted in localStorage; defaults to the browser language until the user picks one. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getStoredLang() ?? getBrowserLang());

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: DICTIONARIES[lang] }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
