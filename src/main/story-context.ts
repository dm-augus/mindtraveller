import type {
  ActionAssessmentRequest,
  CheckedNarrationRequest,
  OpeningRequest
} from '../shared/provider-contract';
import { GAME_RULES_TEXT } from '../shared/rules-reference';
import type { Adventure, Choice, StorySegment } from '../shared/types';
import { createStoryConfiguration, type StoryConfiguration } from './story-config';

/** Conservative size heuristic, not a provider-specific tokenizer. */
export function estimateContextTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
}

export class StoryContextBudgetError extends Error {
  readonly code = 'context-budget-exceeded';

  constructor(readonly estimatedTokens: number, readonly budgetTokens: number) {
    super('Story context exceeds its configured budget. Summarize older events or increase the internal context budget.');
    this.name = 'StoryContextBudgetError';
  }
}

export function selectedChoice(segment: StorySegment): Choice | null {
  if (segment.selectedChoiceId === null) return null;
  const choice = segment.choices.find((available) => available.id === segment.selectedChoiceId);
  if (!choice) throw new TypeError('A selected story choice is missing from its source segment.');
  return { id: choice.id, text: choice.text };
}

function latestDecision(adventure: Adventure): Choice | null {
  const phase = adventure.phase;
  if (phase.kind === 'pending-assessment' || phase.kind === 'pending-narration') {
    return { id: phase.choice.choiceId, text: phase.choice.choiceText };
  }
  for (let index = adventure.segments.length - 1; index >= 0; index -= 1) {
    const choice = selectedChoice(adventure.segments[index]);
    if (choice) return choice;
  }
  return null;
}

export class StoryContextBuilder {
  readonly configuration: Readonly<StoryConfiguration>;

  constructor(overrides: Partial<StoryConfiguration> = {}) {
    this.configuration = createStoryConfiguration(overrides);
  }

  private requireBudget(text: string): void {
    const estimatedTokens = estimateContextTokens(text);
    if (estimatedTokens > this.configuration.contextBudgetTokens) {
      throw new StoryContextBudgetError(estimatedTokens, this.configuration.contextBudgetTokens);
    }
  }

  build(adventure: Adventure): string {
    const phase = adventure.phase;
    const context = JSON.stringify({
      rules: GAME_RULES_TEXT,
      theme: adventure.theme,
      character: adventure.character,
      premise: adventure.premise,
      globalSummary: adventure.globalSummary,
      chapterSummaries: adventure.chapterSummaries,
      recentEvents: adventure.segments.slice(-this.configuration.recentEventCount).map((segment) => ({
        segmentId: segment.id,
        chapterNumber: segment.chapterNumber,
        narrative: segment.narrative,
        decision: selectedChoice(segment),
        check: segment.check
      })),
      latestDecision: latestDecision(adventure),
      latestCheck: phase.kind === 'pending-narration' ? phase.check
        : phase.kind === 'pending-assessment' ? null : adventure.segments.at(-1)?.check ?? null
    });
    // Never send oversized context or mutate saved detail to make it fit.
    this.requireBudget(context);
    return context;
  }

  openingRequest(modelId: string, setup: Pick<Adventure, 'theme' | 'character'>): OpeningRequest {
    const request: OpeningRequest = {
      modelId,
      theme: setup.theme,
      character: structuredClone(setup.character),
      rules: GAME_RULES_TEXT,
      paragraphTarget: this.configuration.paragraphTarget,
      choiceTarget: this.configuration.choiceTarget
    };
    this.requireBudget(JSON.stringify(request));
    return request;
  }

  assessmentRequest(modelId: string, adventure: Adventure): ActionAssessmentRequest {
    if (adventure.phase.kind !== 'pending-assessment') {
      throw new TypeError('Action assessment requires a saved pending choice.');
    }
    return {
      modelId,
      context: this.build(adventure),
      choice: { ...adventure.phase.choice },
      attributes: { ...adventure.character.attributes },
      paragraphTarget: this.configuration.paragraphTarget,
      choiceTarget: this.configuration.choiceTarget
    };
  }

  narrationRequest(modelId: string, adventure: Adventure): CheckedNarrationRequest {
    if (adventure.phase.kind !== 'pending-narration') {
      throw new TypeError('Checked narration requires a saved check result.');
    }
    return {
      modelId,
      context: this.build(adventure),
      choice: { ...adventure.phase.choice },
      check: { ...adventure.phase.check },
      paragraphTarget: this.configuration.paragraphTarget,
      choiceTarget: this.configuration.choiceTarget
    };
  }
}
