import React from 'react';
import { ATTRIBUTE_NAMES } from '../shared/character-rules';
import { RULES_SECTIONS } from '../shared/rules-reference';
import type { Adventure } from '../shared/types';

export function RulesView({ adventure }: { adventure: Adventure | null }): React.JSX.Element {
  const character = adventure?.character;
  return <div className="rules-content">
    <section className="character-card" aria-label="Active character">
      <h3>Your traveller</h3>
      {character ? <>
        <dl className="character-identity">
          <div><dt>Name</dt><dd>{character.name}</dd></div>
          <div><dt>Gender</dt><dd>{character.gender}</dd></div>
          <div><dt>Nature</dt><dd>{character.nature}</dd></div>
        </dl>
        <dl className="character-attributes">{ATTRIBUTE_NAMES.map((name) => <div key={name}>
          <dt>{name}</dt><dd>{character.attributes[name] > 0 ? `+${character.attributes[name]}` : character.attributes[name]}</dd>
        </div>)}</dl>
      </> : <p>No character is active. Start a new story to create your traveller.</p>}
    </section>
    {RULES_SECTIONS.map((section) => <section key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></section>)}
  </div>;
}
