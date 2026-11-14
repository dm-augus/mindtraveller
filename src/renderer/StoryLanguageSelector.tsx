import React, { useEffect, useRef, useState } from 'react';
import type { StoryLanguage } from '../shared/types';
import { LANGUAGE_LABELS, STORY_LANGUAGES } from '../shared/story-language';

interface Props {
  disabled?: boolean;
  onLanguageChange?: (language: StoryLanguage) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function StoryLanguageSelector({ disabled = false, onLanguageChange, onBusyChange }: Props): React.JSX.Element {
  const [language, setLanguage] = useState<StoryLanguage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    onBusyChange?.(true);
    void window.mindtraveller.getStoryPreferences().then((preferences) => {
      if (!active) return;
      setLanguage(preferences.defaultStoryLanguage);
      onLanguageChange?.(preferences.defaultStoryLanguage);
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to read story language preferences.');
    }).finally(() => { if (active) { setBusy(false); onBusyChange?.(false); } });
    return () => { active = false; };
  }, [onLanguageChange, onBusyChange]);

  async function select(next: StoryLanguage): Promise<void> {
    if (disabled || busy || saving.current) return;
    saving.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const saved = await window.mindtraveller.saveStoryPreferences({ defaultStoryLanguage: next });
      setLanguage(saved.defaultStoryLanguage);
      onLanguageChange?.(saved.defaultStoryLanguage);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save story language preferences.');
    } finally { saving.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return <fieldset className="setup-group story-language-selector" aria-busy={busy}>
    <legend>Language for new stories</legend>
    <p className="setup-help">Applies only to new adventures. Existing stories keep their original language.</p>
    <div className="setup-options language-options">{STORY_LANGUAGES.map((option) =>
      <label key={option} className={`setup-option${language === option ? ' is-selected' : ''}`}>
        <input type="radio" name="story-language" value={option} checked={language === option}
          disabled={disabled || busy} onChange={() => { void select(option); }} />
        <span><strong>{LANGUAGE_LABELS[option]}</strong></span>
      </label>)}</div>
    {busy && <p className="setup-help" role="status">Saving or loading language…</p>}
    {error && <p className="language-error" role="alert">{error} Select a language to try again.</p>}
  </fieldset>;
}
