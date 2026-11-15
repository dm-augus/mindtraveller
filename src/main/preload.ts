import type { IpcResult } from '../shared/app-error';
import { contextBridge, ipcRenderer } from 'electron';
import type { CharacterSetup } from '../shared/character-rules';
import type { StoryPreferences } from '../shared/types';
import type { HistoryExportResult } from '../shared/types';
import type {
  Adventure,
  ChoiceTurnResult,
  AppInfo,
  NewStoryRequest,
  NewStoryResolution,
  ModelOption,
  ProviderKind,
  ProviderConfiguration,
  ProviderSettings
} from '../shared/types';

// Sandboxed preloads cannot require application modules at runtime. Keep this
// unwrapping helper local and use a data-only error marker across contextBridge,
// which does not preserve custom Error properties.
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>;
  if (!result.ok) throw new Error('__MINDTRAVELLER_ERROR__' + JSON.stringify(result.error));
  return result.value;
}

contextBridge.exposeInMainWorld('mindtraveller', {
  exportHistory: (): Promise<HistoryExportResult> => invoke('story:export-history'),
  getStoryPreferences: (): Promise<StoryPreferences> => invoke('preferences:get'),
  saveStoryPreferences: (preferences: Partial<StoryPreferences>): Promise<StoryPreferences> => invoke('preferences:save', preferences),
  getAppInfo: (): Promise<AppInfo> => invoke('app:get-info'),
  quit: (): Promise<void> => invoke('app:quit'),
  getProviderSettings: (): Promise<ProviderSettings> => invoke('settings:get'),
  saveProviderConfiguration: (configuration: ProviderConfiguration): Promise<ProviderSettings> =>
    invoke('settings:save', configuration),
  setOpenAiKey: (key: string, persist: boolean): Promise<{ persisted: boolean }> =>
    invoke('settings:set-openai-key', key, persist),
  listProviderModels: (provider: ProviderKind, address: string | null): Promise<ModelOption[]> =>
    invoke('settings:list-models', provider, address),
  requestNewStory: (): Promise<NewStoryRequest> => invoke('story:new-request'),
  resolveNewStory: (confirmationId: string, decision: 'Yes' | 'No'): Promise<NewStoryResolution> =>
    invoke('story:new-resolve', confirmationId, decision),
  startOpening: (setup: CharacterSetup): Promise<Adventure> => invoke('story:start-opening', setup),
  retryOpening: (): Promise<Adventure> => invoke('story:retry-opening'),
  restoreAdventure: (): Promise<Adventure | null> => invoke('story:restore'),
  submitChoice: (segmentId: string, choiceId: string): Promise<ChoiceTurnResult> =>
    invoke('story:submit-choice', segmentId, choiceId),
  retryTurn: (turnId: string): Promise<ChoiceTurnResult> => invoke('story:retry-turn', turnId)
});
