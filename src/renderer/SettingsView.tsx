import { InterfaceLanguageSelector } from './InterfaceLanguageSelector';
import { useLocale } from './LocaleContext';
import type { MessageKey } from '../shared/i18n';
import React, { useEffect, useState } from 'react';
import { StoryLanguageSelector } from './StoryLanguageSelector';
import type { ModelOption, ProviderConfiguration, ProviderKind, ProviderSettings } from '../shared/types';

interface Props {
  settings: ProviderSettings | null;
  onSaved: (settings: ProviderSettings) => void;
}

const DEFAULTS: ProviderConfiguration = {
  activeProvider: 'ollama',
  ollama: { serverAddress: 'http://127.0.0.1:11434', modelId: null },
  openai: { modelId: null }
};

export function SettingsView({ settings, onSaved }: Props): React.JSX.Element {
  const { t, label, errorText } = useLocale();
  const [form, setForm] = useState<ProviderConfiguration>(settings ?? DEFAULTS);
  const [models, setModels] = useState<Partial<Record<ProviderKind, ModelOption[]>>>({});
  const [key, setKey] = useState('');
  const [persistKey, setPersistKey] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<MessageKey | ''>('');
  const [error, setError] = useState<unknown>('');

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  function updateProvider(provider: ProviderKind): void {
    setForm((current) => ({ ...current, activeProvider: provider }));
    setError('');
    setFeedback('');
  }

  async function discover(): Promise<void> {
    const provider = form.activeProvider;
    setBusy(true); setError(''); setFeedback('');
    try {
      if (provider === 'openai' && key.trim()) {
        const result = await window.mindtraveller.setOpenAiKey(key, persistKey);
        setKey('');
        onSaved(await window.mindtraveller.getProviderSettings());
        setFeedback(result.persisted ? 'settings.keySaved' : 'settings.sessionKey');
      }
      const list = await window.mindtraveller.listProviderModels(provider,
        provider === 'ollama' ? form.ollama.serverAddress : null);
      setModels((current) => ({ ...current, [provider]: list }));
      if (list.length === 0) setFeedback('settings.empty');
    } catch (failure) {
      setError(failure);
    } finally { setBusy(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setError(''); setFeedback('');
    try {
      if (key.trim()) {
        const result = await window.mindtraveller.setOpenAiKey(key, persistKey);
        setKey('');
        if (!result.persisted) setFeedback('settings.sessionSaved');
      }
      const saved = await window.mindtraveller.saveProviderConfiguration(form);
      onSaved(saved);
      setFeedback((current) => current || 'settings.saved');
    } catch (failure) {
      setError(failure);
    } finally { setBusy(false); }
  }

  const provider = form.activeProvider;
  const options = models[provider] ?? [];
  const selected = form[provider].modelId;
  const visibleOptions = selected && !options.some((option) => option.id === selected)
    ? [{ id: selected, label: t('settings.savedSelection', { model: selected }) }, ...options] : options;

  return <form className="settings-content" onSubmit={(event) => { void save(event); }}>
    <div className="page-introduction"><p className="eyebrow">{t('settings.tagline')}</p>
      <h2>{t('settings.title')}</h2><p>{t('settings.help')}</p></div>
    <div className="settings-columns">
      <div className="settings-preferences">
        <InterfaceLanguageSelector disabled={busy} />
        <StoryLanguageSelector disabled={busy} />
      </div>
      <div className="settings-provider">
        <fieldset className="setup-group"><legend>{t('settings.provider')}</legend>
          <div className="setup-options method-options">{(['ollama', 'openai'] as const).map((option) =>
            <label key={option} className={`setup-option${provider === option ? ' is-selected' : ''}`}>
              <input type="radio" name="provider" value={option} checked={provider === option} onChange={() => updateProvider(option)} disabled={busy} />
              <span><strong>{option === 'ollama' ? 'Ollama' : 'OpenAI'}</strong>
                <small>{option === 'ollama' ? t('settings.local') : t('settings.remote')}</small></span>
            </label>)}</div>
        </fieldset>
        {provider === 'ollama' ? <fieldset className="setup-group"><legend>{t('settings.connection')}</legend>
          <label className="settings-field">{t('settings.address')}
            <input value={form.ollama.serverAddress} onChange={(event) => {
              setForm((current) => ({ ...current, ollama: { ...current.ollama, serverAddress: event.target.value, modelId: null } }));
              setModels((current) => ({ ...current, ollama: undefined }));
            }} disabled={busy} required spellCheck={false} /></label>
          <p className="setup-help">{t('settings.ollamaHelp')}</p>
        </fieldset> : <fieldset className="setup-group"><legend>{t('settings.key')}</legend>
          <label className="settings-field">{t('settings.apiKey')}
            <input type="password" value={key} onChange={(event) => setKey(event.target.value)} disabled={busy}
              autoComplete="off" spellCheck={false} placeholder={settings?.openai.hasSavedKey ? t('settings.savedKey') : t('settings.enterKey')} /></label>
          <label className="settings-check"><input type="checkbox" checked={persistKey} onChange={(event) => setPersistKey(event.target.checked)} disabled={busy} /> {t('settings.persistKey')}</label>
          <p className="setup-help">{settings?.openai.hasSavedKey ? t('settings.keyHelp') : t('settings.noKey')}</p>
        </fieldset>}
        <fieldset className="setup-group"><legend>{t('settings.model')}</legend>
          <button className="retro-button settings-button" type="button" onClick={() => { void discover(); }} disabled={busy}>
            {busy ? t('settings.connecting') : t('settings.refresh')}</button>
          <label className="settings-field">{t('settings.selected')}
            <select value={selected ?? ''} onChange={(event) => setForm((current) => ({ ...current,
              [provider]: { ...current[provider], modelId: event.target.value || null }
            }))} disabled={busy || visibleOptions.length === 0}>
              <option value="">{t('settings.select')}</option>
              {visibleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select></label>
          {provider === 'openai' && <p className="setup-help">{t('settings.modelHelp')}</p>}
        </fieldset>
        {Boolean(error) && <p className="settings-error" role="alert">{errorText(error)}</p>}
        {feedback && <p className="settings-feedback" role="status">{t(feedback || 'settings.saved')}</p>}
        <button className="retro-button settings-button" type="submit" disabled={busy || !form[provider].modelId}>{t('settings.save')}</button>
      </div>
    </div>
  </form>;
}
