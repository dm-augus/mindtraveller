import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppInfo,
  NewStoryRequest,
  NewStoryResolution,
  ProviderConfiguration,
  ProviderSettings
} from '../shared/types';

contextBridge.exposeInMainWorld('mindtraveller', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:get-info'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  getProviderSettings: (): Promise<ProviderSettings> => ipcRenderer.invoke('settings:get'),
  saveProviderConfiguration: (configuration: ProviderConfiguration): Promise<ProviderSettings> =>
    ipcRenderer.invoke('settings:save', configuration),
  setOpenAiKey: (key: string, persist: boolean): Promise<{ persisted: boolean }> =>
    ipcRenderer.invoke('settings:set-openai-key', key, persist),
  requestNewStory: (): Promise<NewStoryRequest> => ipcRenderer.invoke('story:new-request'),
  resolveNewStory: (confirmationId: string, decision: 'Yes' | 'No'): Promise<NewStoryResolution> =>
    ipcRenderer.invoke('story:new-resolve', confirmationId, decision)
});
