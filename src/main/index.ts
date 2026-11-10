import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rendererPath = path.join(__dirname, '../renderer/index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const trustedWindowIds = new Set<number>();

function assertTrustedRequest(event: IpcMainInvokeEvent, args: unknown[]): void {
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
  if (args.length !== 0) {
    throw new TypeError('Unexpected IPC arguments');
  }
}

ipcMain.handle('app:get-info', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  return { version: app.getVersion() };
});

ipcMain.handle('app:quit', (event, ...args: unknown[]) => {
  assertTrustedRequest(event, args);
  setImmediate(() => app.quit());
});

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    title: 'Mindtraveller',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

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
