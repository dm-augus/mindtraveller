import { formatMessage } from '../shared/i18n';
import { useLocale } from './LocaleContext';
import type { MessageKey } from '../shared/i18n';
import React, { useState } from 'react';
import { StoryLanguageSelector } from './StoryLanguageSelector';
import { AvatarPicker } from './AvatarPicker';
import { avatarForGender, CHARACTER_GENDERS, type AvatarId } from '../shared/avatars';
import type { StoryLanguage } from '../shared/types';
import {
  ALLOCATION_METHODS, ATTRIBUTE_NAMES, ATTRIBUTE_RANGES, NATURES, THEMES,
  createInitialAttributes, validateAttributeAllocation, validateCharacterSetup
} from '../shared/character-rules';
import { ALLOCATION_BUDGETS } from '../shared/rules';
import type { CharacterSetup } from '../shared/character-rules';
import type { AllocationMethod, AttributeName, Attributes, Nature, Theme, NewCharacterGender } from '../shared/types';

const THEME_DESCRIPTIONS: Record<Theme, MessageKey> = {
  Horror: 'setup.horror',
  Romance: 'setup.romance',
  'High Fantasy': 'setup.fantasy'
};

interface NewStorySetupProps {
  busy: boolean;
  onStart: (setup: CharacterSetup) => void;
}

export function NewStorySetup({ busy, onStart }: NewStorySetupProps): React.JSX.Element {
  const { t, label, errorText, preferences } = useLocale();
  const [language, setLanguage] = useState<StoryLanguage | null>(null);
  const [preferenceBusy, setPreferenceBusy] = useState(true);
  const [theme, setTheme] = useState<Theme | ''>('');
  const [method, setMethod] = useState<AllocationMethod | ''>('');
  const [attributes, setAttributes] = useState<Attributes>(createInitialAttributes);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<NewCharacterGender | ''>('');
  const [avatarId, setAvatarId] = useState<AvatarId | null>(null);
  const [nature, setNature] = useState<Nature | ''>('');

  const allocation = validateAttributeAllocation(method, attributes);
  const setup = validateCharacterSetup({
    language,
    theme,
    character: { name, gender, avatarId, nature, allocationMethod: method, attributes }
  });
  const values = ATTRIBUTE_NAMES.map((attribute) => attributes[attribute]);
  const positive = values.reduce((total, value) => total + Math.max(0, value), 0);
  const negative = values.reduce((total, value) => total + Math.max(0, -value), 0);
  const budget = method ? ALLOCATION_BUDGETS[method] : null;

  function selectMethod(next: AllocationMethod): void {
    setMethod(next);
    setAttributes(createInitialAttributes());
  }

  function setAttribute(attribute: AttributeName, value: number): void {
    setAttributes((current) => ({ ...current, [attribute]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!busy && !preferenceBusy && setup.valid) onStart(setup.value);
  }

  return <form className="new-story-setup" onSubmit={submit} data-setup-valid={setup.valid}>
    <div className="page-introduction">
      <p className="eyebrow">{t('setup.tagline')}</p><h2>{t('setup.title')}</h2>
      <p>{t('setup.help')}</p>
    </div>

    <StoryLanguageSelector disabled={busy} onLanguageChange={setLanguage} onBusyChange={setPreferenceBusy} />
    <fieldset className="setup-group"><legend>{t('setup.world')}</legend>
      <div className="setup-options theme-options">{THEMES.map((option) =>
        <label key={option} className={`setup-option${theme === option ? ' is-selected' : ''}`}>
          <input type="radio" name="theme" value={option} checked={theme === option}
            onChange={() => setTheme(option)} disabled={busy} required />
          <span><strong>{label(option)}</strong><small>{t(THEME_DESCRIPTIONS[option])}</small></span>
        </label>
      )}</div>
    </fieldset>

    <fieldset className="setup-group"><legend>{t('setup.attributes')}</legend>
      <p className="setup-help">{t('setup.attributeHelp')}</p>
      <div className="setup-options method-options">{ALLOCATION_METHODS.map((option) =>
        <label key={option} className={`setup-option${method === option ? ' is-selected' : ''}`}>
          <input type="radio" name="allocation-method" value={option} checked={method === option}
            onChange={() => selectMethod(option)} disabled={busy} required />
          <span><strong>{label(option)}</strong><small>{option === 'Balanced'
            ? t('setup.balanced')
            : t('setup.simplified')}</small></span>
        </label>
      )}</div>
      <div className="attribute-grid">{ATTRIBUTE_NAMES.map((attribute) => {
        const range = ATTRIBUTE_RANGES[attribute];
        return <label key={attribute} className="attribute-field">
          <span>{label(attribute)}</span>
          <select value={attributes[attribute]} disabled={busy || !method}
            onChange={(event) => setAttribute(attribute, Number(event.target.value))}
            aria-label={t('setup.attributeValue', { attribute })}>
            {Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index).map((value) =>
              <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}</select>
          <small>{t('setup.range', { min: range.min, max: range.max })}</small>
        </label>;
      })}</div>
      <p className={`allocation-status${method && !allocation.valid ? ' is-invalid' : ''}`}
        role="status">{budget
          ? t('setup.budget', { positive, expectedPositive: budget.positive, negative, expectedNegative: budget.negative })
          : t('setup.chooseMethod')}</p>
      {method && !allocation.valid && <p className="setup-feedback">{allocation.issues.map(issue => formatMessage(preferences.interfaceLanguage, issue)).join(' ')}</p>}
    </fieldset>

    <fieldset className="setup-group"><legend>{t('setup.identity')}</legend>
      <div className="identity-grid">
        <label>{t('setup.name')}<input type="text" value={name} onChange={(event) => setName(event.target.value)}
          disabled={busy} maxLength={80} autoComplete="off" required /></label>
      </div>
      <fieldset className="gender-selector"><legend>{t('setup.gender')}</legend>
        <div className="setup-options gender-options">{CHARACTER_GENDERS.map(value =>
          <label key={value} className={`setup-option${gender === value ? ' is-selected' : ''}`}>
            <input type="radio" name="gender" value={value} checked={gender === value} disabled={busy} required
              onChange={() => { setGender(value); setAvatarId(previous => avatarForGender(value, previous)); }} />
            <span><strong>{label(value)}</strong></span>
          </label>)}</div>
      </fieldset>
      <p className="setup-help">{t('setup.natureHelp')}</p>
      <div className="setup-options nature-options">{NATURES.map((option) =>
        <label key={option} className={`setup-option${nature === option ? ' is-selected' : ''}`}>
          <input type="radio" name="nature" value={option} checked={nature === option}
            onChange={() => setNature(option)} disabled={busy} required />
          <span><strong>{label(option)}</strong></span>
        </label>
      )}</div>
    </fieldset>

    <AvatarPicker gender={gender} selected={avatarId} disabled={busy} onSelect={setAvatarId} />

    <div className="setup-actions">
      <p>{setup.valid ? t('setup.ready') : t('setup.incomplete')}</p>
      <button className="retro-button setup-start" type="submit" disabled={busy || preferenceBusy || !setup.valid}>
        {busy ? t('story.opening') : t('setup.begin')}
      </button>
    </div>
  </form>;
}
