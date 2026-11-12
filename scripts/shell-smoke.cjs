const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { ProviderSettingsStore } = require('../dist/main/provider-settings.js');

const output = path.resolve(__dirname, '../out/smoke');
// Retain the isolated Chromium profile with the screenshots; its databases stay locked until exit.
app.disableHardwareAcceleration();
let userData;
let providerServer;
let openingRequests = 0;
let checkedAssessments = 0;
let simpleAssessments = 0;
const narratedChecks = [];
let finishing = false;
const timeout = setTimeout(() => { void finish(1, new Error('Shell smoke check timed out.')); }, 30_000);

async function finish(code, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeout);
  if (error) console.error(error);
  providerServer?.close();
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
  const evaluate = async (fn, ...args) => {
    try { return await window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`); }
    catch (error) { throw new Error(`Renderer check failed: ${fn.toString()}`, { cause: error }); }
  };
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

  await evaluate(() => document.querySelector('[data-view="new-story"]').click());
  await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'new-story');
  assert.equal(await evaluate(() => document.querySelector('.setup-start').disabled), true);
  await evaluate(() => {
    document.querySelector('input[name="theme"][value="Horror"]').click();
    document.querySelector('input[name="allocation-method"][value="Balanced"]').click();
    document.querySelector('input[name="nature"][value="Good"]').click();
  });
  await evaluate(() => {
    const change = (selector, value) => {
      const field = document.querySelector(selector);
      const prototype = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    };
    change('[aria-label="Strength value"]', '3');
    change('[aria-label="Dexterity value"]', '2');
    change('[aria-label="Intelligence value"]', '-1');
    change('.identity-grid input:first-of-type', 'Aveline');
    change('.identity-grid label:nth-child(2) input', 'Woman');
  });
  assert.equal(await evaluate(() => document.querySelector('.setup-start').disabled), true,
    'Incomplete Balanced allocation must not advance.');
  assert.equal(await evaluate(() => [...document.querySelector('[aria-label="Charisma value"]').options]
    .some((option) => option.value === '2')), false, 'Out of range Charisma must not be selectable.');
  await evaluate(() => document.querySelector('input[name="allocation-method"][value="Simplified"]').click());
  assert.equal(await evaluate(() => document.querySelector('.setup-start').disabled), true,
    'Switching methods resets the allocation to zero.');
  await evaluate(() => {
    const field = document.querySelector('[aria-label="Strength value"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, '3');
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitFor(() => document.querySelector('.setup-start')?.disabled === false);
  await evaluate(() => document.querySelector('input[name="allocation-method"][value="Balanced"]').click());
  assert.equal(await evaluate(() => document.querySelector('.setup-start').disabled), true);
  await evaluate(() => {
    for (const [attribute, value] of [['Strength', '3'], ['Dexterity', '2'], ['Intelligence', '-2']]) {
      const field = document.querySelector(`[aria-label="${attribute} value"]`);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await waitFor(() => document.querySelector('.setup-start')?.disabled === false);
  await capture('setup-valid-760');
  await evaluate(() => document.querySelector('.setup-start').click());
  await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'story'
    && document.querySelectorAll('[data-choice-id]').length === 3);
  const generated = await store.load();
  assert.equal(openingRequests, 1);
  assert.equal(generated.theme, 'Horror');
  assert.equal(generated.character.name, 'Aveline');
  assert.equal(generated.character.gender, 'Woman');
  assert.equal(generated.character.nature, 'Good');
  assert.deepEqual(generated.character.attributes,
    { Strength: 3, Dexterity: 2, Intelligence: -2, Endurance: 0, Charisma: 0, Luck: 0 });
  assert.equal(generated.phase.kind, 'ready');
  await capture('setup-generated-760');

  await evaluate(() => document.querySelector('[data-choice-id="enter"]').click());
  assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:disabled').length), 3);
  await waitFor(() => Boolean(document.querySelector('[aria-label="Saved check result"]')
    && document.querySelector('.retry-button:not(:disabled)')));
  const pendingCheck = (await store.load()).phase.check;
  assert.equal((await store.load()).phase.kind, 'pending-narration');
  assert.equal(checkedAssessments, 1);
  const checkText = await evaluate(() => document.querySelector('[aria-label="Saved check result"]').textContent);
  assert.match(checkText, /Hard/);
  assert.match(checkText, /Strength \+3/);
  assert.ok(checkText.includes(String(pendingCheck.roll)));
  assert.ok(checkText.includes(String(pendingCheck.threshold)));
  assert.ok(checkText.includes(pendingCheck.outcome === 'success' ? 'Success' : 'Failure'));
  const pendingVisibility = await evaluate(() => {
    const pane = document.querySelector('.story-scroll').getBoundingClientRect();
    const check = document.querySelector('[aria-label="Saved check result"]').getBoundingClientRect();
    const choices = document.querySelector('.choice-list').getBoundingClientRect();
    const retry = document.querySelector('.retry-button').getBoundingClientRect();
    const summary = document.querySelector('[aria-label="Saved roll summary"]').getBoundingClientRect();
    return { pane: [pane.top, pane.bottom], check: [check.top, check.bottom],
      choices: [choices.top, choices.bottom], retry: [retry.top, retry.bottom],
      summary: [summary.top, summary.bottom] };
  });
  assert.equal(pendingVisibility.check[0] >= pendingVisibility.pane[0] - 1
    && pendingVisibility.check[0] < pendingVisibility.pane[1]
    && pendingVisibility.retry[0] >= pendingVisibility.choices[0]
    && pendingVisibility.retry[1] <= pendingVisibility.choices[1]
    && pendingVisibility.summary[0] >= pendingVisibility.choices[0]
    && pendingVisibility.summary[1] <= pendingVisibility.choices[1], true,
  `The saved check and retry action must be visible at the smaller window size: ${JSON.stringify(pendingVisibility)}`);
  const summaryText = await evaluate(() => document.querySelector('[aria-label="Saved roll summary"]').textContent);
  assert.ok(summaryText.includes(`D100 ${pendingCheck.roll} / ${pendingCheck.threshold}`));
  assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:disabled').length), 3);
  await capture('story-check-pending-760');
  await evaluate(() => document.querySelector('.retry-button').click());
  await waitFor(() => document.querySelectorAll('[data-segment-id]').length === 2
    && document.querySelectorAll('[data-choice-id]:disabled').length === 0);
  const checked = await store.load();
  assert.equal(checked.phase.kind, 'ready');
  assert.deepEqual(checked.segments.at(-1).check, pendingCheck);
  assert.equal(checked.segments[0].selectedChoiceId, 'enter');
  assert.equal(checkedAssessments, 1);
  assert.deepEqual(narratedChecks, [pendingCheck, pendingCheck]);
  assert.equal(await evaluate(() => document.querySelectorAll('[aria-label="Check result"]').length), 1);
  const completeVisibility = await evaluate(() => {
    const pane = document.querySelector('.story-scroll').getBoundingClientRect();
    const check = document.querySelector('[aria-label="Check result"]').getBoundingClientRect();
    return { pane: [pane.top, pane.bottom], check: [check.top, check.bottom] };
  });
  assert.equal(completeVisibility.check[0] >= completeVisibility.pane[0] - 1
    && completeVisibility.check[0] < completeVisibility.pane[1], true,
  `The committed check must be visible after the turn completes: ${JSON.stringify(completeVisibility)}`);
  await capture('story-check-complete-760');

  await evaluate(() => document.querySelector('[data-choice-id="ask"]').click());
  await waitFor(() => Boolean(document.querySelector('.pending-story')?.textContent.includes('Action awaiting assessment')
    && document.querySelector('.retry-button:not(:disabled)')));
  assert.equal((await store.load()).phase.kind, 'pending-assessment');
  assert.equal(simpleAssessments, 1);
  assert.equal(await evaluate(() => document.querySelectorAll('[aria-label="Saved check result"]').length), 0);
  await evaluate(() => document.querySelector('.retry-button').click());
  await waitFor(() => document.querySelectorAll('[data-segment-id]').length === 3
    && document.querySelectorAll('[data-choice-id]:disabled').length === 0);
  const simple = await store.load();
  assert.equal(simple.phase.kind, 'ready');
  assert.equal(simple.segments.at(-1).check, null);
  assert.equal(simple.segments[1].selectedChoiceId, 'ask');
  assert.equal(simpleAssessments, 2);
  assert.equal(await evaluate(() => document.querySelectorAll('[aria-label="Check result"]').length), 1);
  await capture('story-no-check-complete-760');

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
  providerServer = http.createServer(async (request, response) => {
    if (request.url !== '/api/chat') { response.writeHead(404).end(); return; }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = JSON.parse(body.messages[1].content);
    const choices = [
      { id: 'enter', text: 'Enter the crypt.' },
      { id: 'ask', text: 'Question the villagers.' },
      { id: 'wait', text: 'Wait for nightfall.' }
    ];
    let content;
    if (prompt.operation === 'opening') {
      assert.equal(prompt.theme, 'Horror');
      assert.equal(prompt.character.name, 'Aveline');
      openingRequests += 1;
      content = { premise: 'A bell rings beneath the village.',
        narrative: 'Aveline approaches the crypt. The villagers wait behind her.', choices };
    } else if (prompt.operation === 'assessment' && prompt.choice.choiceId === 'enter') {
      checkedAssessments += 1;
      content = { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
    } else if (prompt.operation === 'assessment' && prompt.choice.choiceId === 'ask') {
      simpleAssessments += 1;
      if (simpleAssessments === 1) { response.writeHead(503).end(); return; }
      content = { kind: 'no-check', narrative: 'The villagers share a warning.', choices };
    } else if (prompt.operation === 'checked-narration') {
      narratedChecks.push(prompt.check);
      if (narratedChecks.length === 1) { response.writeHead(503).end(); return; }
      content = { outcome: prompt.check.outcome,
        narrative: prompt.check.outcome === 'success' ? 'Aveline opens the crypt door.' : 'The crypt door resists Aveline.', choices };
    } else {
      throw new Error(`Unexpected smoke provider operation: ${prompt.operation}`);
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ done: true, message: { role: 'assistant', content: JSON.stringify(content) } }));
  });
  await new Promise((resolve) => providerServer.listen(0, '127.0.0.1', resolve));
  await new ProviderSettingsStore(userData, safeStorage).saveConfiguration({
    activeProvider: 'ollama',
    ollama: { serverAddress: `http://127.0.0.1:${providerServer.address().port}`, modelId: 'smoke-model' },
    openai: { modelId: null }
  });
  const store = new AdventureStore(userData);
  app.once('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', () => { void checkWindow(window, store).catch((error) => finish(1, error)); });
  });
  require('../dist/main/index.js');
})().catch((error) => finish(1, error));
