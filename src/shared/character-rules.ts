import { ALLOCATION_BUDGETS, ATTRIBUTE_NAMES, ATTRIBUTE_RANGES } from './rules';
import type { AllocationMethod, Attributes, Character, Nature, Theme, StoryLanguage } from './types';
import { isStoryLanguage } from './story-language';
import { formatMessage, type MessageRef } from './i18n';
import { AVATARS, isAvatarId, isCharacterGender } from './avatars';

export { ATTRIBUTE_NAMES, ATTRIBUTE_RANGES } from './rules';

export const THEMES = ['Horror', 'Romance', 'High Fantasy'] as const satisfies readonly Theme[];
export const NATURES = ['Good', 'Neutral', 'Bad'] as const satisfies readonly Nature[];
export const ALLOCATION_METHODS = ['Balanced', 'Simplified'] as const satisfies readonly AllocationMethod[];
export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; errors: string[]; issues: MessageRef[] };

function invalid(issues: MessageRef[]): { valid: false; errors: string[]; issues: MessageRef[] } {
  return { valid: false, errors: issues.map(issue => formatMessage('en', issue)), issues };
}

export interface CharacterSetup {
  language: StoryLanguage;
  theme: Theme;
  character: Character;
}

export function createInitialAttributes(): Attributes {
  return {
    Strength: 0,
    Dexterity: 0,
    Intelligence: 0,
    Endurance: 0,
    Charisma: 0,
    Luck: 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.some((option) => option === value);
}

export function validateAttributeAllocation(method: unknown, input: unknown): ValidationResult<Attributes> {
  const issues: MessageRef[] = [];
  const allocationMethod = isOneOf(method, ALLOCATION_METHODS) ? method : null;
  if (allocationMethod === null) issues.push({ key: 'validation.method' });
  if (!isRecord(input)) return invalid([...issues, { key: 'validation.attributes' }]);

  const attributes = createInitialAttributes();
  for (const name of ATTRIBUTE_NAMES) {
    const value = input[name];
    const { min, max } = ATTRIBUTE_RANGES[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      issues.push({ key: 'validation.range', params: { attribute: name, min, max } });
    } else {
      attributes[name] = value;
    }
  }
  for (const name of Object.keys(input)) {
    if (!isOneOf(name, ATTRIBUTE_NAMES)) issues.push({ key: 'validation.unknownAttribute', params: { attribute: name } });
  }

  if (issues.length > 0 || allocationMethod === null) return invalid(issues);

  const values = ATTRIBUTE_NAMES.map((name) => attributes[name]);
  const positivePoints = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const negativePoints = values.reduce((sum, value) => sum + Math.max(0, -value), 0);
  const { positive: expectedPositive, negative: expectedNegative } = ALLOCATION_BUDGETS[allocationMethod];
  if (positivePoints !== expectedPositive || negativePoints !== expectedNegative) {
    return invalid([{ key: 'validation.budget', params: { method: allocationMethod, positive: expectedPositive, negative: expectedNegative } }]);
  }
  return { valid: true, value: attributes };
}

function validateSetup(input: unknown, creating: boolean): ValidationResult<CharacterSetup> {
  if (!isRecord(input)) return invalid([{ key: 'validation.setup' }]);
  const issues: MessageRef[] = [];
  if (!isOneOf(input.theme, THEMES)) issues.push({ key: 'validation.theme' });
  const language = 'language' in input ? input.language : 'en';
  if (!isStoryLanguage(language)) issues.push({ key: 'validation.language' });

  const character = input.character;
  if (!isRecord(character)) return invalid([...issues, { key: 'validation.details' }]);
  const name = typeof character.name === 'string' ? character.name.trim() : '';
  const gender = typeof character.gender === 'string' ? character.gender.trim() : '';
  if (!name) issues.push({ key: 'validation.name' });
  if (!gender) issues.push({ key: 'validation.gender' });
  if (creating && !isCharacterGender(gender)) issues.push({ key: 'validation.genderSelection' });
  const avatarId = !creating && !Object.hasOwn(character, 'avatarId') ? null : character.avatarId;
  if (creating ? !isAvatarId(avatarId) : avatarId !== null && !isAvatarId(avatarId)) {
    issues.push({ key: 'validation.avatar' });
  } else if (creating && !AVATARS.some(avatar => avatar.id === avatarId && avatar.gender === gender)) {
    issues.push({ key: 'validation.avatarGender' });
  }
  if (!isOneOf(character.nature, NATURES)) issues.push({ key: 'validation.nature' });

  const allocation = validateAttributeAllocation(character.allocationMethod, character.attributes);
  if (!allocation.valid) issues.push(...allocation.issues);
  if (issues.length > 0 || !allocation.valid) return invalid(issues);

  return {
    valid: true,
    value: {
      theme: input.theme as Theme,
      language: language as StoryLanguage,
      character: {
        name,
        gender,
        avatarId: avatarId as Character['avatarId'],
        nature: character.nature as Nature,
        allocationMethod: character.allocationMethod as AllocationMethod,
        attributes: allocation.value
      }
    }
  };
}

export function validateCharacterSetup(input: unknown): ValidationResult<CharacterSetup> {
  return validateSetup(input, true);
}

/** Saved identities retain legacy free-text gender; creation rules are stricter. */
export function validateSavedCharacter(character: unknown): ValidationResult<Character> {
  const result = validateSetup({ theme: 'Horror', character }, false);
  return result.valid ? { valid: true, value: result.value.character } : result;
}
