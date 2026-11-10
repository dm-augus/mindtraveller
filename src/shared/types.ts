export type Theme = 'Horror' | 'Romance' | 'High Fantasy';
export type Nature = 'Good' | 'Neutral' | 'Bad';
export type AllocationMethod = 'Balanced' | 'Simplified';

export type AttributeName =
  | 'Strength'
  | 'Dexterity'
  | 'Intelligence'
  | 'Endurance'
  | 'Charisma'
  | 'Luck';

export type Attributes = Record<AttributeName, number>;

export interface Character {
  name: string;
  gender: string;
  nature: Nature;
  allocationMethod: AllocationMethod;
  attributes: Attributes;
}

export interface Choice {
  id: string;
  text: string;
}

export type DifficultyClass = 'Very Hard' | 'Hard' | 'Medium' | 'Easy' | 'Very Easy';
export type CheckOutcome = 'success' | 'failure';

export interface CheckRecord {
  difficulty: DifficultyClass;
  attribute: AttributeName;
  attributeValue: number;
  baseThreshold: number;
  threshold: number;
  roll: number;
  outcome: CheckOutcome;
}

export interface StorySegment {
  id: string;
  chapterNumber: number;
  narrative: string;
  choices: Choice[];
  selectedChoiceId: string | null;
  check: CheckRecord | null;
  createdAt: string;
}

export interface ChapterSummary {
  chapterNumber: number;
  throughSegmentId: string;
  text: string;
}

export interface PendingChoice {
  turnId: string;
  choiceId: string;
  choiceText: string;
}

export type PendingTurn =
  | { kind: 'pending-assessment'; choice: PendingChoice }
  | { kind: 'pending-narration'; choice: PendingChoice; check: CheckRecord };

export type AdventurePhase =
  | { kind: 'ready' }
  | { kind: 'pending-opening' }
  | PendingTurn
  | { kind: 'pending-summary'; chapterNumber: number };

export interface Adventure {
  schemaVersion: 1;
  id: string;
  theme: Theme;
  character: Character;
  premise: string | null;
  segments: StorySegment[];
  chapterSummaries: ChapterSummary[];
  globalSummary: string;
  phase: AdventurePhase;
  updatedAt: string;
}

export type ProviderKind = 'ollama' | 'openai';

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderSettings {
  activeProvider: ProviderKind;
  ollama: {
    serverAddress: string;
    modelId: string | null;
  };
  openai: {
    modelId: string | null;
    hasSavedKey: boolean;
  };
}

export interface AppInfo {
  version: string;
}
