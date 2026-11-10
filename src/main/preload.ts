import { contextBridge, ipcRenderer } from 'electron';
import type { AppInfo } from '../shared/types';

contextBridge.exposeInMainWorld('mindtraveller', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:get-info'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
});
