import { validateCheckSelection } from './action-rules';
import { isStoryState } from './story-memory';
import type { NarrativeCharacter } from './narrative-character';
import type {
  AttributeName,
  Attributes,
  CheckOutcome,
  CheckRecord,
  Choice,
  DifficultyClass,
  ModelOption,
  PendingChoice,
  ProviderKind,
  StoryLanguage,
  StoryState,
  Theme
} from './types';

export interface ModelSelection {
  provider: ProviderKind;
  modelId: string;
}

export interface OpeningRequest {
  language: StoryLanguage;
  modelId: string;
  theme: Theme;
  character: NarrativeCharacter;
  rules: string;
  paragraphTarget: number;
  choiceTarget: number;
}

export interface OpeningResponse {
  premise: string;
  mainObjective: string;
  storyState: StoryState;
  narrative: string;
  choices: Choice[];
}

export interface ActionAssessmentRequest {
  language: StoryLanguage;
  modelId: string;
  context: string;
  /** Local validation input; never duplicated in the provider's messages. */
  recentNarratives?: readonly string[];
  choice: PendingChoice;
  attributes: Attributes;
  paragraphTarget: number;
  choiceTarget: number;
}

export type ActionAssessmentResponse =
  | { kind: 'no-check'; narrative: string; choices: Choice[]; storyState: StoryState }
  | { kind: 'check'; difficulty: DifficultyClass; attribute: AttributeName };

export interface CheckedNarrationRequest {
  language: StoryLanguage;
  modelId: string;
  context: string;
  /** Retain the six-scene validation window even with a smaller context selection. */
  recentNarratives?: readonly string[];
  choice: PendingChoice;
  check: CheckRecord;
  paragraphTarget: number;
  choiceTarget: number;
}

export interface CheckedNarrationResponse {
  outcome: CheckOutcome;
  storyState: StoryState;
  narrative: string;
  choices: Choice[];
}

export type SummaryRequest =
  | { modelId: string; language: StoryLanguage; kind: 'chapter'; chapterNumber: number; context: string }
  | { modelId: string; language: StoryLanguage; kind: 'global'; context: string };

export interface SummaryResponse {
  text: string;
  keyFacts: string[];
  unresolvedThreads: string[];
}

export interface StoryProvider {
  readonly kind: ProviderKind;
  listModels(): Promise<ModelOption[]>;
  generateOpening(request: OpeningRequest): Promise<OpeningResponse>;
  assessAction(request: ActionAssessmentRequest): Promise<ActionAssessmentResponse>;
  narrateCheck(request: CheckedNarrationRequest): Promise<CheckedNarrationResponse>;
  summarize(request: SummaryRequest): Promise<SummaryResponse>;
}

export class ProviderContractError extends Error {
  readonly code = 'invalid-provider-response';

  constructor(message: string) {
    super(message);
    this.name = 'ProviderContractError';
  }
}

export class MalformedNarrativeError extends ProviderContractError {
  constructor() {
    super('Response field syntax leaked into the narrative.');
    this.name = 'MalformedNarrativeError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ProviderContractError('Expected non-empty text.');
  return value.trim();
}

function parseNarrative(value: unknown): string {
  const narrative = nonEmptyText(value);
  // Match response syntax, including incomplete fragments, rather than ordinary
  // prose mentioning choices or a character's state.
  if (/(?:^|[,\n{}])\s*["']?choices["']?\s*:\s*\[\s*(?:\{|$)/iu.test(narrative)
    || /(?:^|[,\n{}])\s*["']?storyState["']?\s*:\s*\{/iu.test(narrative)
    || /(?:^|[,\n{}])\s*"(?:narrative|mainObjective|outcome)"\s*:\s*"/iu.test(narrative)) {
    throw new MalformedNarrativeError();
  }
  return narrative;
}

export function parseStoryState(value: unknown): StoryState {
  if (!isStoryState(value)) throw new ProviderContractError('Malformed story state.');
  return {
    location: value.location === null ? null : value.location.trim(),
    situation: value.situation.trim(),
    currentFocus: value.currentFocus === null ? null : value.currentFocus.trim()
  };
}

function assertChoiceTarget(target: number): void {
  if (!Number.isSafeInteger(target) || target < 1) {
    throw new TypeError('Choice target must be a positive integer.');
  }
}

function parseChoices(value: unknown, expectedCount: number): Choice[] {
  assertChoiceTarget(expectedCount);
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new ProviderContractError('Wrong number of choices.');
  }
  const ids = new Set<string>();
  const texts = new Set<string>();
  return value.map((item: unknown) => {
    if (!isRecord(item) || !hasExactKeys(item, ['id', 'text'])) {
      throw new ProviderContractError('Malformed choice.');
    }
    const id = nonEmptyText(item.id);
    const text = nonEmptyText(item.text);
    const normalizedText = text.toLocaleLowerCase('en');
    if (ids.has(id) || texts.has(normalizedText)) {
      throw new ProviderContractError('Duplicate choice.');
    }
    ids.add(id);
    texts.add(normalizedText);
    return { id, text };
  });
}

export function parseOpeningResponse(value: unknown, choiceTarget: number): OpeningResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['premise', 'narrative', 'choices', 'mainObjective', 'storyState'])) {
    throw new ProviderContractError('Malformed opening response.');
  }
  return {
    premise: nonEmptyText(value.premise),
    mainObjective: nonEmptyText(value.mainObjective),
    storyState: parseStoryState(value.storyState),
    narrative: parseNarrative(value.narrative),
    choices: parseChoices(value.choices, choiceTarget)
  };
}

