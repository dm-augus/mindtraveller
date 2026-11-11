import type { AllocationMethod, AttributeName, DifficultyClass } from './types';

export const ATTRIBUTE_NAMES = [
  'Strength', 'Dexterity', 'Intelligence', 'Endurance', 'Charisma', 'Luck'
] as const satisfies readonly AttributeName[];

export const ATTRIBUTE_RANGES: Readonly<Record<AttributeName, Readonly<{ min: number; max: number }>>> = {
  Strength: { min: -2, max: 3 },
  Dexterity: { min: -2, max: 3 },
  Intelligence: { min: -2, max: 3 },
  Endurance: { min: -2, max: 3 },
  Charisma: { min: -1, max: 1 },
  Luck: { min: -1, max: 1 }
};

export const DIFFICULTY_BASE_THRESHOLDS = {
  'Very Hard': 5,
  Hard: 20,
  Medium: 50,
  Easy: 80,
  'Very Easy': 90
} as const satisfies Readonly<Record<DifficultyClass, number>>;

export const ALLOCATION_BUDGETS = {
  Balanced: { positive: 5, negative: 2 },
  Simplified: { positive: 3, negative: 0 }
} as const satisfies Readonly<Record<AllocationMethod, Readonly<{ positive: number; negative: number }>>>;

export const MIN_SUCCESS_THRESHOLD = 0;
export const MAX_SUCCESS_THRESHOLD = 98;
export const D100_SIDES = 100;
export const ATTRIBUTE_THRESHOLD_STEP = 10;
