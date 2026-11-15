import { useLocale } from './LocaleContext';
import type { MessageKey } from '../shared/i18n';
import React from 'react';
import { ATTRIBUTE_NAMES } from '../shared/character-rules';
import { localizedRules } from '../shared/localized-rules';
import type { Adventure } from '../shared/types';

export function RulesView({ adventure }: { adventure: Adventure | null }): React.JSX.Element {
  const { t, label, preferences } = useLocale();
  const character = adventure?.character;
  return <div className="rules-content">
    <section className="character-card" aria-label={t('rules.active')}>
      <h3>{t('story.traveller')}</h3>
      {character ? <>
        <dl className="character-identity">
          <div><dt>{t('setup.name')}</dt><dd>{character.name}</dd></div>
          <div><dt>{t('setup.gender')}</dt><dd>{character.gender}</dd></div>
          <div><dt>{label('Nature')}</dt><dd>{label(character.nature)}</dd></div>
        </dl>
        <dl className="character-attributes">{ATTRIBUTE_NAMES.map((name) => <div key={name}>
          <dt>{label(name)}</dt><dd>{character.attributes[name] > 0 ? `+${character.attributes[name]}` : character.attributes[name]}</dd>
        </div>)}</dl>
      </> : <p>{t('rules.noCharacter')}</p>}
    </section>
    {localizedRules(preferences.interfaceLanguage).map((section) => <section key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></section>)}
  </div>;
}
