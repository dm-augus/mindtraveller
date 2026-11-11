import { randomUUID } from 'node:crypto';
import { validateCharacterSetup } from '../shared/character-rules';
import { parseActionAssessmentResponse, parseModelSelection, parseOpeningResponse } from '../shared/provider-contract';
import type { Adventure, ChoiceTurnResult } from '../shared/types';
import { AdventureProgress } from './adventure-progress';
import type { AdventureStore } from './adventure-storage';
import type { SelectedStoryProvider, StoryProviderSource } from './providers/active-provider';
import type { StoryConfiguration } from './story-config';
import { StoryContextBuilder } from './story-context';
import { StorySummarizer } from './story-summarizer';

export class StoryController {
  private generationInFlight = false;
  private readonly context: StoryContextBuilder;
  private readonly progress: AdventureProgress;
  private readonly summaries: StorySummarizer;

  constructor(
    private readonly store: AdventureStore,
    private readonly providerSource: StoryProviderSource,
    configuration: Partial<StoryConfiguration> = {}
  ) {
    this.context = new StoryContextBuilder(configuration);
    this.progress = new AdventureProgress(store);
    this.summaries = new StorySummarizer(configuration);
  }

  private async runGeneration<T>(action: () => Promise<T>): Promise<T> {
    if (this.generationInFlight) throw new Error('Story generation is already pending.');
    this.generationInFlight = true;
    try {
      return await action();
    } finally {
      this.generationInFlight = false;
    }
  }

  restore(): Promise<Adventure | null> {
    return this.store.load();
  }

  startOpening(input: unknown): Promise<Adventure> {
    return this.runGeneration(async () => {
      const setup = validateCharacterSetup(input);
      if (!setup.valid) throw new TypeError(setup.errors.join(' '));
      if (await this.store.load() !== null) {
        throw new Error('An adventure is already saved. Confirm New Story before replacing it.');
      }
      const pending: Adventure = {
        schemaVersion: 1,
        id: randomUUID(),
        theme: setup.value.theme,
        character: setup.value.character,
        premise: null,
        segments: [],
        chapterSummaries: [],
        globalSummary: '',
        phase: { kind: 'pending-opening', turnId: randomUUID() },
        updatedAt: new Date().toISOString()
      };
      const selected = await this.providerSource();
      const request = this.openingRequest(pending, selected);
      await this.store.saveIfUnchanged(null, pending);
      return this.generateOpening(pending, selected, request);
    });
  }

  retryOpening(): Promise<Adventure> {
    return this.runGeneration(async () => {
      const pending = await this.store.load();
      if (!pending || pending.phase.kind !== 'pending-opening' || pending.segments.length || pending.premise !== null) {
        throw new Error('No opening is awaiting generation.');
      }
      const selected = await this.providerSource();
      return this.generateOpening(pending, selected, this.openingRequest(pending, selected));
    });
  }

  submitChoice(segmentId: unknown, choiceId: unknown): Promise<ChoiceTurnResult> {
    return this.runGeneration(async () => this.assessTurn(await this.progress.beginTurn(segmentId, choiceId)));
  }

  retryTurn(turnId: unknown): Promise<ChoiceTurnResult> {
    return this.runGeneration(async () => {
      if (typeof turnId !== 'string' || !turnId.trim()) throw new TypeError('A pending turn ID is required.');
      const pending = await this.store.load();
      if (!pending || pending.phase.kind !== 'pending-assessment' || pending.phase.choice.turnId !== turnId) {
        throw new Error('No matching turn awaits assessment.');
      }
      return this.assessTurn(pending);
    });
  }

  private async assessTurn(pending: Adventure): Promise<ChoiceTurnResult> {
    if (pending.phase.kind !== 'pending-assessment') throw new Error('No matching turn awaits assessment.');
    const selected = await this.providerSource();
    const selection = parseModelSelection({ provider: selected.provider.kind, modelId: selected.modelId });
    const request = this.context.assessmentRequest(selection.modelId, pending);
    const response = parseActionAssessmentResponse(
      await selected.provider.assessAction(request), this.context.configuration.choiceTarget, pending.character.attributes
    );
    if (response.kind === 'check') {
      // Return the validated classification to checked-turn orchestration without losing the selected turn.
      const current = await this.store.load();
      if (!current || current.id !== pending.id || current.phase.kind !== 'pending-assessment'
        || current.phase.choice.turnId !== pending.phase.choice.turnId) {
        throw new Error('The saved adventure changed. Restore the current adventure before retrying.');
      }
      return { kind: 'check-required', adventure: current, difficulty: response.difficulty, attribute: response.attribute };
    }
    const createdAt = new Date().toISOString();
    const completed = await this.progress.commitTurn(pending.phase.choice.turnId, {
      id: pending.phase.choice.turnId,
      chapterNumber: this.summaries.nextChapterNumber(pending),
      narrative: response.narrative,
      choices: response.choices,
      selectedChoiceId: null,
      check: null,
      createdAt
    });
    return { kind: 'continued', adventure: completed };
  }

  private openingRequest(adventure: Adventure, selected: SelectedStoryProvider) {
    const selection = parseModelSelection({ provider: selected.provider.kind, modelId: selected.modelId });
    return this.context.openingRequest(selection.modelId, adventure);
  }

  private async generateOpening(
    pending: Adventure,
    selected: SelectedStoryProvider,
    request: ReturnType<StoryContextBuilder['openingRequest']>
  ): Promise<Adventure> {
    if (pending.phase.kind !== 'pending-opening') throw new Error('No opening is awaiting generation.');
    const response = parseOpeningResponse(await selected.provider.generateOpening(request), request.choiceTarget);
    const createdAt = new Date().toISOString();
    const completed: Adventure = {
      ...pending,
      premise: response.premise,
      segments: [{
        id: pending.phase.turnId,
        chapterNumber: 1,
        narrative: response.narrative,
        choices: response.choices,
        selectedChoiceId: null,
        check: null,
        createdAt
      }],
      phase: { kind: 'ready' },
      updatedAt: createdAt
    };
    await this.store.saveIfUnchanged(pending, completed);
    return completed;
  }
}
