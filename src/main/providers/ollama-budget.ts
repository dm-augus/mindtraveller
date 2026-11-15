import { estimateContextTokens, StoryContextBudgetError } from '../story-context';
import type { ProviderMessage } from './story-prompts';

export const OLLAMA_GENERATION_OPTIONS = Object.freeze({ num_ctx: 8192, num_predict: 1536 });
export const OLLAMA_INPUT_BUDGET = OLLAMA_GENERATION_OPTIONS.num_ctx - OLLAMA_GENERATION_OPTIONS.num_predict - 256;

export function requireOllamaMessageBudget(messages: ProviderMessage[]): void {
  const estimated = estimateContextTokens(JSON.stringify(messages));
  if (estimated > OLLAMA_INPUT_BUDGET) throw new StoryContextBudgetError(estimated, OLLAMA_INPUT_BUDGET);
}
