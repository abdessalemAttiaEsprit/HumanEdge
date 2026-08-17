import { useContext } from 'react';
import { LanguageContext } from './context';

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (ctx === undefined) {
    throw new Error('useLanguage must be used within a <LanguageProvider>');
  }
  return ctx;
}
