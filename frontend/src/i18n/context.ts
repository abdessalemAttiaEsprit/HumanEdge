import { createContext } from 'react';
import type { Messages } from './en';

export type Lang = 'en' | 'fr';

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Direct nested-object access (t.nav.dashboard), not a string-path lookup — full autocomplete
   *  and a compile error on typos, since both en.ts/fr.ts are structurally typed as `Messages`. */
  t: Messages;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
