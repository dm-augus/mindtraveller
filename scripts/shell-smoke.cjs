const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { app, safeStorage, dialog } = require('electron');
let exportDialog;
dialog.showSaveDialog = async (_window, options) => {
  assert.equal(options.title, 'Export History');
  assert.ok(exportDialog, 'Unexpected save dialog');
  return exportDialog(options);
};
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { ProviderSettingsStore } = require('../dist/main/provider-settings.js');

const output = path.resolve(__dirname, '../out/smoke');
// Retain the isolated Chromium profile with the screenshots; its databases stay locked until exit.
app.disableHardwareAcceleration();
let userData;
let providerServer;
let openingRequests = 0;
let failOpeningOnce = false;
let checkedAssessments = 0;
let simpleAssessments = 0;
let openAiContinuations = 0;
const narratedChecks = [];
const openAiOperations = [];
let failGlobalSummaryOnce = true;
// Stub only the OpenAI transport; keep the actual adapter, IPC, controller, and storage.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (new URL(url).origin !== 'https://api.openai.com') return originalFetch(url, options);
  assert.equal(options.headers.authorization, 'Bearer sk-integration-fixture');
  if (new URL(url).pathname === '/v1/models') {
    return Response.json({ data: [{ id: 'integration-model' }] });
  }
  assert.equal(new URL(url).pathname, '/v1/responses');
  const body = JSON.parse(options.body);
  assert.equal(body.model, 'integration-model');
  const prompt = JSON.parse(body.input[1].content);
  openAiOperations.push(prompt.operation === 'summary' ? prompt.kind : prompt.operation);
  let content;
  if (prompt.operation === 'assessment') {
    assert.equal(prompt.choice.choiceId, 'wait');
    openAiContinuations++;
    assert.equal(typeof prompt.context, 'object');
    assert.equal(prompt.context.mainObjective, 'Find the source of the village bell.');
    content = { storyState: { location: 'Village', situation: `Bell ${openAiContinuations} rings while Aveline waits.`, currentFocus: 'Listen for the bell’s source.' }, kind: 'no-check', narrative: `Aveline hears bell ${openAiContinuations} while waiting in the village.`, choices: [
      { id: 'wait', text: 'Wait for the bell.' },
      { id: 'ask', text: 'Ask about the bell.' },
      { id: 'enter', text: 'Enter the crypt.' }
    ] };
  } else {
    assert.equal(prompt.operation, 'summary');
    if (prompt.kind === 'global' && failGlobalSummaryOnce) {
      failGlobalSummaryOnce = false;
      return new Response('', { status: 503 });
    }
    content = { text: 'Aveline investigated the crypt and heard the village warning.',
      keyFacts: ['The village bell rings.'], unresolvedThreads: ['Discover the source of the bell.'] };
  }
  return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify(content) }] }] });
};
let finishing = false;
const timeout = setTimeout(() => { void finish(1, new Error('Shell smoke check timed out.')); }, 60_000);

async function finish(code, error) {
  if (finishing) return;
  finishing = true;
  clearTimeout(timeout);
  if (error) console.error(error);
  providerServer?.close();
  app.exit(code);
}

