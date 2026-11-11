import { randomUUID } from 'node:crypto';
import type { NewStoryRequest, NewStoryResolution } from '../shared/types';
import type { AdventureStore } from './adventure-storage';

export class NewStoryController {
  private pending: { confirmationId: string; adventureId: string } | null = null;
  private transitions: Promise<void> = Promise.resolve();

  constructor(private readonly store: AdventureStore) {}

  private runExclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.transitions.then(action);
    this.transitions = result.then(() => undefined, () => undefined);
    return result;
  }

  request(): Promise<NewStoryRequest> {
    return this.runExclusive(async () => {
      const adventure = await this.store.load();
      if (adventure === null) {
        this.pending = null;
        return { kind: 'start-creation' };
      }
      this.pending = { confirmationId: randomUUID(), adventureId: adventure.id };
      return { kind: 'confirmation-required', ...this.pending };
    });
  }

  resolve(confirmationId: unknown, decision: unknown): Promise<NewStoryResolution> {
    return this.runExclusive(async () => {
      if (typeof confirmationId !== 'string' || !confirmationId) {
        throw new TypeError('A confirmation ID is required.');
      }
      if (decision !== 'Yes' && decision !== 'No') throw new TypeError('Choose Yes or No.');
      if (!this.pending || this.pending.confirmationId !== confirmationId) {
        throw new Error('No matching New Story confirmation.');
      }

      if (decision === 'No') {
        this.pending = null;
        const adventure = await this.store.load();
        if (adventure === null) throw new Error('The saved adventure changed.');
        return { kind: 'continue-adventure', adventure };
      }

      await this.store.discard(this.pending.adventureId);
      this.pending = null;
      return { kind: 'start-creation' };
    });
  }
}
