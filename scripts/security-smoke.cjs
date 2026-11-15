const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync(path.resolve('out'), { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.resolve('out/security-profile-')));

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
        invalidChoiceRejected: await window.mindtraveller.submitChoice(null, 'wait')
          .then(() => false, (error) => error.message.includes('"key":"error.choiceId"')),
        invalidTurnRejected: await window.mindtraveller.retryTurn(null)
          .then(() => false, (error) => error.message.includes('"key":"error.turnId"')),
        invalidPreferencesRejected: await window.mindtraveller.saveStoryPreferences({ defaultStoryLanguage: 'fr' })
          .then(() => false, () => true),
        csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content
      }))()`);
      if (
        result.nodeProcess !== 'undefined' ||
        result.nodeRequire !== 'undefined' ||
        result.rawIpc !== 'undefined' ||
        JSON.stringify(result.bridgeKeys) !== JSON.stringify([
          'exportHistory', 'getAppInfo', 'getProviderSettings', 'getStoryPreferences', 'listProviderModels', 'quit', 'requestNewStory',
          'resolveNewStory', 'restoreAdventure', 'retryOpening', 'retryTurn', 'saveProviderConfiguration',
          'saveStoryPreferences', 'setOpenAiKey', 'startOpening', 'submitChoice'
        ].sort()) ||
        result.version !== app.getVersion() ||
        !result.invalidChoiceRejected ||
        !result.invalidTurnRejected ||
        !result.invalidPreferencesRejected ||
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
