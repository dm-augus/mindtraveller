import type {
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
    };
  }
}
