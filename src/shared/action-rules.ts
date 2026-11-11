import {
  ATTRIBUTE_NAMES,
  ATTRIBUTE_RANGES,
  ATTRIBUTE_THRESHOLD_STEP,
  D100_SIDES,
  DIFFICULTY_BASE_THRESHOLDS,
  MAX_SUCCESS_THRESHOLD,
  MIN_SUCCESS_THRESHOLD
} from './rules';
import type { AttributeName, CheckRecord, DifficultyClass } from './types';

export { DIFFICULTY_BASE_THRESHOLDS } from './rules';

export interface CheckSelection {
  difficulty: DifficultyClass;
  attribute: AttributeName;
  attributeValue: number;
}

function isDifficultyClass(value: unknown): value is DifficultyClass {
  return typeof value === 'string' && Object.hasOwn(DIFFICULTY_BASE_THRESHOLDS, value);
}

function isAttributeName(value: unknown): value is AttributeName {
  return typeof value === 'string' && ATTRIBUTE_NAMES.some((name) => name === value);
}

function assertAttributeValue(attribute: AttributeName, value: unknown): asserts value is number {
  const { min, max } = ATTRIBUTE_RANGES[attribute];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${attribute} must be an integer from ${min} to +${max}.`);
  }
}

export function validateCheckSelection(
  difficulty: unknown,
  attribute: unknown,
  attributes: unknown
): CheckSelection {
  if (!isDifficultyClass(difficulty)) throw new TypeError('Unknown difficulty class.');
  if (!isAttributeName(attribute)) throw new TypeError('Unknown check attribute.');
  if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) {
    throw new TypeError('Missing character attributes.');
  }
  const attributeValue = (attributes as Record<string, unknown>)[attribute];
  assertAttributeValue(attribute, attributeValue);
  return { difficulty, attribute, attributeValue };
}

export function calculateSuccessThreshold(difficulty: DifficultyClass, attributeValue: number): number {
  if (!isDifficultyClass(difficulty)) throw new TypeError('Unknown difficulty class.');
  if (!Number.isInteger(attributeValue)) throw new TypeError('Attribute value must be an integer.');
  return Math.max(
    MIN_SUCCESS_THRESHOLD,
    Math.min(MAX_SUCCESS_THRESHOLD, DIFFICULTY_BASE_THRESHOLDS[difficulty] + attributeValue * ATTRIBUTE_THRESHOLD_STEP)
  );
}

export function createCheckRecord(selection: CheckSelection, roll: number): CheckRecord {
  const { difficulty, attribute, attributeValue } = selection;
  if (!isDifficultyClass(difficulty)) throw new TypeError('Unknown difficulty class.');
  if (!isAttributeName(attribute)) throw new TypeError('Unknown check attribute.');
  assertAttributeValue(attribute, attributeValue);
  if (!Number.isInteger(roll) || roll < 1 || roll > D100_SIDES) {
    throw new TypeError('D100 roll must be an integer from 1 to 100.');
  }
  const baseThreshold = DIFFICULTY_BASE_THRESHOLDS[difficulty];
  const threshold = calculateSuccessThreshold(difficulty, attributeValue);
  return {
    difficulty,
    attribute,
    attributeValue,
    baseThreshold,
    threshold,
    roll,
    outcome: roll <= threshold ? 'success' : 'failure'
  };
}