function adventure() {
  return { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null },
    schemaVersion: 1, language: 'en', id: 'shell-fixture', theme: 'High Fantasy',
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
  window.webContents.backgroundThrottling = false;
  const evaluate = async (fn, ...args) => {
    try { return await window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`); }
    catch (error) { throw new Error(`Renderer check failed: ${fn.toString()}`, { cause: error }); }
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
  async function waitFor(fn, ...args) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (await evaluate(fn, ...args)) return;
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
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await settle();
      try {
        await fs.writeFile(path.join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayAwake: true })).toPNG());
        return;
      } catch (error) {
        if (attempt === 5 || !String(error).includes('UnknownVizError')) {
          throw new Error(`Screenshot failed: ${name}`, { cause: error });
        }
        window.webContents.invalidate();
      }
    }
  }
  async function checkExport(name, pendingRoll = null) {
    const bytes = await fs.readFile(store.activePath, 'utf8');
    const calls = JSON.stringify({ openingRequests, checkedAssessments, simpleAssessments, narratedChecks, openAiOperations });
    const destination = path.join(output, `${name}.md`);
    let release;
    exportDialog = () => new Promise((resolve) => { release = resolve; });
    await evaluate(() => {
      const button = document.querySelector('[data-action="export-history"]');
      button.click(); button.click();
    });
    await waitFor(() => document.querySelector('[data-action="export-history"]').textContent.includes('Exporting'));
    assert.equal(await evaluate(() => document.querySelector('[data-view="new-story"]').disabled), true);
    assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:not(:disabled)').length), 0);
    await assert.rejects(evaluate(() => window.mindtraveller.requestNewStory()));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(release);
    release({ canceled: false, filePath: destination });
    await waitFor(() => Boolean(document.querySelector('.export-feedback')));
    const text = await fs.readFile(destination, 'utf8');
    assert.match(text, /# Mindtraveller/);
    if (pendingRoll) {
      assert.match(text, /Pending state/);
      assert.ok(text.includes(`D100 ${pendingRoll.roll} · Threshold ${pendingRoll.threshold}`));
    }
    assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
    assert.equal(JSON.stringify({ openingRequests, checkedAssessments, simpleAssessments, narratedChecks, openAiOperations }), calls);
    exportDialog = undefined;
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
  assert.equal(await evaluate(() => document.querySelector('[data-action="export-history"]').disabled), true);
  await layout();
  await capture('shell-empty-1200');
  window.setSize(760, 520);
  await settle();
  await layout();
  await capture('shell-empty-760');

  await evaluate(() => document.querySelector('[data-view="new-story"]').click());
  await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'new-story');
  await waitFor(() => Boolean(document.querySelector('input[name="story-language"][value="en"]:checked:not(:disabled)')));
  const preferencesPath = path.join(userData, 'mindtraveller', 'preferences.json');
  await assert.rejects(evaluate(() => window.mindtraveller.saveStoryPreferences({ defaultStoryLanguage: 'fr' })));
  // Force a real write failure without modifying the user's profile.
  await fs.mkdir(`${preferencesPath}.tmp`, { recursive: true });
  await evaluate(() => document.querySelector('input[name="story-language"][value="pt-BR"]').click());
  await waitFor(() => Boolean(document.querySelector('.language-error')));
  assert.equal(await evaluate(() => document.querySelector('input[name="story-language"][value="en"]').checked), true);
  await fs.rmdir(`${preferencesPath}.tmp`);
  await evaluate(() => document.querySelector('input[name="story-language"][value="en"]').focus());
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await waitFor(() => Boolean(document.querySelector('input[name="story-language"][value="pt-BR"]:checked:not(:disabled)')));
  assert.equal(JSON.parse(await fs.readFile(preferencesPath, 'utf8')).defaultStoryLanguage, 'pt-BR');
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
  assert.equal(generated.mainObjective, 'Find the source of the village bell.');
  assert.equal(generated.storyState.location, 'Crypt entrance');
  assert.equal(openingRequests, 1);
  assert.equal(generated.theme, 'Horror');
  assert.equal(generated.language, 'pt-BR');
  assert.match(await evaluate(() => document.querySelector('[aria-label="Adventure language"]').textContent), /Português/);
  assert.equal(generated.character.name, 'Aveline');
  assert.equal(generated.character.gender, 'Woman');
  assert.equal(generated.character.nature, 'Good');
  assert.deepEqual(generated.character.attributes,
    { Strength: 3, Dexterity: 2, Intelligence: -2, Endurance: 0, Charisma: 0, Luck: 0 });
  assert.equal(generated.phase.kind, 'ready');
  await capture('setup-generated-760');
  const measurements = [];
  for (const [width, height] of [[1200, 800], [760, 520]]) {
    window.setSize(width, height);
    await settle();
    measurements.push(await evaluate(() => ({ width: innerWidth, height: innerHeight,
      narrativeHeight: document.querySelector('.story-scroll').clientHeight,
      fontSize: getComputedStyle(document.querySelector('.story-scroll')).fontSize,
      decisionFontSize: getComputedStyle(document.querySelector('.choice-button')).fontSize })));
    await capture(`layout-short-choices-${width}`);
  }
  const measuringBaseline = process.env.MINDTRAVELLER_CAPTURE_LAYOUT_BASELINE === '1';
  await fs.writeFile(path.join(output, measuringBaseline ? 'layout-baseline.json' : 'layout-after.json'), JSON.stringify(measurements, null, 2));
  if (!measuringBaseline) {
    assert.equal(await evaluate(() => document.querySelector('.titlebar') === null), true);
    assert.match(window.getTitle(), /Mindtraveller/);
    assert.match(await evaluate(() => document.querySelector('.story-genre').textContent), /Horror/);
    const baseline = JSON.parse(await fs.readFile(path.join(__dirname, '../docs/layout-baseline.json'), 'utf8'));
    for (let index = 0; index < measurements.length; index += 1) {
      assert.ok(measurements[index].narrativeHeight > baseline[index].narrativeHeight,
        `Narrative viewport must increase: ${JSON.stringify({ before: baseline[index], after: measurements[index] })}`);
      assert.equal(measurements[index].fontSize, baseline[index].fontSize);
      assert.equal(measurements[index].decisionFontSize, baseline[index].decisionFontSize);
    }
  }
  await checkExport('history-ready');
  exportDialog = async () => ({ canceled: false, filePath: output });
  await evaluate(() => document.querySelector('[data-action="export-history"]').click());
  await waitFor(() => Boolean(document.querySelector('.error-banner')));
  assert.equal(await evaluate(() => Boolean(document.querySelector('.export-feedback'))), false);
  exportDialog = async () => ({ canceled: true });
  await evaluate(() => document.querySelector('[data-action="export-history"]').click());
  await waitFor(() => document.querySelector('[data-action="export-history"]').disabled === false);
  assert.equal(await evaluate(() => Boolean(document.querySelector('.error-banner, .export-feedback'))), false);
  exportDialog = undefined;

  await evaluate(() => document.querySelector('[data-choice-id="enter"]').click());
  assert.equal(await evaluate(() => document.querySelectorAll('[data-choice-id]:disabled').length), 3);
  await waitFor(() => Boolean(document.querySelector('[aria-label="Saved check result"]')
    && document.querySelector('.retry-button:not(:disabled)')));
  const pendingCheck = (await store.load()).phase.check;
  assert.equal((await store.load()).phase.kind, 'pending-narration');
  assert.equal(checkedAssessments, 1);
  await checkExport('history-pending-check', pendingCheck);
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
  assert.equal(checked.mainObjective, generated.mainObjective);
  assert.equal(checked.storyState.location, 'Crypt entrance');
  assert.notDeepEqual(checked.storyState, generated.storyState);
  assert.equal(checked.phase.kind, 'ready');
  assert.deepEqual(checked.segments.at(-1).check, pendingCheck);
  assert.equal(checked.segments[0].selectedChoiceId, 'enter');
  assert.deepEqual(await evaluate(() => [...document.querySelectorAll('[data-choice-id] span')].map((label) => label.textContent)),
    checked.segments.at(-1).choices.map((choice) => choice.text));
  assert.notDeepEqual(checked.segments.at(-1).choices, generated.segments.at(-1).choices);
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
  assert.equal(simple.mainObjective, generated.mainObjective);
  assert.equal(simple.storyState.currentFocus, 'Investigate the village warning.');
  assert.equal(simple.phase.kind, 'ready');
  assert.equal(simple.segments.at(-1).check, null);
  assert.equal(simple.segments[1].selectedChoiceId, 'ask');
  assert.deepEqual(await evaluate(() => [...document.querySelectorAll('[data-choice-id] span')].map((label) => label.textContent)),
    simple.segments.at(-1).choices.map((choice) => choice.text));
  assert.notDeepEqual(simple.segments.at(-1).choices, checked.segments.at(-1).choices);
  assert.equal(simpleAssessments, 2);
  assert.equal(await evaluate(() => document.querySelectorAll('[aria-label="Check result"]').length), 1);
  await capture('story-no-check-complete-760');

  await evaluate(() => document.querySelector('[data-view="settings"]').click());
  await waitFor(() => Boolean(document.querySelector('.settings-content')));
  await waitFor(() => Boolean(document.querySelector('input[name="story-language"][value="pt-BR"]:checked:not(:disabled)')));
  const beforePreference = await fs.readFile(store.activePath, 'utf8');
  await evaluate(() => document.querySelector('input[name="story-language"][value="en"]').click());
  await waitFor(() => Boolean(document.querySelector('input[name="story-language"][value="en"]:checked:not(:disabled)')));
  assert.equal(await fs.readFile(store.activePath, 'utf8'), beforePreference);
  await evaluate(() => document.querySelector('input[name="provider"][value="openai"]').click());
  await evaluate(() => {
    const field = document.querySelector('input[type="password"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'sk-integration-fixture');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.settings-check input').click();
  });
  await evaluate(() => document.querySelector('.settings-content button[type="button"]').click());
  await waitFor(() => document.querySelector('.settings-content button[type="button"]').disabled === false);
  // Discovery refreshes the persisted provider configuration; select OpenAI before saving.
  await evaluate(() => document.querySelector('input[name="provider"][value="openai"]').click());
  await evaluate(() => {
    const field = document.querySelector('.settings-content select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, 'integration-model');
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await evaluate(() => document.querySelector('.settings-content button[type="submit"]').click());
  await waitFor(() => document.querySelector('.settings-feedback')?.textContent.includes('settings saved'));
  await evaluate(() => document.querySelector('[data-action="return-story"]').click());
  for (let count = 4; count <= 10; count += 1) {
    await waitFor(() => Boolean(document.querySelector('[data-choice-id="wait"]:not(:disabled)')));
    await evaluate(() => {
      const button = document.querySelector('[data-choice-id="wait"]');
      button.click();
      button.click();
    });
    await waitFor((expected) => document.querySelectorAll('[data-segment-id]').length === expected, count);
  }
  await waitFor(() => Boolean(document.querySelector('[role="alert"]') && document.querySelector('.retry-button:not(:disabled)')));
  const pendingSummary = await store.load();
  assert.equal(pendingSummary.phase.kind, 'pending-summary');
  assert.equal(pendingSummary.chapterSummaries.length, 0);
  const summaryReload = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await summaryReload;
  await ready();
  await evaluate(() => document.querySelector('.retry-button').click());
  await waitFor(() => document.querySelectorAll('[data-choice-id]:disabled').length === 0);
  const summarized = await store.load();
  assert.equal(summarized.mainObjective, generated.mainObjective);
  assert.equal(summarized.storyState.location, 'Village');
  assert.equal(summarized.language, 'pt-BR');
  assert.equal(summarized.phase.kind, 'ready');
  assert.equal(summarized.segments.length, 10);
  assert.equal(new Set(summarized.segments.map((segment) => segment.id)).size, 10);
  assert.equal(summarized.segments.filter((segment) => segment.selectedChoiceId !== null).length, 9);
  assert.deepEqual(summarized.segments.filter((segment) => segment.check).map((segment) => segment.check), [pendingCheck]);
  assert.equal(summarized.chapterSummaries.length, 1);
  assert.match(summarized.globalSummary, /source of the bell/);
  assert.deepEqual(openAiOperations, [...Array(7).fill('assessment'), 'chapter', 'global', 'chapter', 'global']);
  assert.equal((await fs.readFile(store.activePath, 'utf8')).includes('sk-integration-fixture'), false);
  await capture('story-summary-restored-760');
  // Restore Ollama for the remaining navigation and error checks.
  const settingsStore = new ProviderSettingsStore(userData, safeStorage);
  const settings = await settingsStore.getPublicSettings();
  await settingsStore.saveConfiguration({ activeProvider: 'ollama', ollama: settings.ollama,
    openai: { modelId: settings.openai.modelId } });

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
    if (view === 'new-story') {
      await waitFor(() => Boolean(document.querySelector('[role="alertdialog"]')));
      assert.equal(await evaluate(() => document.querySelector('.app-shell').dataset.currentView), 'story');
      await capture('shell-new-story-confirm-760');
      await evaluate(() => document.querySelector('.confirmation-actions button:first-child').click());
      await waitFor(() => !document.querySelector('[role="alertdialog"]'));
      assert.equal(await evaluate(() => document.querySelector('.app-shell').dataset.currentView), 'story');
      assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
      assert.deepEqual(await store.load(), saved);
      continue;
    }
    await waitFor(() => document.querySelector('.app-shell').dataset.currentView !== 'story');
    assert.equal(await evaluate(() => document.querySelector('.app-shell').dataset.currentView), view);
    if (view === 'rules') {
      const details = await evaluate(() => document.querySelector('[aria-label="Active character"]').textContent);
      for (const expected of ['Mira', 'Woman', 'Good', 'Strength', 'Luck']) assert.ok(details.includes(expected));
    }
    if (view === 'settings') {
      await evaluate(() => document.querySelector('.settings-content button[type="button"]').click());
      await waitFor(() => Boolean(document.querySelector('.settings-content select option[value="smoke-model"]'))
        && document.querySelector('.settings-content button[type="button"]').disabled === false);
      await evaluate(() => {
        const field = document.querySelector('.settings-content select');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, 'alternate-model');
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await evaluate(() => document.querySelector('.settings-content button[type="submit"]').click());
      await waitFor(() => Boolean(document.querySelector('.settings-feedback, .settings-error')));
      assert.match(await evaluate(() => document.querySelector('.settings-feedback, .settings-error').textContent), /saved/i);
      assert.equal((await new ProviderSettingsStore(userData, safeStorage).getPublicSettings()).ollama.modelId, 'alternate-model');
      await evaluate(() => document.querySelector('input[name="provider"][value="openai"]').click());
      await evaluate(() => {
        const field = document.querySelector('input[type="password"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'sk-smoke-secret');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.settings-check input').click();
      });
      await evaluate(() => document.querySelector('input[name="provider"][value="ollama"]').click());
      await evaluate(() => document.querySelector('.settings-content button[type="submit"]').click());
      await waitFor(() => document.querySelector('.settings-feedback')?.textContent.includes('session only')
        && document.querySelector('.settings-content button[type="submit"]').disabled === false);
      assert.equal(await evaluate(() => document.querySelector('.settings-content').textContent.includes('sk-smoke-secret')), false);
      await evaluate(() => document.querySelector('input[name="provider"][value="openai"]').click());
      assert.equal(await evaluate(() => document.querySelector('input[type="password"]').value), '');
    }
    window.setSize(760, 520);
    await settle();
    await layout();
    await capture(`shell-${view}-760`);
    await evaluate(() => document.querySelector('[data-action="return-story"]').click());
    await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'story');
    assert.equal(await evaluate(() => document.querySelectorAll('[data-segment-id]').length), saved.segments.length);
  }
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  await evaluate(() => document.querySelector('[data-view="new-story"]').click());
  await waitFor(() => Boolean(document.querySelector('[role="alertdialog"]')));
  await evaluate(() => document.querySelector('.confirmation-actions button:last-child').click());
  await waitFor(() => document.querySelector('.app-shell').dataset.currentView === 'new-story'
    && !document.querySelector('[role="alertdialog"]'));
  assert.equal(await store.load(), null);
  assert.equal(await evaluate(() => document.querySelector('.setup-start').disabled), true);
  await waitFor(() => Boolean(document.querySelector('input[name="story-language"][value="en"]:checked:not(:disabled)')));
  await capture('shell-new-story-after-confirm-760');

  const pendingOpening = structuredClone(saved);
  pendingOpening.premise = null;
  pendingOpening.segments = [];
  pendingOpening.phase = { kind: 'pending-opening', turnId: 'smoke-opening' };
  await store.save(pendingOpening);
  failOpeningOnce = true;
  const openingReloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await openingReloaded;
  await ready();
  await evaluate(() => document.querySelector('.retry-button').click());
  await waitFor(() => Boolean(document.querySelector('.pending-error'))
    && !document.querySelector('.retry-button').disabled);
  assert.match(await evaluate(() => document.querySelector('.pending-error').textContent), /Ollama could not complete/);
  assert.equal(await evaluate(() => {
    const panel = document.querySelector('.choice-list').getBoundingClientRect();
    const retry = document.querySelector('.retry-button').getBoundingClientRect();
    return retry.top >= panel.top && retry.bottom <= panel.bottom;
  }), true);
  assert.equal((await store.load()).phase.kind, 'pending-opening');
  await capture('shell-opening-error-760');

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
  if (!measuringBaseline) {
    const longChoices = pending.segments.at(-1).choices.map((choice, index) => ({ ...choice,
      text: `${index + 1}. Investigar cuidadosamente as inscrições à entrada da abadia e conversar com os viajantes sobre a maldição, sem abandonar os companheiros que aguardam notícias na praça da aldeia.` }));
    const longResults = [];
    for (const state of ['ready', 'pending-narration']) {
      const portuguese = structuredClone(pending);
      portuguese.language = 'pt-BR';
      portuguese.segments.at(-1).choices = longChoices;
      portuguese.segments.at(-1).narrative = 'Através das ruínas, a viajante procura notícias dos companheiros.\n\n'.repeat(8);
      portuguese.segments.at(-1).selectedChoiceId = state === 'ready' ? null : 'merchant';
      portuguese.phase = state === 'ready' ? { kind: 'ready' }
        : { ...pending.phase, choice: { ...pending.phase.choice, choiceText: longChoices[0].text } };
      await store.save(portuguese);
      const loaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      window.webContents.reload(); await loaded; await ready();
      for (const [width, height] of [[1200, 800], [760, 520]]) {
        window.setSize(width, height); await settle(); await layout();
        const detail = await evaluate(() => {
          const story = document.querySelector('.story-scroll'), decisions = document.querySelector('.choice-list');
          const before = story.scrollTop;
          const last = document.querySelector('[data-choice-id]:last-child');
          last.scrollIntoView({ block: 'end', container: 'nearest' });
          return { narrativeHeight: story.clientHeight, storyFontSize: getComputedStyle(story).fontSize,
            decisionOverflow: decisions.scrollHeight > decisions.clientHeight,
            horizontalOverflow: decisions.scrollWidth > decisions.clientWidth,
            decisionsScroll: decisions.scrollTop, storyUnchanged: story.scrollTop === before,
            wrapped: [...document.querySelectorAll('[data-choice-id] span')].every((label) => label.getBoundingClientRect().height > 30) };
        });
        assert.ok(detail.narrativeHeight >= 100);
        assert.equal(detail.decisionOverflow, true);
        assert.equal(detail.horizontalOverflow, false);
        assert.ok(detail.decisionsScroll > 0);
        assert.equal(detail.storyUnchanged, true, 'Decision scrolling must not move the narrative');
        assert.equal(detail.wrapped, true);
        assert.equal(detail.storyFontSize, width === 1200 ? '17px' : '16px');
        await evaluate(() => document.querySelector('.story-scroll').focus());
        window.focus(); window.webContents.focus();
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
        await settle();
        const focus = await evaluate(() => {
          const active = document.activeElement, style = getComputedStyle(active);
          active.scrollIntoView({ block: 'nearest', container: 'nearest' });
          const pane = document.querySelector('.choice-list').getBoundingClientRect(), rect = active.getBoundingClientRect();
          return { control: active.matches('.choice-button, .retry-button'), visible: active.matches(':focus-visible'),
            outline: style.outlineStyle, width: style.outlineWidth, inView: rect.top >= pane.top - 1 && rect.bottom <= pane.bottom + 1 };
        });
        assert.equal(focus.control, true, JSON.stringify(focus)); assert.equal(focus.visible, true, JSON.stringify(focus));
        assert.equal(focus.outline, 'dotted'); assert.ok(parseFloat(focus.width) >= 1.5, 'Focus outline must remain visible under Windows display scaling');
        assert.equal(focus.inView, true);
        if (state === 'pending-narration') {
          for (const selector of ['.pending-hint', '.pending-roll-summary', '.retry-button']) {
            assert.equal(await evaluate((target) => {
              const element = document.querySelector(target); element.scrollIntoView({ block: 'center', container: 'nearest' });
              const bounds = element.getBoundingClientRect(), pane = document.querySelector('.choice-list').getBoundingClientRect();
              return bounds.top >= pane.top - 1 && bounds.bottom <= pane.bottom + 1;
            }, selector), true, `${selector} must be reachable`);
          }
        }
        longResults.push({ state, width, height, ...detail, focus });
        const headerPosition = await evaluate(() => ({ titleTop: document.querySelector('#view-title').getBoundingClientRect().top,
          parents: ['.section-header', '.story-panel', '.adventure-body', '.workspace', '.app-shell'].map((selector) => {
            const element = document.querySelector(selector); return { selector, top: element.getBoundingClientRect().top, scroll: element.scrollTop };
          }) }));
        assert.ok(headerPosition.titleTop >= 0, JSON.stringify(headerPosition));
        await capture(`layout-portuguese-${state}-${width}`);
      }
    }
    await fs.writeFile(path.join(output, 'layout-long-choices.json'), JSON.stringify(longResults, null, 2));
  }
  const english = await evaluate(async () => {
    const request = await window.mindtraveller.requestNewStory();
    await window.mindtraveller.resolveNewStory(request.confirmationId, 'Yes');
    return window.mindtraveller.startOpening({ language: 'en', theme: 'Horror', character: {
      name: 'Aveline', gender: 'Woman', nature: 'Good', allocationMethod: 'Simplified',
      attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
    } });
  });
  assert.equal(english.language, 'en');
  assert.equal(english.segments.length, 1);
  const englishReload = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload(); await englishReload; await ready();
  assert.match(await evaluate(() => document.querySelector('[aria-label="Adventure language"]').textContent), /English/);
  const quitBytes = await fs.readFile(store.activePath, 'utf8');
  app.once('will-quit', (event) => {
    event.preventDefault();
    void (async () => {
      assert.equal(window.isDestroyed(), true);
      assert.equal(await fs.readFile(store.activePath, 'utf8'), quitBytes);
      console.log('Integrated app verified: creation, Ollama and OpenAI stubs, checked/no-check retry, summary failure and restoration, replacement, stable decisions and rolls, navigation, assets, and Quit.');
      console.log(`Screenshots: ${output}`);
      await finish(0);
    })().catch((error) => finish(1, error));
  });
  void evaluate(() => document.querySelector('[data-action="quit"]').click()).catch(() => {});
}

void (async () => {
  await fs.mkdir(output, { recursive: true });
  userData = await fs.mkdtemp(path.join(output, 'profile-'));
  app.setPath('userData', userData);
  providerServer = http.createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models: [
        { model: 'smoke-model', name: 'smoke-model' }, { model: 'alternate-model', name: 'alternate-model' }
      ] }));
      return;
    }
    if (request.url !== '/api/chat') { response.writeHead(404).end(); return; }
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    const prompt = JSON.parse(body.messages[1].content);
    assert.deepEqual(body.options, { num_ctx: 8192, num_predict: 1536 });
    const choices = [
      { id: 'enter', text: 'Enter the crypt.' },
      { id: 'ask', text: 'Question the villagers.' },
      { id: 'wait', text: 'Wait for nightfall.' }
    ];
    let content;
    if (prompt.operation === 'opening') {
      if (failOpeningOnce) { failOpeningOnce = false; response.writeHead(503).end(); return; }
      assert.equal(prompt.theme, 'Horror');
      assert.equal(prompt.character.name, 'Aveline');
      openingRequests += 1;
      content = { mainObjective: 'Find the source of the village bell.', storyState: { location: 'Crypt entrance', situation: 'Aveline stands outside the crypt.', currentFocus: 'Investigate the crypt.' }, premise: 'A bell rings beneath the village.',
        narrative: 'Aveline approaches the crypt. The villagers wait behind her.', choices };
    } else if (prompt.operation === 'assessment' && prompt.choice.choiceId === 'enter') {
      checkedAssessments += 1;
      content = { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
    } else if (prompt.operation === 'assessment' && prompt.choice.choiceId === 'ask') {
      simpleAssessments += 1;
      if (simpleAssessments === 1) { response.writeHead(503).end(); return; }
      content = { storyState: { location: 'Village', situation: 'The villagers have shared a warning.', currentFocus: 'Investigate the village warning.' }, kind: 'no-check', narrative: 'The villagers share a warning.',
        choices: choices.map((choice) => ({ ...choice, text: `${choice.text} Follow the villagers' warning.` })) };
    } else if (prompt.operation === 'checked-narration') {
      narratedChecks.push(prompt.check);
      if (narratedChecks.length === 1) { response.writeHead(503).end(); return; }
      content = { storyState: { location: 'Crypt entrance', situation: prompt.check.outcome === 'success' ? 'The crypt door is open.' : 'The crypt door resisted the attempt.', currentFocus: 'Find the bell beyond the door.' }, outcome: prompt.check.outcome,
        narrative: prompt.check.outcome === 'success' ? 'Aveline opens the crypt door.' : 'The crypt door resists Aveline.',
        choices: choices.map((choice) => ({ ...choice, text: `${choice.text} After the crypt door attempt.` })) };
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
