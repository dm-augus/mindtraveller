const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { NewStoryController } = require('../dist/main/new-story.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');
const { GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');

const choices = [
  { id: 'wait', text: 'Wait for the abbess.' },
  { id: 'enter', text: 'Enter the courtyard.' },
  { id: 'leave', text: 'Leave the abbey.' }
];

function adventure() {
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell sounds beneath the abbey.',
    segments: [{ id: 'scene-1', chapterNumber: 1, narrative: 'The abbess approaches the open gate.',
      choices, selectedChoiceId: null, check: null, createdAt: '2026-11-11T12:00:00.000Z' }],
    chapterSummaries: [], globalSummary: 'Find Mira’s sister.', phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

function continuation(request) {
  return { kind: 'no-check', narrative: `Mira decides to ${request.choice.choiceText}\n\nThe abbess greets her.`, choices };
}

function provider(handler) {
  const requests = [];
  return {
    kind: 'ollama', requests,
    generateOpening: async () => ({ premise: 'A new mystery.', narrative: 'A new road begins.', choices }),
    assessAction: async (request) => {
      requests.push(structuredClone(request));
      return handler ? handler(request) : continuation(request);
    }
  };
}

function source(stub, modelId = 'story-model') {
  return async () => ({ provider: stub, modelId });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, files = fs) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-choice-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-choice-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const store = new AdventureStore(directory, files);
  await store.save(adventure());
  return { store, directory };
}

test('choice is durably selected before assessment; a no-check scene and choices commit together without rolling', async (t) => {
  const { store, directory } = await fixture(t);
  const before = await store.load();
  t.mock.method(crypto, 'randomInt', () => { throw new Error('A no-check action must never roll.'); });
  let pending;
  const stub = provider(async (request) => {
    pending = await new AdventureStore(directory).load();
    assert.equal(pending.phase.kind, 'pending-assessment');
    assert.equal(pending.segments[0].selectedChoiceId, 'wait');
    assert.deepEqual(request.choice, pending.phase.choice);
    assert.deepEqual(request.attributes, before.character.attributes);
    assert.equal(request.modelId, 'configured-model');
    assert.equal(request.paragraphTarget, 2);
    assert.equal(request.choiceTarget, 3);
    const context = JSON.parse(request.context);
    assert.equal(context.rules, GAME_RULES_TEXT);
    assert.deepEqual(context.character, before.character);
    assert.equal(context.globalSummary, before.globalSummary);
    assert.deepEqual(context.latestDecision, choices[0]);
    return continuation(request);
  });
  const result = await new StoryController(store, source(stub, 'configured-model'), { paragraphTarget: 2, chapterLength: 1 })
    .submitChoice('scene-1', 'wait');
  assert.equal(result.kind, 'continued');
  const completed = result.adventure;
  assert.equal(completed.phase.kind, 'ready');
  assert.equal(completed.segments.length, 2);
  assert.deepEqual(completed.segments[0], { ...before.segments[0], selectedChoiceId: 'wait' });
  assert.equal(completed.segments[1].id, pending.phase.choice.turnId);
  assert.equal(completed.segments[1].chapterNumber, 2);
  assert.equal(completed.segments[1].narrative, continuation(stub.requests[0]).narrative);
  assert.deepEqual(completed.segments[1].choices, choices);
  assert.equal(completed.segments[1].check, null);
  assert.equal(completed.segments[1].selectedChoiceId, null);
  assert.deepEqual(await new AdventureStore(directory).load(), completed);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
});

test('duplicate and conflicting clicks and concurrent retry produce only one assessment', async (t) => {
  const { store } = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const stub = provider(async (request) => { entered.resolve(); await release.promise; return continuation(request); });
  const controller = new StoryController(store, source(stub));
  const first = controller.submitChoice('scene-1', 'wait');
  await assert.rejects(controller.submitChoice('scene-1', 'wait'), /already pending/);
  await entered.promise;
  const pending = await controller.restore();
  await assert.rejects(controller.submitChoice('scene-1', 'enter'), /already pending/);
  await assert.rejects(controller.retryTurn(pending.phase.choice.turnId), /already pending/);
  await assert.rejects(controller.retryOpening(), /already pending/);
  assert.equal((await store.load()).segments[0].selectedChoiceId, 'wait');
  release.resolve();
  assert.equal((await first).adventure.segments.length, 2);
  assert.equal(stub.requests.length, 1);
});

test('a delayed click cannot select a reused choice ID in a later scene', async (t) => {
  const { store } = await fixture(t);
  const stub = provider();
  const controller = new StoryController(store, source(stub));
  const first = await controller.submitChoice('scene-1', 'wait');
  const sceneId = first.adventure.segments[1].id;
  const bytes = await fs.readFile(store.activePath, 'utf8');
  await assert.rejects(controller.submitChoice('scene-1', 'wait'), /no longer current/);
  await assert.rejects(controller.retryTurn(sceneId), /No matching turn/);
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  assert.equal(stub.requests.length, 1);
  const second = await controller.submitChoice(sceneId, 'wait');
  assert.equal(second.adventure.segments.length, 3);
  assert.equal(second.adventure.segments[1].selectedChoiceId, 'wait');
  assert.notEqual(second.adventure.segments[2].id, sceneId);
});

test('timeout retries and restart reuse the same saved decision and turn ID with current provider settings', async (t) => {
  const { store, directory } = await fixture(t);
  const before = await store.load();
  const failure = new ProviderError('ollama', 'request-timeout', 'Retry the request.');
  const failing = provider(() => { throw failure; });
  const controller = new StoryController(store, source(failing, 'old-model'));
  await assert.rejects(controller.submitChoice('scene-1', 'enter'), (error) => error === failure);
  const pending = await controller.restore();
  const bytes = await fs.readFile(store.activePath, 'utf8');
  assert.equal(pending.phase.kind, 'pending-assessment');
  assert.deepEqual(pending.segments[0], { ...before.segments[0], selectedChoiceId: 'enter' });
  await assert.rejects(controller.retryTurn(pending.phase.choice.turnId), (error) => error === failure);
  await assert.rejects(controller.submitChoice('scene-1', 'enter'), /already pending/);
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  assert.equal(failing.requests.length, 2);
  assert.deepEqual(failing.requests[1].choice, failing.requests[0].choice);
  const recovered = provider();
  recovered.kind = 'openai';
  const restarted = new StoryController(new AdventureStore(directory), source(recovered, 'new-model'));
  const result = await restarted.retryTurn(pending.phase.choice.turnId);
  assert.equal(result.adventure.id, before.id);
  assert.equal(result.adventure.segments.length, 2);
  assert.equal(result.adventure.segments[1].id, pending.phase.choice.turnId);
  assert.equal(recovered.requests[0].modelId, 'new-model');
  assert.deepEqual(recovered.requests[0].choice, pending.phase.choice);
  assert.deepEqual(await restarted.restore(), result.adventure);
});

test('invalid input, unknown choices, and stale retry IDs leave storage untouched', async (t) => {
  const { store } = await fixture(t);
  const stub = provider();
  const controller = new StoryController(store, source(stub));
  const bytes = await fs.readFile(store.activePath, 'utf8');
  for (const args of [[null, 'wait'], ['scene-1', {}], ['', 'wait'], ['scene-1', ' '], ['old-scene', 'wait'], ['scene-1', 'unknown']]) {
    await assert.rejects(controller.submitChoice(...args), TypeError);
  }
  for (const turnId of [null, {}, ' ', 'missing-turn']) await assert.rejects(controller.retryTurn(turnId));
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  assert.equal(stub.requests.length, 0);
});

for (const invalid of [
  { kind: 'no-check', narrative: 'A scene.', choices: [] },
  { kind: 'no-check', narrative: 'A scene.', choices: [choices[0], choices[0], choices[1]] },
  { kind: 'check', difficulty: 'Impossible', attribute: 'Strength' }
]) {
  test(`malformed ${invalid.kind} assessment preserves the pending choice and prior story`, async (t) => {
    const { store } = await fixture(t);
    const controller = new StoryController(store, source(provider(() => invalid)));
    await assert.rejects(controller.submitChoice('scene-1', 'wait'), ProviderContractError);
    const pending = await store.load();
    assert.equal(pending.phase.kind, 'pending-assessment');
    assert.equal(pending.segments.length, 1);
    assert.equal(pending.segments[0].narrative, adventure().segments[0].narrative);
    assert.equal(pending.segments[0].selectedChoiceId, 'wait');
    assert.equal(pending.segments[0].check, null);
  });
}

test('two controllers sharing storage cannot both submit the same source scene', async (t) => {
  const { store } = await fixture(t);
  const stub = provider();
  const results = await Promise.allSettled([
    new StoryController(store, source(stub)).submitChoice('scene-1', 'wait'),
    new StoryController(store, source(stub)).submitChoice('scene-1', 'wait')
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(stub.requests.length, 1);
  assert.equal((await store.load()).segments.length, 2);
});

for (const failingRename of [2, 3]) {
  test(`save failure at ${failingRename === 2 ? 'selection' : 'continuation commit'} preserves a recoverable adventure`, async (t) => {
    let renames = 0;
    const { store } = await fixture(t, {
      ...fs,
      rename: async (from, to) => {
        if (to.endsWith('adventure.json') && ++renames === failingRename) throw new Error('Save failed.');
        return fs.rename(from, to);
      }
    });
    const stub = provider();
    const controller = new StoryController(store, source(stub));
    await assert.rejects(controller.submitChoice('scene-1', 'wait'), /Save failed/);
    const restored = await store.load();
    assert.equal(restored.segments.length, 1);
    if (failingRename === 2) {
      assert.deepEqual(restored, adventure());
      assert.equal(stub.requests.length, 0);
      assert.equal((await controller.submitChoice('scene-1', 'wait')).adventure.segments.length, 2);
    } else {
      assert.equal(restored.phase.kind, 'pending-assessment');
      const result = await controller.retryTurn(restored.phase.choice.turnId);
      assert.equal(result.adventure.segments.length, 2);
      assert.equal(result.adventure.segments[1].id, restored.phase.choice.turnId);
      assert.equal(stub.requests.length, 2);
    }
  });
}

test('a late no-check response cannot alter a replacement adventure', async (t) => {
  const { store } = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const slow = provider(async (request) => { entered.resolve(); await release.promise; return continuation(request); });
  const first = new StoryController(store, source(slow)).submitChoice('scene-1', 'wait');
  const rejected = assert.rejects(first, /No matching turn/);
  await entered.promise;
  const replacement = new NewStoryController(store);
  const confirmation = await replacement.request();
  await replacement.resolve(confirmation.confirmationId, 'Yes');
  const old = adventure();
  await new StoryController(store, source(provider())).startOpening({ theme: old.theme, character: old.character });
  const bytes = await fs.readFile(store.activePath, 'utf8');
  release.resolve();
  await rejected;
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
});

test('a context failure retains the selected turn for retry with a usable budget', async (t) => {
  const { store } = await fixture(t);
  const stub = provider();
  await assert.rejects(new StoryController(store, source(stub), { contextBudgetTokens: 1 }).submitChoice('scene-1', 'wait'),
    (error) => error.code === 'context-budget-exceeded');
  const pending = await store.load();
  assert.equal(pending.phase.kind, 'pending-assessment');
  assert.equal(stub.requests.length, 0);
  const result = await new StoryController(store, source(stub)).retryTurn(pending.phase.choice.turnId);
  assert.equal(result.adventure.segments.length, 2);
});

for (const kind of ['ollama', 'openai']) {
  test(`${kind} adapter assessment stub completes a persisted no-check turn`, async (t) => {
    const { store } = await fixture(t);
    const key = 'sk-choice-private-key';
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = kind === 'ollama' ? body.messages : body.input;
      const request = JSON.parse(messages[1].content);
      assert.equal(request.operation, 'assessment');
      assert.equal(request.choice.choiceId, 'wait');
      assert.equal(body.model, 'selected-model');
      assert.ok(!init.body.includes(key));
      const text = JSON.stringify(continuation(request));
      return new Response(JSON.stringify(kind === 'ollama'
        ? { done: true, message: { role: 'assistant', content: text } }
        : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const adapter = kind === 'ollama' ? new OllamaAdapter('localhost:11434', { fetchImpl })
      : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => key }, { fetchImpl });
    const result = await new StoryController(store, source(adapter, 'selected-model')).submitChoice('scene-1', 'wait');
    assert.equal(result.kind, 'continued');
    assert.equal(result.adventure.segments.length, 2);
    assert.ok(!(await fs.readFile(store.activePath, 'utf8')).includes(key));
  });
}
