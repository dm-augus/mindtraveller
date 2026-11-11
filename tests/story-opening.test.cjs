const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { NewStoryController } = require('../dist/main/new-story.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { selectStoryProvider } = require('../dist/main/providers/active-provider.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');

function setup(theme = 'Horror') {
  return {
    theme,
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    }
  };
}

function opening(request) {
  return {
    premise: `${request.character.name} faces a ${request.theme} mystery.`,
    narrative: `${request.character.name} reaches a medieval abbey.\n\nA bell sounds beneath the gate.`,
    choices: Array.from({ length: request.choiceTarget }, (_, index) => ({
      id: `choice-${index + 1}`, text: `Explore path ${index + 1}.`
    }))
  };
}

function stub(handler) {
  const requests = [];
  return {
    kind: 'ollama', requests,
    generateOpening: async (request) => {
      requests.push(structuredClone(request));
      return handler ? handler(request) : opening(request);
    }
  };
}

function source(provider, modelId = 'story-model') {
  return async () => ({ provider, modelId });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function storeFixture(t, files = fs) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-opening-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-opening-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  return new AdventureStore(directory, files);
}

for (const theme of ['Horror', 'Romance', 'High Fantasy']) {
  test(`${theme} opening saves validated setup before generation and commits its first scene atomically`, async (t) => {
    const store = await storeFixture(t);
    const input = setup(theme);
    if (theme === 'Romance') {
      input.character.allocationMethod = 'Simplified';
      input.character.attributes = { Strength: 1, Dexterity: 1, Intelligence: 1, Endurance: 0, Charisma: 0, Luck: 0 };
      input.character.nature = 'Neutral';
    }
    const before = structuredClone(input);
    let pending;
    const provider = stub(async (request) => {
      pending = await store.load();
      assert.equal(pending.phase.kind, 'pending-opening');
      assert.ok(pending.id && pending.phase.turnId);
      assert.equal(pending.premise, null);
      assert.deepEqual(pending.segments, []);
      assert.equal(request.theme, theme);
      assert.deepEqual(request.character, input.character);
      assert.equal(request.rules, GAME_RULES_TEXT);
      assert.equal(request.modelId, 'selected-model');
      assert.equal(request.paragraphTarget, 2);
      assert.equal(request.choiceTarget, 4);
      return opening(request);
    });
    const controller = new StoryController(store, source(provider, 'selected-model'), { paragraphTarget: 2, choiceTarget: 4 });
    const completed = await controller.startOpening(input);
    assert.equal(completed.id, pending.id);
    assert.equal(completed.phase.kind, 'ready');
    assert.equal(completed.premise, opening(provider.requests[0]).premise);
    assert.equal(completed.segments.length, 1);
    assert.deepEqual(completed.segments[0], {
      id: pending.phase.turnId, chapterNumber: 1,
      narrative: opening(provider.requests[0]).narrative,
      choices: opening(provider.requests[0]).choices,
      selectedChoiceId: null, check: null, createdAt: completed.updatedAt
    });
    assert.deepEqual(completed.chapterSummaries, []);
    assert.equal(completed.globalSummary, '');
    assert.deepEqual(await new StoryController(new AdventureStore(path.dirname(store.directory)), source(provider)).restore(), completed);
    assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
    assert.deepEqual(input, before);
    await assert.rejects(controller.retryOpening(), /No opening/);
    assert.equal(provider.requests.length, 1);
  });
}

test('invalid character setup and request budgets fail before writing or contacting the provider', async (t) => {
  const store = await storeFixture(t);
  let selections = 0;
  const provider = stub();
  const controller = new StoryController(store, async () => { selections += 1; return { provider, modelId: 'model' }; });
  for (const input of [null, {}, { ...setup(), theme: 'Unknown' },
    { ...setup(), character: { ...setup().character, name: '' } },
    { ...setup(), character: { ...setup().character, attributes: { ...setup().character.attributes, Strength: 3 } } }]) {
    await assert.rejects(controller.startOpening(input), TypeError);
  }
  assert.equal(selections, 0);
  assert.equal(await store.load(), null);
  await assert.rejects(new StoryController(store, source(provider), { contextBudgetTokens: 1 }).startOpening(setup()),
    (error) => error.code === 'context-budget-exceeded');
  assert.equal(await store.load(), null);
  assert.equal(provider.requests.length, 0);
});

