import { app, BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppInfo } from '../shared/types';
import { AdventureStore } from './adventure-storage';
import { NewStoryController } from './new-story';
import { ProviderSettingsStore } from './provider-settings';
import { selectStoryProvider } from './providers/active-provider';
import { StoryController } from './story-controller';

const rendererPath = path.join(__dirname, '../renderer/index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const trustedWindowIds = new Set<number>();
let providerSettingsStore: ProviderSettingsStore | null = null;
let activeAdventureStore: AdventureStore | null = null;
let newStoryController: NewStoryController | null = null;
let activeStoryController: StoryController | null = null;

function adventureStore(): AdventureStore {
  if (activeAdventureStore === null) activeAdventureStore = new AdventureStore(app.getPath('userData'));
  return activeAdventureStore;
}

function newStory(): NewStoryController {
  if (newStoryController === null) newStoryController = new NewStoryController(adventureStore());
  return newStoryController;
}

function settingsStore(): ProviderSettingsStore {
  if (providerSettingsStore === null) {
    providerSettingsStore = new ProviderSettingsStore(app.getPath('userData'), safeStorage);
  }
  return providerSettingsStore;
}

function story(): StoryController {
  if (activeStoryController === null) {
    activeStoryController = new StoryController(adventureStore(), () => selectStoryProvider(settingsStore()));
  }
  return activeStoryController;
}

function assertTrustedRequest(event: IpcMainInvokeEvent, args: unknown[], expectedArguments = 0): void {
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (
    !sourceWindow ||
    !trustedWindowIds.has(sourceWindow.id) ||
    sourceWindow.isDestroyed() ||
    event.senderFrame !== sourceWindow.webContents.mainFrame ||
    event.senderFrame?.url !== rendererUrl
  ) {
    throw new Error('Untrusted IPC sender');
  }
  if (args.length !== expectedArguments) {
    throw new TypeError('Unexpected IPC arguments');
  }
}

ipcMain.handle('app:get-info', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  const info: AppInfo = { version: app.getVersion() };
  return info;
});

ipcMain.handle('app:quit', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  setImmediate(() => app.quit());
});

ipcMain.handle('settings:get', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  return settingsStore().getPublicSettings();
});

ipcMain.handle('settings:save', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 1);
  return settingsStore().saveConfiguration(args[0]);
});

ipcMain.handle('settings:set-openai-key', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 2);
  return settingsStore().setOpenAiKey(args[0], args[1]);
});

ipcMain.handle('story:new-request', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  return newStory().request();
});

ipcMain.handle('story:new-resolve', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 2);
  return newStory().resolve(args[0], args[1]);
});

ipcMain.handle('story:start-opening', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 1);
  return story().startOpening(args[0]);
});

ipcMain.handle('story:retry-opening', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  return story().retryOpening();
});

ipcMain.handle('story:restore', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  return story().restore();
});

ipcMain.handle('story:submit-choice', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 2);
  return story().submitChoice(args[0], args[1]);
});

ipcMain.handle('story:retry-turn', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args, 1);
  return story().retryTurn(args[0]);
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    title: 'Mindtraveller',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.removeMenu();
  trustedWindowIds.add(window.id);
  window.on('closed', () => trustedWindowIds.delete(window.id));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  void window.loadFile(rendererPath);
}

void app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
