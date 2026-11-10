import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mindtraveller', {
  getAppInfo: (): Promise<{ version: string }> => ipcRenderer.invoke('app:get-info'),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
});
