import { parseModelSelection, type StoryProvider } from '../../shared/provider-contract';
import { AppTypeError } from '../../shared/app-error';
import type { ProviderSettingsStore } from '../provider-settings';
import { OllamaAdapter } from './ollama';
import { OpenAiAdapter } from './openai';

export interface SelectedStoryProvider {
  provider: StoryProvider;
  modelId: string;
}

export type StoryProviderSource = () => Promise<SelectedStoryProvider>;

export async function selectStoryProvider(
  settings: Pick<ProviderSettingsStore, 'getPublicSettings' | 'getOpenAiKeyForRequest'>
): Promise<SelectedStoryProvider> {
  const configuration = await settings.getPublicSettings();
  const provider = configuration.activeProvider;
  const modelId = configuration[provider].modelId;
  if (modelId === null) throw new AppTypeError('error.modelSettings', { provider: provider === 'ollama' ? 'Ollama' : 'OpenAI' });
  const selection = parseModelSelection({ provider, modelId });
  return {
    modelId: selection.modelId,
    provider: provider === 'ollama'
      ? new OllamaAdapter(configuration.ollama.serverAddress) : new OpenAiAdapter(settings)
  };
}
