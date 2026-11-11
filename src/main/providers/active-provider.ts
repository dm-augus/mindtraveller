import { parseModelSelection, type StoryProvider } from '../../shared/provider-contract';
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
  if (modelId === null) throw new TypeError(`Select an ${provider === 'ollama' ? 'Ollama' : 'OpenAI'} model in Settings.`);
  const selection = parseModelSelection({ provider, modelId });
  return {
    modelId: selection.modelId,
    provider: provider === 'ollama'
      ? new OllamaAdapter(configuration.ollama.serverAddress) : new OpenAiAdapter(settings)
  };
}
