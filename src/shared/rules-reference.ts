import {
  ALLOCATION_BUDGETS,
  ATTRIBUTE_NAMES,
  ATTRIBUTE_RANGES,
  ATTRIBUTE_THRESHOLD_STEP,
  D100_SIDES,
  DIFFICULTY_BASE_THRESHOLDS,
  MAX_SUCCESS_THRESHOLD,
  MIN_SUCCESS_THRESHOLD
} from './rules';
import type { AttributeName, DifficultyClass } from './types';

export interface RulesSection {
  heading: string;
  text: string;
}

const ATTRIBUTE_EFFECTS: Readonly<Record<AttributeName, string>> = {
  Strength: 'physical force, such as lifting, pushing, or striking',
  Dexterity: 'agility, coordination, and precise movement',
  Intelligence: 'reasoning, knowledge, and interpreting clues',
  Endurance: 'withstanding illness, cold, injury, or exhaustion',
  Charisma: 'social influence and interactions with others',
  Luck: 'outcomes governed mainly by chance'
};

const DIFFICULTY_ORDER = [
  'Very Hard', 'Hard', 'Medium', 'Easy', 'Very Easy'
] as const satisfies readonly DifficultyClass[];

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

// Prompts and the Rules screen consume this same source of English rule text.
export const RULES_SECTIONS: readonly RulesSection[] = [
  {
    heading: 'Story choices',
    text: 'Read each story segment and choose one offered action to continue. The next segment and choices reflect that decision and the established story.'
  },
  {
    heading: 'Attributes',
    text: [
      'Every attribute starts at 0. Values must be whole numbers within these ranges:',
      ...ATTRIBUTE_NAMES.map((name) => {
        const { min, max } = ATTRIBUTE_RANGES[name];
        return `${name}: ${signed(min)} to ${signed(max)} — ${ATTRIBUTE_EFFECTS[name]}.`;
      })
    ].join('\n')
  },
  {
    heading: 'Character creation',
    text: [
      `Balanced allocation requires exactly ${ALLOCATION_BUDGETS.Balanced.positive} positive points and ${ALLOCATION_BUDGETS.Balanced.negative} negative points across the final attribute values.`,
      `Simplified allocation requires exactly ${ALLOCATION_BUDGETS.Simplified.positive} positive points and ${ALLOCATION_BUDGETS.Simplified.negative} negative points.`,
      'Choose a medieval Horror, Romance, or High Fantasy theme, and provide a name, gender, and Nature.'
    ].join('\n')
  },
  {
    heading: 'D100 checks',
    text: [
      'An action needs a D100 check only when its outcome is uncertain. Trivial or guaranteed actions continue without a roll.',
      'For a check, the narrator identifies one relevant attribute and one difficulty class. The application validates them, generates the roll, and determines success or failure. The narrator describes the authoritative outcome.'
    ].join('\n')
  },
  {
    heading: 'Difficulty',
    text: [
      'Base success thresholds:',
      ...DIFFICULTY_ORDER.map((difficulty) => `${difficulty}: ${DIFFICULTY_BASE_THRESHOLDS[difficulty]}.`)
    ].join('\n')
  },
  {
    heading: 'Threshold and result',
    text: [
      `Each attribute point changes the base threshold by ${ATTRIBUTE_THRESHOLD_STEP}. Final threshold = max(${MIN_SUCCESS_THRESHOLD}, min(${MAX_SUCCESS_THRESHOLD}, base threshold + attribute value × ${ATTRIBUTE_THRESHOLD_STEP})).`,
      `The application rolls an integer from 1 to ${D100_SIDES}. The action succeeds when the roll is less than or equal to the final threshold; otherwise it fails. Rolls of 99 and 100 always fail. A threshold of 0 cannot succeed.`
    ].join('\n')
  },
  {
    heading: 'Nature',
    text: 'Nature is Good, Neutral, or Bad. It influences suggested actions and how the story reacts, but never changes D100 odds or forbids a plausible action of another moral alignment.'
  }
];

export const GAME_RULES_TEXT = RULES_SECTIONS.map(({ heading, text }) => `${heading}\n${text}`).join('\n\n');
