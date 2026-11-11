import type {
  ActionAssessmentRequest,
  ActionAssessmentResponse,
  CheckedNarrationRequest,
  ModelSelection,
  OpeningRequest,
  StoryProvider,
  SummaryRequest
} from '../src/shared/provider-contract';
import type { Character, Choice, CheckRecord, PendingChoice } from '../src/shared/types';

const character: Character = {
  name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
  attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
};
const choice: PendingChoice = { turnId: 'turn-1', choiceId: 'gate', choiceText: 'Open the gate.' };
const choices: Choice[] = [{ id: 'wait', text: 'Wait for dawn.' }];
const check: CheckRecord = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};
const selection: ModelSelection = { provider: 'ollama', modelId: 'local-story' };
const opening: OpeningRequest = {
  modelId: selection.modelId, theme: 'Horror', character, rules: 'D100 rules',
  paragraphTarget: 2, choiceTarget: 3
};
const assessment: ActionAssessmentRequest = {
  modelId: selection.modelId, context: 'Current story', choice,
  attributes: character.attributes,
  paragraphTarget: 2, choiceTarget: 3
};
const narration: CheckedNarrationRequest = { ...assessment, check };
const chapterSummary: SummaryRequest = {
  modelId: selection.modelId, kind: 'chapter', chapterNumber: 1, context: 'Chapter events'
};
const globalSummary: SummaryRequest = {
  modelId: selection.modelId, kind: 'global', context: 'Chapter summaries'
};

const provider: StoryProvider = {
  kind: 'ollama',
  listModels: async () => [{ id: 'local-story', label: 'Local Story' }],
  generateOpening: async () => ({ premise: 'A bell rings.', narrative: 'The gate opens.', choices }),
  assessAction: async (): Promise<ActionAssessmentResponse> => ({
    kind: 'check', difficulty: 'Hard', attribute: 'Strength'
  }),
  narrateCheck: async () => ({ outcome: 'success', narrative: 'The gate gives way.', choices }),
  summarize: async () => ({ text: 'The gate opened.', keyFacts: [], unresolvedThreads: [] })
};

// @ts-expect-error Provider selection only supports Ollama and OpenAI.
const invalidSelection: ModelSelection = { provider: 'other', modelId: 'x' };
// @ts-expect-error A check assessment must name an attribute.
const invalidAssessment: ActionAssessmentResponse = { kind: 'check', difficulty: 'Hard' };
// @ts-expect-error A checked narration request needs the authoritative result.
const invalidNarration: CheckedNarrationRequest = { ...assessment };

void opening;
void assessment;
void narration;
void chapterSummary;
void globalSummary;
void provider;
void invalidSelection;
void invalidAssessment;
void invalidNarration;
