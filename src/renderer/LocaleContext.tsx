import React, { createContext, useContext, useEffect, useState } from 'react';
import { errorText, label, translate, type Translator } from '../shared/i18n';
import type { StoryPreferences } from '../shared/types';

interface LocaleValue {
  preferences: StoryPreferences;
  updatePreferences: (patch: Partial<StoryPreferences>) => Promise<StoryPreferences>;
  t: Translator;
  label: (value: string) => string;
  errorText: (error: unknown) => string;
}
const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [preferences, setPreferences] = useState<StoryPreferences | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void window.mindtraveller.getStoryPreferences().then(value => { if (active) setPreferences(value); })
      .catch(error => { if (active) { setFailure(error); setPreferences({ defaultStoryLanguage: 'en', interfaceLanguage: 'en', autoReadStory: true }); } });
    return () => { active = false; };
  }, []);
  const locale = preferences?.interfaceLanguage ?? 'en';
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  if (!preferences) return <div role="status" aria-busy="true">Mindtraveller…</div>;
  return <LocaleContext.Provider value={{ preferences,
    updatePreferences: async patch => {
      const saved = await window.mindtraveller.saveStoryPreferences(patch);
      // The store's response is the snapshot at this patch's commit. Merge only
      // its own fields so a late response cannot undo another UI selection.
      setPreferences(current => ({ ...(current ?? saved), ...Object.fromEntries(Object.keys(patch).map(key => [key, saved[key as keyof StoryPreferences]])) }));
      setFailure(null);
      return saved;
    },
    t: (key, params) => translate(locale, key, params), label: value => label(locale, value), errorText: error => errorText(locale, error)
  }}>
    {failure !== null && <div role="alert" className="error-banner">{errorText(locale, failure)}</div>}
    {children}
  </LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('Missing locale provider');
  return value;
}
