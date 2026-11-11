import { randomUUID } from 'node:crypto';
import { rollCheck } from './action-resolution';
import type { Adventure, CheckRecord, PendingChoice, StorySegment } from '../shared/types';
import type { AdventureStore } from './adventure-storage';

function sameCheck(left: CheckRecord | null, right: CheckRecord): boolean {
  return left !== null
    && left.difficulty === right.difficulty
    && left.attribute === right.attribute
    && left.attributeValue === right.attributeValue
    && left.baseThreshold === right.baseThreshold
    && left.threshold === right.threshold
    && left.roll === right.roll
    && left.outcome === right.outcome;
}

export class AdventureProgress {
  private transitions: Promise<void> = Promise.resolve();

  constructor(private readonly store: AdventureStore) {}

  private runExclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.transitions.then(action);
    this.transitions = result.then(() => undefined, () => undefined);
    return result;
  }

  private async requireAdventure(): Promise<Adventure> {
    const adventure = await this.store.load();
    if (adventure === null) throw new Error('No active adventure.');
    return adventure;
  }

  restore(): Promise<Adventure | null> {
    return this.runExclusive(() => this.store.load());
  }

  selectChoice(choiceId: string): Promise<PendingChoice> {
    return this.runExclusive(async () => {
      const adventure = await this.requireAdventure();
      if (adventure.phase.kind === 'pending-assessment' || adventure.phase.kind === 'pending-narration') {
        if (adventure.phase.choice.choiceId === choiceId) return adventure.phase.choice;
        throw new Error('A different choice is already pending.');
      }
      if (adventure.phase.kind !== 'ready') throw new Error('The adventure is not ready for a choice.');

      const current = adventure.segments.at(-1);
      if (!current || current.selectedChoiceId !== null) throw new Error('No unselected story choices are available.');
      const choice = current.choices.find((available) => available.id === choiceId);
      if (!choice) throw new TypeError('Unknown story choice.');

      const pending: PendingChoice = { turnId: randomUUID(), choiceId: choice.id, choiceText: choice.text };
      const next: Adventure = {
        ...adventure,
        segments: [...adventure.segments.slice(0, -1), { ...current, selectedChoiceId: choice.id }],
        phase: { kind: 'pending-assessment', choice: pending },
        updatedAt: new Date().toISOString()
      };
      await this.store.save(next);
      return pending;
    });
  }

  recordCheck(turnId: string, difficulty: unknown, attribute: unknown): Promise<CheckRecord> {
    return this.runExclusive(async () => {
      const adventure = await this.requireAdventure();
      if (adventure.phase.kind === 'pending-narration') {
        if (adventure.phase.choice.turnId !== turnId) throw new Error('Unknown pending turn.');
        return adventure.phase.check;
      }
      if (adventure.phase.kind !== 'pending-assessment' || adventure.phase.choice.turnId !== turnId) {
        throw new Error('No matching turn awaits a check.');
      }

      const check = rollCheck(difficulty, attribute, adventure.character.attributes);
      const next: Adventure = {
        ...adventure,
        phase: { kind: 'pending-narration', choice: adventure.phase.choice, check },
        updatedAt: new Date().toISOString()
      };
      await this.store.save(next);
      return check;
    });
  }

  commitTurn(turnId: string, segment: StorySegment): Promise<Adventure> {
    return this.runExclusive(async () => {
      const adventure = await this.requireAdventure();
      const phase = adventure.phase;
      if ((phase.kind !== 'pending-assessment' && phase.kind !== 'pending-narration')
        || phase.choice.turnId !== turnId) {
        throw new Error('No matching turn awaits completion.');
      }
      if (adventure.segments.some((existing) => existing.id === segment.id)) {
        throw new TypeError('Duplicate story segment.');
      }
      if (segment.selectedChoiceId !== null) {
        throw new TypeError('A new segment cannot contain a selected choice.');
      }
      if (phase.kind === 'pending-assessment' && segment.check !== null) {
        throw new TypeError('A no-check turn cannot contain a check result.');
      }
      if (phase.kind === 'pending-narration' && !sameCheck(segment.check, phase.check)) {
        throw new TypeError('Narration must retain the saved check result.');
      }

      const next: Adventure = {
        ...adventure,
        segments: [...adventure.segments, segment],
        phase: { kind: 'ready' },
        updatedAt: new Date().toISOString()
      };
      await this.store.save(next);
      return next;
    });
  }
}
