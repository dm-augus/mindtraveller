import type {
  Adventure,
  CheckOutcome,
  CheckRecord,
  DifficultyClass,
  Nature,
  PendingTurn,
  ProviderKind,
  ProviderSettings,
  Theme
} from '../src/shared/types';

const validCheck: CheckRecord = {
  difficulty: 'Hard',
  attribute: 'Strength',
  attributeValue: 1,
  baseThreshold: 20,
  threshold: 30,
  roll: 25,
  outcome: 'success'
};

const validAdventure: Adventure = {
  schemaVersion: 1,
  id: 'adventure-1',
  theme: 'High Fantasy',
  character: {
    name: 'Mira',
    gender: 'Woman',
    nature: 'Good',
    allocationMethod: 'Balanced',
    attributes: {
      Strength: 1,
      Dexterity: 1,
      Intelligence: 2,
      Endurance: 1,
      Charisma: -1,
      Luck: -1
    }
  },
  premise: 'A forgotten gate is opening.',
  segments: [{
    id: 'segment-1',
    chapterNumber: 1,
    narrative: 'The road reaches the gate.',
    choices: [{ id: 'choice-1', text: 'Inspect the gate.' }],
    selectedChoiceId: 'choice-1',
    check: null,
    createdAt: '2026-11-10T12:00:00.000Z'
  }],
  chapterSummaries: [],
  globalSummary: '',
  phase: {
    kind: 'pending-narration',
    choice: { turnId: 'turn-2', choiceId: 'choice-1', choiceText: 'Inspect the gate.' },
    check: validCheck
  },
  updatedAt: '2026-11-10T12:00:00.000Z'
};

const validSettings: ProviderSettings = {
  activeProvider: 'ollama',
  ollama: { serverAddress: 'http://127.0.0.1:11434', modelId: 'story-model' },
  openai: { modelId: null, hasSavedKey: false }
};

void validAdventure;
void validSettings;

// @ts-expect-error Unsupported story theme.
const invalidTheme: Theme = 'Science Fiction';
// @ts-expect-error Nature has only three agreed values.
const invalidNature: Nature = 'Chaotic';
// @ts-expect-error Difficulty must be one of the five rule classes.
const invalidDifficulty: DifficultyClass = 'Impossible';
// @ts-expect-error Check outcomes are binary.
const invalidOutcome: CheckOutcome = 'partial';
// @ts-expect-error The provider union excludes unknown services.
const invalidProvider: ProviderKind = 'other';
// @ts-expect-error Narration cannot be pending without its saved roll.
const invalidPending: PendingTurn = {
  kind: 'pending-narration',
  choice: { turnId: 'turn-3', choiceId: 'choice-1', choiceText: 'Inspect the gate.' }
};

void invalidTheme;
void invalidNature;
void invalidDifficulty;
void invalidOutcome;
void invalidProvider;
void invalidPending;