test('duplicate start and retry clicks cannot send a second opening request', async (t) => {
  const store = await storeFixture(t);
  const entered = deferred();
  const release = deferred();
  const provider = stub(async (request) => { entered.resolve(); await release.promise; return opening(request); });
  const controller = new StoryController(store, source(provider));
  const first = controller.startOpening(setup());
  await entered.promise;
  await assert.rejects(controller.startOpening(setup()), /already pending/);
  await assert.rejects(controller.retryOpening(), /already pending/);
  assert.equal((await controller.restore()).phase.kind, 'pending-opening');
  release.resolve();
  assert.equal((await first).segments.length, 1);
  assert.equal(provider.requests.length, 1);
});

test('competing controllers sharing storage cannot both create an adventure', async (t) => {
  const store = await storeFixture(t);
  const release = deferred();
  let selections = 0;
  const provider = stub();
  const select = async () => {
    selections += 1;
    if (selections === 2) release.resolve();
    await release.promise;
    return { provider, modelId: 'model' };
  };
  const results = await Promise.allSettled([
    new StoryController(store, select).startOpening(setup()),
    new StoryController(store, select).startOpening(setup('Romance'))
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /saved adventure changed/);
  assert.equal(provider.requests.length, 1);
  assert.equal((await store.load()).segments.length, 1);
});

for (const failure of ['timeout', 'malformed']) {
  test(`${failure} opening leaves a recoverable setup; restart retry keeps its identity and uses current provider selection`, async (t) => {
    const store = await storeFixture(t);
    const failed = stub(() => {
      if (failure === 'timeout') throw new ProviderError('ollama', 'request-timeout', 'Retry the opening.');
      return { premise: 'A mystery.', narrative: 'A scene.', choices: [] };
    });
    const controller = new StoryController(store, source(failed, 'old-model'));
    await assert.rejects(controller.startOpening(setup()), failure === 'timeout' ? ProviderError : ProviderContractError);
    const pending = await store.load();
    const bytes = await fs.readFile(store.activePath, 'utf8');
    assert.equal(pending.phase.kind, 'pending-opening');
    assert.deepEqual(pending.character, setup().character);
    assert.deepEqual(pending.segments, []);
    await assert.rejects(controller.startOpening(setup('Romance')), /Confirm New Story/);
    assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
    const recovered = stub();
    recovered.kind = 'openai';
    const restarted = new StoryController(new AdventureStore(path.dirname(store.directory)), source(recovered, 'new-model'));
    const completed = await restarted.retryOpening();
    assert.equal(completed.id, pending.id);
    assert.equal(completed.segments[0].id, pending.phase.turnId);
    assert.equal(completed.segments.length, 1);
    assert.equal(recovered.requests[0].modelId, 'new-model');
    assert.deepEqual(recovered.requests[0].character, setup().character);
    assert.equal((await restarted.restore()).phase.kind, 'ready');
  });
}

test('existing stories require New Story confirmation; No preserves bytes and Yes permits a new opening', async (t) => {
  const store = await storeFixture(t);
  const provider = stub();
  const controller = new StoryController(store, source(provider));
  const first = await controller.startOpening(setup());
  const bytes = await fs.readFile(store.activePath, 'utf8');
  await assert.rejects(controller.startOpening(setup('Romance')), /Confirm New Story/);
  const replacement = new NewStoryController(store);
  const declined = await replacement.request();
  await replacement.resolve(declined.confirmationId, 'No');
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  const accepted = await replacement.request();
  await replacement.resolve(accepted.confirmationId, 'Yes');
  const second = await controller.startOpening(setup('Romance'));
  assert.notEqual(second.id, first.id);
  assert.equal(second.theme, 'Romance');
  assert.equal(provider.requests.length, 2);
});

test('a late opening response cannot resurrect an adventure discarded during generation', async (t) => {
  const store = await storeFixture(t);
  const entered = deferred();
  const release = deferred();
  const provider = stub(async (request) => { entered.resolve(); await release.promise; return opening(request); });
  const controller = new StoryController(store, source(provider));
  const first = controller.startOpening(setup());
  const rejected = assert.rejects(first, /saved adventure changed/);
  await entered.promise;
  const replacement = new NewStoryController(store);
  const confirmation = await replacement.request();
  await replacement.resolve(confirmation.confirmationId, 'Yes');
  assert.equal(await store.load(), null);
  release.resolve();
  await rejected;
  assert.equal(await store.load(), null);
  assert.equal((await controller.startOpening(setup('High Fantasy'))).theme, 'High Fantasy');
});

test('failed initial saves prevent generation; failed final commits retain the pending opening for retry', async (t) => {
  const noWrites = await storeFixture(t, {
    ...fs, writeFile: async () => { throw new Error('Storage unavailable.'); }
  });
  const unused = stub();
  await assert.rejects(new StoryController(noWrites, source(unused)).startOpening(setup()), /Storage unavailable/);
  assert.equal(unused.requests.length, 0);
  assert.equal(await noWrites.load(), null);

  let activeRenames = 0;
  const store = await storeFixture(t, {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('adventure.json') && ++activeRenames === 2) throw new Error('Commit failed.');
      return fs.rename(from, to);
    }
  });
  const provider = stub();
  const controller = new StoryController(store, source(provider));
  await assert.rejects(controller.startOpening(setup()), /Commit failed/);
  const pending = await controller.restore();
  assert.equal(pending.phase.kind, 'pending-opening');
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
  const completed = await controller.retryOpening();
  assert.equal(completed.id, pending.id);
  assert.equal(completed.segments.length, 1);
  assert.equal(completed.segments[0].id, pending.phase.turnId);
});

