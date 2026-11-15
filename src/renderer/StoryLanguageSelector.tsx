import { useLocale } from './LocaleContext';
import type { MessageKey } from '../shared/i18n';
import React, { useEffect, useRef, useState } from 'react';
import type { StoryLanguage } from '../shared/types';
import { LANGUAGE_LABELS, STORY_LANGUAGES } from '../shared/story-language';

interface Props {
  disabled?: boolean;
  onLanguageChange?: (language: StoryLanguage) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function StoryLanguageSelector({ disabled = false, onLanguageChange, onBusyChange }: Props): React.JSX.Element {
  const { t, errorText, preferences, updatePreferences } = useLocale();
  const language = preferences.defaultStoryLanguage;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>('');
  const saving = useRef(false);
  useEffect(() => {
    onLanguageChange?.(language);
    onBusyChange?.(busy);
  }, [language, busy, onLanguageChange, onBusyChange]);

  async function select(next: StoryLanguage): Promise<void> {
    if (disabled || busy || saving.current) return;
    saving.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const saved = await updatePreferences({ defaultStoryLanguage: next });
      onLanguageChange?.(saved.defaultStoryLanguage);
    } catch (failure) {
      setError(failure);
    } finally { saving.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return <fieldset className="setup-group story-language-selector" aria-busy={busy}>
    <legend>{t('language.story')}</legend>
    <p className="setup-help">{t('language.help')}</p>
    <div className="setup-options language-options">{STORY_LANGUAGES.map((option) =>
      <label key={option} className={`setup-option${language === option ? ' is-selected' : ''}`}>
        <input type="radio" name="story-language" value={option} checked={language === option}
          disabled={disabled || busy} onChange={() => { void select(option); }} />
        <span><strong>{LANGUAGE_LABELS[option]}</strong></span>
      </label>)}</div>
    {busy && <p className="setup-help" role="status">{t('language.busy')}</p>}
    {Boolean(error) && <p className="language-error" role="alert">{errorText(error)} {t('language.retry')}</p>}
  </fieldset>;
}
