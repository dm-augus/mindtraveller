const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');
const { AdventureStore } = require('../dist/main/adventure-storage.js');

const output = path.resolve(__dirname, '../out/smoke');
// Retain the isolated Chromium profile with the screenshots; its databases stay locked until exit.
app.disableHardwareAcceleration();
let userData;
let finishing = false;
const timeout = setTimeout(() => { void finish(1, new Error('Shell smoke check timed out.')); }, 30_000);

async function finish(code, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeout);
  if (error) console.error(error);
  app.exit(code);
}

function adventure() {
  return {
    schemaVersion: 1, id: 'shell-fixture', theme: 'High Fantasy',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A silver bell rings in a ruined abbey. Someone inside remembers your name.',
    segments: Array.from({ length: 10 }, (_, index) => ({
      id: `scene-${index + 1}`, chapterNumber: index < 5 ? 1 : 2,
      narrative: index === 0
        ? 'The road ends beneath a dark archway. Violet light spills from the abbey windows, although no candles burn inside.\n\nAn old merchant raises a hand in greeting. He has been waiting for a traveller willing to follow the bell.'
        : `Passage ${index + 1}. Mira follows the sound through the ruined halls. The abbess speaks of a hidden door, an old promise, and a journey that has only just begun.\n\nBeyond the courtyard, a lantern sways in the wind. The trail remains clear, and the next decision belongs to you.`,
      choices: [
        { id: 'merchant', text: 'Accept the merchant’s invitation and ask what he knows about the bell.' },
        { id: 'courtyard', text: 'Enter the courtyard and search for the source of the violet light.' },
        { id: 'abbess', text: 'Wait for the abbess and tell her why you came.' },
        { id: 'road', text: 'Return to the road and look for another way into the abbey.' }
      ],
      selectedChoiceId: index < 9 ? 'courtyard' : null,
      check: null, createdAt: '2026-11-11T12:00:00.000Z'
    })),
    chapterSummaries: [], globalSummary: '', phase: { kind: 'ready' }, updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

async function checkWindow(window, store) {
  const evaluate = (fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
  async function waitFor(fn) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(fn)) return;
      await settle();
    }
    throw new Error(`Renderer condition did not become true: ${fn.toString()}`);
  }
  async function ready() {
    await waitFor(() => document.querySelector('.app-shell')?.dataset.loading === 'false'
      && document.querySelector('.version')?.textContent.includes('v')
      && [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  }
  async function capture(name) {
    await settle();
    await fs.writeFile(path.join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayAwake: true })).toPNG());
  }
  async function layout() {
    const metrics = await evaluate(() => {
      const rect = (selector) => {
        const value = document.querySelector(selector).getBoundingClientRect();
        return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
      };
      return {
        width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        sidebar: rect('.sidebar'), story: rect('.story-panel'), decisions: rect('.decision-panel'), status: rect('.statusbar'),
        quit: rect('[data-action="quit"]'), version: document.querySelector('.version').textContent,
        images: [...document.images].every((image) => image.complete && image.naturalWidth > 0)
      };
    });
    assert.equal(metrics.overflow, false);
    assert.ok(metrics.sidebar.right <= metrics.story.left);
    assert.ok(metrics.story.height >= 100);
    assert.ok(metrics.decisions.top >= metrics.story.bottom);
    assert.ok(metrics.decisions.bottom <= metrics.status.top);
    assert.ok(metrics.quit.bottom <= metrics.sidebar.bottom);
    assert.ok(metrics.status.bottom <= metrics.height);
    assert.ok(metrics.version.includes(app.getVersion()));
    assert.equal(metrics.images, true);
    assert.equal(await evaluate(() => [...document.querySelectorAll('.choice-button')].every((button) => {
      const label = button.querySelector('span').getBoundingClientRect();
      const bounds = button.getBoundingClientRect();
      return label.top >= bounds.top && label.bottom <= bounds.bottom;
    })), true, 'Choice labels must fit inside their own buttons.');
    return `${metrics.width}x${metrics.height}`;
  }

  await ready();
  window.setSize(1200, 800);
  await settle();
  // Windows may round a physical pixel when converting back to scaled DIP sizes.
  assert.ok(window.getSize().every((size, index) => Math.abs(size - [1200, 800][index]) <= 1));
  assert.match(await evaluate(() => document.querySelector('.story-scroll').textContent), /A new adventure awaits/);
  await layout();
  await capture('shell-empty-1200');
  window.setSize(760, 520);
  await settle();
  await layout();
  await capture('shell-empty-760');

  const saved = adventure();
  await store.save(saved);
  const bytes = await fs.readFile(store.activePath, 'utf8');
  const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await loaded;
  await ready();
  const actualChoices = await evaluate(() => [...document.querySelectorAll('[data-choice-id]')].map((button) => button.textContent));
  assert.deepEqual(actualChoices, saved.segments.at(-1).choices.map((choice) => choice.text));
  assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:disabled').length), 0);
  assert.equal(await evaluate(() => document.querySelectorAll('[data-segment-id]').length), saved.segments.length);
  await layout();
  await capture('shell-story-760');
  window.setSize(1200, 800);
  await settle();
  await layout();
  await capture('shell-story-1200');
  assert.equal(await evaluate(() => {
    const pane = document.querySelector('.story-scroll');
    pane.scrollTop = pane.scrollHeight;
    return pane.scrollHeight > pane.clientHeight && pane.scrollTop > 0;
  }), true);

  // Check actual CSS background images as well as the img elements.
  const backgrounds = await evaluate(async () => Promise.all(['.sidebar', '.story-panel', '.nav-button'].map((selector) => {
    const style = getComputedStyle(document.querySelector(selector));
    const background = selector === '.nav-button' ? style.borderImageSource : style.backgroundImage;
    const url = background.slice(4, -1).replaceAll('"', '');
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth > 0);
      image.onerror = () => resolve(false);
      image.src = url;
    });
  })));
  assert.ok(backgrounds.every(Boolean));

  for (const view of ['rules', 'settings', 'new-story']) {
    await evaluate((name) => document.querySelector(`[data-view="${name}"]`).click(), view);
    await waitFor(() => document.querySelector('.app-shell').dataset.currentView !== 'story');
    assert.equal(await evaluate(() => document.querySelector('.app-shell').dataset.currentView), view);
    window.setSize(760, 520);
    await settle();
    await layout();
    await capture(`shell-${view}-760`);
    await evaluate(() => document.querySelector('[data-action="return-story"]').click());
    await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'story');
    assert.equal(await evaluate(() => document.querySelectorAll('[data-segment-id]').length), saved.segments.length);
  }
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);

  const pending = structuredClone(saved);
  pending.segments.at(-1).selectedChoiceId = 'merchant';
  pending.phase = {
    kind: 'pending-narration', choice: { turnId: 'shell-turn', choiceId: 'merchant', choiceText: pending.segments.at(-1).choices[0].text },
    check: { difficulty: 'Hard', attribute: 'Strength', attributeValue: 1, baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success' }
  };
  await store.save(pending);
  const reloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await reloaded;
  await ready();
  assert.match(await evaluate(() => document.querySelector('.status-message').textContent), /Roll saved/);
  assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:disabled').length), 4);
  await layout();
  await capture('shell-pending-760');
  const quitBytes = await fs.readFile(store.activePath, 'utf8');
  app.once('will-quit', (event) => {
    event.preventDefault();
    void (async () => {
      assert.equal(window.isDestroyed(), true);
      assert.equal(await fs.readFile(store.activePath, 'utf8'), quitBytes);
      console.log('Shell verified at 1200x800 and 760x520: images, scrolling, navigation, pending status, and Quit.');
      console.log(`Screenshots: ${output}`);
      await finish(0);
    })().catch((error) => finish(1, error));
  });
  await evaluate(() => document.querySelector('[data-action="quit"]').click());
}

void (async () => {
  await fs.mkdir(output, { recursive: true });
  userData = await fs.mkdtemp(path.join(output, 'profile-'));
  app.setPath('userData', userData);
  const store = new AdventureStore(userData);
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => { void checkWindow(window, store).catch((error) => finish(1, error)); });
  });
  require('../dist/main/index.js');
})().catch((error) => finish(1, error));
