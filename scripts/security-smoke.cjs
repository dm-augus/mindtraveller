const { app } = require('electron');

const timeout = setTimeout(() => {
  console.error('Security smoke test timed out');
  app.exit(1);
}, 15000);

app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => ({
        nodeProcess: typeof process,
        nodeRequire: typeof require,
        rawIpc: typeof window.ipcRenderer,
        bridgeKeys: Object.keys(window.mindtraveller ?? {}).sort(),
        version: (await window.mindtraveller.getAppInfo()).version,
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content
      }))()`);
      if (
        result.nodeProcess !== 'undefined' ||
        result.nodeRequire !== 'undefined' ||
        result.rawIpc !== 'undefined' ||
        JSON.stringify(result.bridgeKeys) !== JSON.stringify([
          'getAppInfo', 'getProviderSettings', 'quit', 'requestNewStory',
          'resolveNewStory', 'saveProviderConfiguration', 'setOpenAiKey'
        ]) ||
        result.version !== app.getVersion() ||
        !result.csp?.includes("default-src 'none'") ||
        !result.csp?.includes("connect-src 'none'")
      ) {
        throw new Error(`Unexpected renderer security state: ${JSON.stringify(result)}`);
      }
      console.log('Renderer sandbox, preload bridge, IPC, and CSP verified');
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});

require('../dist/main/index.js');
