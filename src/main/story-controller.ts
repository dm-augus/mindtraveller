import { randomUUID } from 'node:crypto';
import { validateCharacterSetup } from '../shared/character-rules';
import { parseModelSelection, parseOpeningResponse } from '../shared/provider-contract';
import type { Adventure } from '../shared/types';
import type { AdventureStore } from './adventure-storage';
import type { SelectedStoryProvider, StoryProviderSource } from './providers/active-provider';
import type { StoryConfiguration } from './story-config';
import { StoryContextBuilder } from './story-context';

export class StoryController {
  private openingInFlight = false;
  private readonly context: StoryContextBuilder;

  constructor(
    private readonly store: AdventureStore,
    private readonly providerSource: StoryProviderSource,
    configuration: Partial<StoryConfiguration> = {}
  ) {
    this.context = new StoryContextBuilder(configuration);
  }

  private async runOpening(action: () => Promise<Adventure>): Promise<Adventure> {
    if (this.openingInFlight) throw new Error('Story generation is already pending.');
    this.openingInFlight = true;
    try {
      return await action();
    } finally {
      this.openingInFlight = false;
    }
  }

  restore(): Promise<Adventure | null> {
    return this.store.load();
  }

  startOpening(input: unknown): Promise<Adventure> {
    return this.runOpening(async () => {
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
    return this.runOpening(async () => {
      const pending = await this.store.load();
      if (!pending || pending.phase.kind !== 'pending-opening' || pending.segments.length || pending.premise !== null) {
        throw new Error('No opening is awaiting generation.');
      }
      const selected = await this.providerSource();
      return this.generateOpening(pending, selected, this.openingRequest(pending, selected));
    });
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
