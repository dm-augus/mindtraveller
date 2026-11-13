import React, { useEffect, useState } from 'react';
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
  const [form, setForm] = useState<ProviderConfiguration>(settings ?? DEFAULTS);
  const [models, setModels] = useState<Partial<Record<ProviderKind, ModelOption[]>>>({});
  const [key, setKey] = useState('');
  const [persistKey, setPersistKey] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

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
        setFeedback(result.persisted ? 'Key saved securely.' : 'Key available for this session only.');
      }
      const list = await window.mindtraveller.listProviderModels(provider,
        provider === 'ollama' ? form.ollama.serverAddress : null);
      setModels((current) => ({ ...current, [provider]: list }));
      if (list.length === 0) setFeedback('No models were found. Add a model to the provider, then refresh.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load models. Check the provider and try again.');
    } finally { setBusy(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true); setError(''); setFeedback('');
    try {
      if (key.trim()) {
        const result = await window.mindtraveller.setOpenAiKey(key, persistKey);
        setKey('');
        if (!result.persisted) setFeedback('Settings saved. The OpenAI key is available for this session only.');
      }
      const saved = await window.mindtraveller.saveProviderConfiguration(form);
      onSaved(saved);
      setFeedback((current) => current || 'Storyteller settings saved. New story operations will use this selection.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save settings. Try again.');
    } finally { setBusy(false); }
  }

  const provider = form.activeProvider;
  const options = models[provider] ?? [];
  const selected = form[provider].modelId;
  const visibleOptions = selected && !options.some((option) => option.id === selected)
    ? [{ id: selected, label: `${selected} (saved selection)` }, ...options] : options;

  return <form className="settings-content" onSubmit={(event) => { void save(event); }}>
    <div className="page-introduction"><p className="eyebrow">The voice behind your adventure</p>
      <h2>Your storyteller</h2><p>Choose the provider and model used for new story and memory operations.</p></div>
    <fieldset className="setup-group"><legend>Provider</legend>
      <div className="setup-options method-options">{(['ollama', 'openai'] as const).map((option) =>
        <label key={option} className={`setup-option${provider === option ? ' is-selected' : ''}`}>
          <input type="radio" name="provider" value={option} checked={provider === option} onChange={() => updateProvider(option)} disabled={busy} />
          <span><strong>{option === 'ollama' ? 'Ollama' : 'OpenAI'}</strong>
            <small>{option === 'ollama' ? 'A server on your computer or network' : 'Use your OpenAI API key'}</small></span>
        </label>)}</div>
    </fieldset>
    {provider === 'ollama' ? <fieldset className="setup-group"><legend>Ollama connection</legend>
      <label className="settings-field">Server address
        <input value={form.ollama.serverAddress} onChange={(event) => {
          setForm((current) => ({ ...current, ollama: { ...current.ollama, serverAddress: event.target.value, modelId: null } }));
          setModels((current) => ({ ...current, ollama: undefined }));
        }} disabled={busy} required spellCheck={false} /></label>
      <p className="setup-help">Start Ollama and pull a model before refreshing the list.</p>
    </fieldset> : <fieldset className="setup-group"><legend>OpenAI key</legend>
      <label className="settings-field">API key
        <input type="password" value={key} onChange={(event) => setKey(event.target.value)} disabled={busy}
          autoComplete="off" spellCheck={false} placeholder={settings?.openai.hasSavedKey ? 'Saved key available' : 'Enter a key'} /></label>
      <label className="settings-check"><input type="checkbox" checked={persistKey} onChange={(event) => setPersistKey(event.target.checked)} disabled={busy} /> Save securely on this Windows account</label>
      <p className="setup-help">{settings?.openai.hasSavedKey ? 'A saved key is available. Its value is never shown here.' : 'No saved key. Enter one to discover models or use OpenAI.'}</p>
    </fieldset>}
    <fieldset className="setup-group"><legend>Model</legend>
      <button className="retro-button settings-button" type="button" onClick={() => { void discover(); }} disabled={busy}>
        {busy ? 'Connecting…' : 'Refresh available models'}</button>
      <label className="settings-field">Selected model
        <select value={selected ?? ''} onChange={(event) => setForm((current) => ({ ...current,
          [provider]: { ...current[provider], modelId: event.target.value || null }
        }))} disabled={busy || visibleOptions.length === 0}>
          <option value="">Select a model</option>
          {visibleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
      {provider === 'openai' && <p className="setup-help">Choose a model that supports the Responses API and JSON output.</p>}
    </fieldset>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {feedback && <p className="settings-feedback" role="status">{feedback}</p>}
    <button className="retro-button settings-button" type="submit" disabled={busy || !form[provider].modelId}>Save storyteller settings</button>
  </form>;
}
