import React, { useState } from 'react';
import {
  ALLOCATION_METHODS, ATTRIBUTE_NAMES, ATTRIBUTE_RANGES, NATURES, THEMES,
  createInitialAttributes, validateAttributeAllocation, validateCharacterSetup
} from '../shared/character-rules';
import { ALLOCATION_BUDGETS } from '../shared/rules';
import type { CharacterSetup } from '../shared/character-rules';
import type { AllocationMethod, AttributeName, Attributes, Nature, Theme } from '../shared/types';

const THEME_DESCRIPTIONS: Record<Theme, string> = {
  Horror: 'Ancient secrets, haunted places, and the unknown.',
  Romance: 'Unexpected encounters, loyalties, and matters of the heart.',
  'High Fantasy': 'Magic, mythical creatures, and extraordinary quests.'
};

interface NewStorySetupProps {
  busy: boolean;
  onStart: (setup: CharacterSetup) => void;
}

export function NewStorySetup({ busy, onStart }: NewStorySetupProps): React.JSX.Element {
  const [theme, setTheme] = useState<Theme | ''>('');
  const [method, setMethod] = useState<AllocationMethod | ''>('');
  const [attributes, setAttributes] = useState<Attributes>(createInitialAttributes);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [nature, setNature] = useState<Nature | ''>('');

  const allocation = validateAttributeAllocation(method, attributes);
  const setup = validateCharacterSetup({
    theme,
    character: { name, gender, nature, allocationMethod: method, attributes }
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
    if (!busy && setup.valid) onStart(setup.value);
  }

  return <form className="new-story-setup" onSubmit={submit} data-setup-valid={setup.valid}>
    <div className="page-introduction">
      <p className="eyebrow">Turn the first page</p><h2>Who will you become?</h2>
      <p>Choose a medieval world, create your traveller, and begin your adventure.</p>
    </div>

    <fieldset className="setup-group"><legend>Choose your world</legend>
      <div className="setup-options theme-options">{THEMES.map((option) =>
        <label key={option} className={`setup-option${theme === option ? ' is-selected' : ''}`}>
          <input type="radio" name="theme" value={option} checked={theme === option}
            onChange={() => setTheme(option)} disabled={busy} required />
          <span><strong>{option}</strong><small>{THEME_DESCRIPTIONS[option]}</small></span>
        </label>
      )}</div>
    </fieldset>

    <fieldset className="setup-group"><legend>Allocate attributes</legend>
      <p className="setup-help">Every attribute begins at 0. Choose a method, then set the final values.</p>
      <div className="setup-options method-options">{ALLOCATION_METHODS.map((option) =>
        <label key={option} className={`setup-option${method === option ? ' is-selected' : ''}`}>
          <input type="radio" name="allocation-method" value={option} checked={method === option}
            onChange={() => selectMethod(option)} disabled={busy} required />
          <span><strong>{option}</strong><small>{option === 'Balanced'
            ? '5 positive points and 2 negative points'
            : '3 positive points and no negative points'}</small></span>
        </label>
      )}</div>
      <div className="attribute-grid">{ATTRIBUTE_NAMES.map((attribute) => {
        const range = ATTRIBUTE_RANGES[attribute];
        return <label key={attribute} className="attribute-field">
          <span>{attribute}</span>
          <select value={attributes[attribute]} disabled={busy || !method}
            onChange={(event) => setAttribute(attribute, Number(event.target.value))}
            aria-label={`${attribute} value`}>
            {Array.from({ length: range.max - range.min + 1 }, (_, index) => range.min + index).map((value) =>
              <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}</select>
          <small>{range.min} to +{range.max}</small>
        </label>;
      })}</div>
      <p className={`allocation-status${method && !allocation.valid ? ' is-invalid' : ''}`}
        role="status">{budget
          ? `Positive points: ${positive}/${budget.positive} · Negative points: ${negative}/${budget.negative}`
          : 'Choose Balanced or Simplified to allocate your attributes.'}</p>
      {method && !allocation.valid && <p className="setup-feedback">{allocation.errors.join(' ')}</p>}
    </fieldset>

    <fieldset className="setup-group"><legend>Name your traveller</legend>
      <div className="identity-grid">
        <label>Name<input type="text" value={name} onChange={(event) => setName(event.target.value)}
          disabled={busy} maxLength={80} autoComplete="off" required /></label>
        <label>Gender<input type="text" value={gender} onChange={(event) => setGender(event.target.value)}
          disabled={busy} maxLength={80} autoComplete="off" required /></label>
      </div>
      <p className="setup-help">Choose your Nature. It shapes story suggestions, but never restricts your choices or changes a roll.</p>
      <div className="setup-options nature-options">{NATURES.map((option) =>
        <label key={option} className={`setup-option${nature === option ? ' is-selected' : ''}`}>
          <input type="radio" name="nature" value={option} checked={nature === option}
            onChange={() => setNature(option)} disabled={busy} required />
          <span><strong>{option}</strong></span>
        </label>
      )}</div>
    </fieldset>

    <div className="setup-actions">
      <p>{setup.valid ? 'Your traveller is ready.' : 'Complete every field and match the allocation budget to begin.'}</p>
      <button className="retro-button setup-start" type="submit" disabled={busy || !setup.valid}>
        {busy ? 'Opening your story…' : 'Begin story'}
      </button>
    </div>
  </form>;
}
