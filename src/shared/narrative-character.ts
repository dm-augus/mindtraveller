import type { Character } from './types';

export type NarrativeCharacter = Omit<Character, 'avatarId'>;

/** Keep cosmetic identity out of generation, context budgets, and summaries. */
export function narrativeCharacter(character: NarrativeCharacter): NarrativeCharacter {
  return {
    name: character.name,
    gender: character.gender,
    nature: character.nature,
    allocationMethod: character.allocationMethod,
    attributes: { ...character.attributes }
  };
}
