import { MalformedNarrativeError, ProviderContractError } from '../../shared/provider-contract';
import { structuredContext, type ProviderMessage } from './story-prompts';

export class DuplicateNarrativeError extends ProviderContractError {
  constructor() {
    super('The continuation repeats a recent scene.');
    this.name = 'DuplicateNarrativeError';
  }
}

function normalizedNarrative(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

export function assertFreshNarrative(narrative: string, recentNarratives: readonly string[]): void {
  const normalized = normalizedNarrative(narrative);
  const words = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const currentWords = ` ${words(normalized)} `;
  if (recentNarratives.slice(-6).some(previous => {
    const prior = normalizedNarrative(previous);
    if (prior === normalized) return true;
    const priorWords = words(prior);
    // Reject a copied substantial scene padded with a small introduction or tail.
    // Short quotations and a recap followed by substantial new action remain valid.
    return priorWords.split(' ').length >= 30
      && currentWords.includes(` ${priorWords} `)
      && priorWords.length / currentWords.trim().length >= 0.8;
  })) {
    throw new DuplicateNarrativeError();
  }
}

export function validateFreshContinuation<T extends { narrative: string }>(
  response: T, context: string, recentNarratives?: readonly string[]
): T {
  if (recentNarratives !== undefined) {
    assertFreshNarrative(response.narrative, recentNarratives);
    return response;
  }
  const parsed = structuredContext(context);
  if (typeof parsed === 'object' && parsed !== null && 'recentEvents' in parsed && Array.isArray(parsed.recentEvents)) {
    const narratives = parsed.recentEvents.flatMap((event: unknown) =>
      typeof event === 'object' && event !== null && 'narrative' in event && typeof event.narrative === 'string'
        ? [event.narrative] : []);
    assertFreshNarrative(response.narrative, narratives);
  }
  return response;
}

export function withContinuationGuidance(messages: ProviderMessage[], error?: ProviderContractError): ProviderMessage[] {
  if (!(error instanceof DuplicateNarrativeError) && !(error instanceof MalformedNarrativeError)) return messages;
  const reason = error instanceof MalformedNarrativeError
    ? 'The previous narrative contained response-field syntax and was rejected. Keep choices, storyState, and other JSON fields outside the narrative string. Return clean story prose in narrative.'
    : 'The previous continuation repeated a recent scene and was rejected. Do not copy a previous scene with a small addition.';
  return messages.map(message => message.role === 'system' ? {
    ...message,
    content: `${message.content}\n${reason} Generate a fresh consequence of the SAME selected action using the SAME saved check if supplied. Advance beyond the existing scene and update storyState to its resulting situation.`
  } : message);
}
