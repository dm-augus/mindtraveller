import { randomInt } from 'node:crypto';
import { createCheckRecord, validateCheckSelection } from '../shared/action-rules';
import { D100_SIDES } from '../shared/rules';
import type { CheckRecord } from '../shared/types';

export function rollCheck(difficulty: unknown, attribute: unknown, attributes: unknown): CheckRecord {
  // Validate the model's classification before consuming a roll.
  const selection = validateCheckSelection(difficulty, attribute, attributes);
  return createCheckRecord(selection, randomInt(1, D100_SIDES + 1));
}
