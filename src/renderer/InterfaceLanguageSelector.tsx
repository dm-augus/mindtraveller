import React, { useRef, useState } from 'react';
import { useLocale } from './LocaleContext';
import type { InterfaceLanguage } from '../shared/types';

export function InterfaceLanguageSelector({ disabled = false }: { disabled?: boolean }): React.JSX.Element {
  const { preferences, updatePreferences, t, errorText } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const saving = useRef(false);
  async function select(interfaceLanguage: InterfaceLanguage): Promise<void> {
    if (disabled || saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await updatePreferences({ interfaceLanguage }); }
    catch (failure) { setError(failure); }
    finally { saving.current = false; setBusy(false); }
  }
  return <fieldset className="setup-group interface-language-selector" aria-busy={busy}>
    <legend>{t('language.interface')}</legend><p className="setup-help">{t('language.interfaceHelp')}</p>
    <div className="setup-options language-options">{(['en', 'pt-BR'] as const).map(value =>
      <label key={value} className={`setup-option${preferences.interfaceLanguage === value ? ' is-selected' : ''}`}>
        <input type="radio" name="interface-language" value={value} checked={preferences.interfaceLanguage === value}
          disabled={disabled || busy} onChange={() => { void select(value); }} />
        <span><strong>{value === 'en' ? 'English' : 'Português (Brasil)'}</strong></span>
      </label>)}</div>
    {busy && <p role="status" className="setup-help">{t('language.saving')}</p>}
    {error !== null && <p role="alert" className="language-error">{errorText(error)}</p>}
  </fieldset>;
}
