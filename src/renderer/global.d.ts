import type { CharacterSetup } from '../shared/character-rules';
import type {
  Adventure,
  ChoiceTurnResult,
  AppInfo,
  NewStoryRequest,
  NewStoryResolution,
  ProviderConfiguration,
  ProviderSettings
} from '../shared/types';

export {};

declare global {
  interface Window {
    mindtraveller: {
      getAppInfo(): Promise<AppInfo>;
      quit(): Promise<void>;
      getProviderSettings(): Promise<ProviderSettings>;
      saveProviderConfiguration(configuration: ProviderConfiguration): Promise<ProviderSettings>;
      setOpenAiKey(key: string, persist: boolean): Promise<{ persisted: boolean }>;
      requestNewStory(): Promise<NewStoryRequest>;
      resolveNewStory(confirmationId: string, decision: 'Yes' | 'No'): Promise<NewStoryResolution>;
      startOpening(setup: CharacterSetup): Promise<Adventure>;
      retryOpening(): Promise<Adventure>;
      restoreAdventure(): Promise<Adventure | null>;
      submitChoice(segmentId: string, choiceId: string): Promise<ChoiceTurnResult>;
      retryTurn(turnId: string): Promise<ChoiceTurnResult>;
    };
  }
}
