const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { AdventureStore } = require('../dist/main/adventure-storage.js');

// Drive the installed executable through Chromium's debugging protocol, without modifying it.
const executable = path.resolve(process.argv[2] || '');
const output = path.resolve(__dirname, '../out/installed-smoke');
const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
async function until(operation) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const value = await operation();
    if (value) return value;
    await delay();
  }
  throw new Error('Installed app check timed out.');
}
async function launch(profile) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-port=0'],
    { env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => { stderr += error.message; });
  const exit = new Promise((resolve) => child.once('exit', (code) => resolve({ code })));
  let socket;
  try {
    const endpoint = await until(() => {
      assert.equal(child.exitCode, null, stderr);
      return stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    });
    const origin = new URL(endpoint).origin.replace('ws:', 'http:');
    const page = await until(async () => (await (await fetch(`${origin}/json/list`)).json())
      .find((target) => target.type === 'page' && target.url.startsWith('file:')));
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    let id = 0;
    const pending = new Map();
    socket.on('message', (data) => {
      const message = JSON.parse(data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    const send = (method, params) => new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (fn) => {
      const result = await send('Runtime.evaluate', {
        expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true
      });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await until(() => evaluate(() => document.querySelector('.app-shell')?.dataset.loading === 'false'));
    return { child, exit, socket, send, evaluate };
  } catch (error) { socket?.close(); child.kill(); throw error; }
}
async function quit(session) {
  // A click closes the debug socket, so do not await the evaluation response.
  session.socket.send(JSON.stringify({ id: 99999, method: 'Runtime.evaluate', params: {
    expression: `document.querySelector('[data-action="quit"]').click()`
  } }));
  const result = await Promise.race([session.exit, new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Quit did not terminate installed app.')), 10000).unref())]);
  assert.equal(result.code, 0);
  session.socket.close();
}
void (async () => {
  assert.ok(executable.endsWith('Mindtraveller.exe'));
  await fs.access(executable);
  await fs.mkdir(output, { recursive: true });
  const results = [];
  for (const language of ['en', 'pt-BR']) {
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const store = new AdventureStore(profile);
  // Seed only the isolated profile, then verify the installed app finds it on launch.
  const fixture = { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null },
    schemaVersion: 1, language, id: 'installed-fixture', theme: 'Horror',
    character: { name: `Installer Traveller-${path.basename(profile)}`, gender: 'Woman', nature: 'Good', allocationMethod: 'Simplified',
      attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 } },
    premise: 'An offline restoration check.', segments: [{ id: 'installed-opening', chapterNumber: 1,
      narrative: language === 'pt-BR' ? 'Jo?o retorna ? aldeia: a??o e cora??o.' : 'The installed traveller returns to the village.', choices: [
        { id: 'wait', text: 'Wait.' }, { id: 'ask', text: 'Ask.' }, { id: 'enter', text: 'Enter.' }
      ], selectedChoiceId: null, check: null, createdAt: new Date().toISOString() }],
    chapterSummaries: [], globalSummary: '', phase: { kind: 'ready' }, updatedAt: new Date().toISOString()
  };
  await store.save(fixture);
  if (language === 'en') { const legacy = { ...fixture }; delete legacy.language; await fs.writeFile(store.activePath, JSON.stringify(legacy)); }
  await fs.writeFile(path.join(store.directory, 'preferences.json'), JSON.stringify({ schemaVersion: 1, defaultStoryLanguage: 'pt-BR' }));
  const bytes = await fs.readFile(store.activePath, 'utf8');
  let session;
  try {
    for (let launchNumber = 1; launchNumber <= 2; launchNumber += 1) {
      session = await launch(profile);
      const state = await session.evaluate(async () => {
        const adventure = await window.mindtraveller.restoreAdventure();
        const backgrounds = await Promise.all(['.sidebar', '.story-panel', '.nav-button'].map(async (selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          const value = selector === '.nav-button' ? style.borderImageSource : style.backgroundImage;
          const url = value.slice(4, -1).replaceAll('"', '');
          return new Promise((resolve) => { const image = new Image();
            image.onload = () => resolve(image.naturalWidth > 0); image.onerror = () => resolve(false); image.src = url; });
        }));
        return { adventure, url: location.href, images: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
          backgrounds, segments: document.querySelectorAll('[data-segment-id]').length };
      });
      assert.deepEqual(state.adventure, fixture);
      assert.equal(state.segments, 1);
      assert.equal(state.images, true);
      assert.ok(state.backgrounds.every(Boolean));
      assert.match(state.url, /app\.asar/);
      assert.equal(await session.evaluate(() => document.querySelector('.titlebar') === null), true);
      assert.equal((await session.evaluate(() => window.mindtraveller.getStoryPreferences())).defaultStoryLanguage, 'pt-BR');
      if (launchNumber === 1) {
        for (const cancel of [false, true]) {
          const destination = path.join(output, 'native-' + language + '.md');
          const args = ['-NoProfile', '-File', path.join(__dirname, 'native-save-dialog.ps1'), '-AppProcessId', String(session.child.pid)];
          if (cancel) args.push('-Cancel');
          const helper = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
          let diagnostic = ''; helper.stdout.on('data', (chunk) => diagnostic += chunk); helper.stderr.on('data', (chunk) => diagnostic += chunk);
          const done = new Promise((resolve) => helper.once('exit', (code) => resolve(code)));
          await session.evaluate(() => document.querySelector('[data-action="export-history"]').click());
          assert.equal(await done, 0, diagnostic);
          console.log(diagnostic.trim());
          await until(() => session.evaluate(() => !document.querySelector('[data-action="export-history"]').disabled));
          if (!cancel) {
            await until(() => session.evaluate(() => Boolean(document.querySelector('.export-feedback'))));
            const feedback = await session.evaluate(() => document.querySelector('.export-feedback').textContent);
            const actualDestination = feedback.replace('History exported to ', '');
            const text = await fs.readFile(actualDestination, 'utf8');
            await fs.writeFile(destination, text, 'utf8');
            results.push({ language, nativeExport: actualDestination });
            assert.ok(text.includes(fixture.segments[0].narrative));
            assert.equal(await session.evaluate(() => Boolean(document.querySelector('.export-feedback'))), true);
          } else {
            console.log(await session.evaluate(() => document.querySelector('.error-banner, .export-feedback')?.textContent));
            await until(() => session.evaluate(() => !document.querySelector('.error-banner, .export-feedback')));
          }
        }
      }
      const screenshot = await session.send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(path.join(output, `launch-${language}-${launchNumber}.png`), Buffer.from(screenshot.data, 'base64'));
      await quit(session);
      session = null;
      assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
    }
    results.push({ language, save: store.activePath });
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ executable, profiles: results, nativeSaveCancel: true,
      launches: 2, restored: true, assets: true, quit: true, hostedServerRequired: false }, null, 2));
    console.log(`Installed app passed two launches, offline restoration, bundled images/backgrounds, save preservation, and Quit. Evidence: ${output}`);
  } finally { session?.socket.close(); session?.child.kill(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