export function parseActionAssessmentResponse(
  value: unknown,
  choiceTarget: number,
  attributes: Attributes
): ActionAssessmentResponse {
  if (!isRecord(value)) throw new ProviderContractError('Malformed action assessment.');
  if (value.kind === 'no-check') {
    if (!hasExactKeys(value, ['kind', 'narrative', 'choices', 'storyState'])) {
      throw new ProviderContractError('Malformed no-check assessment.');
    }
    return {
      kind: 'no-check',
      storyState: parseStoryState(value.storyState),
      narrative: parseNarrative(value.narrative),
      choices: parseChoices(value.choices, choiceTarget)
    };
  }
  if (value.kind === 'check') {
    if (!hasExactKeys(value, ['kind', 'difficulty', 'attribute'])) {
      throw new ProviderContractError('Malformed check assessment.');
    }
    try {
      const selection = validateCheckSelection(value.difficulty, value.attribute, attributes);
      return { kind: 'check', difficulty: selection.difficulty, attribute: selection.attribute };
    } catch {
      throw new ProviderContractError('Invalid check classification.');
    }
  }
  throw new ProviderContractError('Unknown action assessment kind.');
}

export function parseCheckedNarrationResponse(
  value: unknown,
  choiceTarget: number,
  expectedOutcome: CheckOutcome
): CheckedNarrationResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['outcome', 'narrative', 'choices', 'storyState'])) {
    throw new ProviderContractError('Malformed checked narration.');
  }
  if (value.outcome !== expectedOutcome || (value.outcome !== 'success' && value.outcome !== 'failure')) {
    throw new ProviderContractError('Narration outcome contradicts the saved check.');
  }
  return {
    outcome: value.outcome,
    storyState: parseStoryState(value.storyState),
    narrative: parseNarrative(value.narrative),
    choices: parseChoices(value.choices, choiceTarget)
  };
}

function parseUniqueTextList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ProviderContractError('Malformed summary details.');
  const items = value.map(nonEmptyText);
  if (new Set(items.map((item) => item.toLocaleLowerCase('en'))).size !== items.length) {
    throw new ProviderContractError('Duplicate summary detail.');
  }
  return items;
}

export function parseSummaryResponse(value: unknown): SummaryResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['text', 'keyFacts', 'unresolvedThreads'])) {
    throw new ProviderContractError('Malformed summary response.');
  }
  return {
    text: nonEmptyText(value.text),
    keyFacts: parseUniqueTextList(value.keyFacts),
    unresolvedThreads: parseUniqueTextList(value.unresolvedThreads)
  };
}

export function parseModelOptions(value: unknown): ModelOption[] {
  if (!Array.isArray(value)) throw new ProviderContractError('Malformed model list.');
  const ids = new Set<string>();
  return value.map((option: unknown) => {
    if (!isRecord(option) || !hasExactKeys(option, ['id', 'label'])) {
      throw new ProviderContractError('Malformed model option.');
    }
    const id = nonEmptyText(option.id);
    const label = nonEmptyText(option.label);
    if (ids.has(id)) throw new ProviderContractError('Duplicate model option.');
    ids.add(id);
    return { id, label };
  });
}

export function parseModelSelection(value: unknown): ModelSelection {
  if (!isRecord(value) || !hasExactKeys(value, ['provider', 'modelId'])) {
    throw new TypeError('Invalid model selection.');
  }
  if (value.provider !== 'ollama' && value.provider !== 'openai') {
    throw new TypeError('Unknown provider.');
  }
  if (typeof value.modelId !== 'string' || !value.modelId.trim()) {
    throw new TypeError('Select a model.');
  }
  return { provider: value.provider, modelId: value.modelId.trim() };
}
