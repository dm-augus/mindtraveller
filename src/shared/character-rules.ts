import { ALLOCATION_BUDGETS, ATTRIBUTE_NAMES, ATTRIBUTE_RANGES } from './rules';
import type { AllocationMethod, Attributes, Character, Nature, Theme } from './types';

export { ATTRIBUTE_NAMES, ATTRIBUTE_RANGES } from './rules';

export const THEMES = ['Horror', 'Romance', 'High Fantasy'] as const satisfies readonly Theme[];
export const NATURES = ['Good', 'Neutral', 'Bad'] as const satisfies readonly Nature[];
export const ALLOCATION_METHODS = ['Balanced', 'Simplified'] as const satisfies readonly AllocationMethod[];
export type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; errors: string[] };

export interface CharacterSetup {
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
  const errors: string[] = [];
  const allocationMethod = isOneOf(method, ALLOCATION_METHODS) ? method : null;
  if (allocationMethod === null) errors.push('Select Balanced or Simplified allocation.');
  if (!isRecord(input)) return { valid: false, errors: [...errors, 'Provide all six attributes.'] };

  const attributes = createInitialAttributes();
  for (const name of ATTRIBUTE_NAMES) {
    const value = input[name];
    const { min, max } = ATTRIBUTE_RANGES[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${name} must be an integer from ${min} to +${max}.`);
    } else {
      attributes[name] = value;
    }
  }
  for (const name of Object.keys(input)) {
    if (!isOneOf(name, ATTRIBUTE_NAMES)) errors.push(`Unknown attribute: ${name}.`);
  }

  if (errors.length > 0 || allocationMethod === null) return { valid: false, errors };

  const values = ATTRIBUTE_NAMES.map((name) => attributes[name]);
  const positivePoints = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const negativePoints = values.reduce((sum, value) => sum + Math.max(0, -value), 0);
  const { positive: expectedPositive, negative: expectedNegative } = ALLOCATION_BUDGETS[allocationMethod];
  if (positivePoints !== expectedPositive || negativePoints !== expectedNegative) {
    return {
      valid: false,
      errors: [`${method} allocation requires ${expectedPositive} positive and ${expectedNegative} negative points.`]
    };
  }
  return { valid: true, value: attributes };
}

export function validateCharacterSetup(input: unknown): ValidationResult<CharacterSetup> {
  if (!isRecord(input)) return { valid: false, errors: ['Provide a character setup.'] };
  const errors: string[] = [];
  if (!isOneOf(input.theme, THEMES)) errors.push('Select Horror, Romance, or High Fantasy.');

  const character = input.character;
  if (!isRecord(character)) return { valid: false, errors: [...errors, 'Provide character details.'] };
  const name = typeof character.name === 'string' ? character.name.trim() : '';
  const gender = typeof character.gender === 'string' ? character.gender.trim() : '';
  if (!name) errors.push('Enter a character name.');
  if (!gender) errors.push('Enter a gender.');
  if (!isOneOf(character.nature, NATURES)) errors.push('Select Good, Neutral, or Bad Nature.');

  const allocation = validateAttributeAllocation(character.allocationMethod, character.attributes);
  if (!allocation.valid) errors.push(...allocation.errors);
  if (errors.length > 0 || !allocation.valid) return { valid: false, errors };

  return {
    valid: true,
    value: {
      theme: input.theme as Theme,
      character: {
        name,
        gender,
        nature: character.nature as Nature,
        allocationMethod: character.allocationMethod as AllocationMethod,
        attributes: allocation.value
      }
    }
  };
}