test('provider selection reads current settings and rejects missing models before starting an adventure', async (t) => {
  let configuration = {
    activeProvider: 'ollama', ollama: { serverAddress: 'localhost:11434', modelId: 'local-model' },
    openai: { modelId: 'external-model', hasSavedKey: true }
  };
  let keyReads = 0;
  const settings = {
    getPublicSettings: async () => configuration,
    getOpenAiKeyForRequest: async () => { keyReads += 1; return 'secret'; }
  };
  const local = await selectStoryProvider(settings);
  assert.ok(local.provider instanceof OllamaAdapter);
  assert.equal(local.modelId, 'local-model');
  configuration = { ...configuration, activeProvider: 'openai' };
  const external = await selectStoryProvider(settings);
  assert.ok(external.provider instanceof OpenAiAdapter);
  assert.equal(external.modelId, 'external-model');
  assert.equal(keyReads, 0);
  configuration = { ...configuration, openai: { modelId: null, hasSavedKey: true } };
  const store = await storeFixture(t);
  await assert.rejects(new StoryController(store, () => selectStoryProvider(settings)).startOpening(setup()), /model in Settings/);
  assert.equal(await store.load(), null);
});

for (const kind of ['ollama', 'openai']) {
  test(`${kind} adapter stub integrates opening generation with durable storage without saving credentials`, async (t) => {
    const store = await storeFixture(t);
    const key = 'sk-opening-test-private-key';
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body);
      const messages = kind === 'ollama' ? body.messages : body.input;
      const request = JSON.parse(messages[1].content);
      assert.equal(request.operation, 'opening');
      assert.equal(request.theme, 'Horror');
      assert.equal(request.character.name, 'Mira');
      assert.equal(body.model, 'configured-model');
      assert.ok(!init.body.includes(key));
      if (kind === 'openai') assert.equal(init.headers.authorization, `Bearer ${key}`);
      const text = JSON.stringify(opening(request));
      return new Response(JSON.stringify(kind === 'ollama'
        ? { done: true, message: { role: 'assistant', content: text } }
        : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const provider = kind === 'ollama' ? new OllamaAdapter('localhost:11434', { fetchImpl })
      : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => key }, { fetchImpl });
    const completed = await new StoryController(store, source(provider, 'configured-model')).startOpening(setup());
    assert.equal(completed.phase.kind, 'ready');
    assert.equal(completed.segments[0].choices.length, 3);
    assert.ok(!(await fs.readFile(store.activePath, 'utf8')).includes(key));
    assert.ok(!(await fs.readFile(store.backupPath, 'utf8')).includes(key));
  });
}
