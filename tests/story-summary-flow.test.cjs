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

const choices = [
  { id: 'wait', text: 'Wait for the abbess.' }, { id: 'force', text: 'Force the gate.' }, { id: 'leave', text: 'Leave the abbey.' }
];

function adventure() {
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell sounds beneath the abbey.',
    segments: [{ id: 'scene-1', chapterNumber: 1, narrative: 'The abbess waits at the sealed gate.',
      choices, selectedChoiceId: null, check: null, createdAt: '2026-11-11T12:00:00.000Z' }],
    chapterSummaries: [{ chapterNumber: 1, throughSegmentId: 'scene-1', text: 'The abbess is an ally. The gate is sealed.' }],
    globalSummary: 'Find Mira’s sister. The abbess is an ally.', phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

function memory(request) {
  return {
    text: request.kind === 'chapter' ? `Chapter ${request.chapterNumber}: Mira reached the abbey.` : 'Mira explores the abbey.',
    keyFacts: ['The abbess is an ally.'], unresolvedThreads: ['Find Mira’s sister.', 'Locate the buried bell.']
  };
}

function provider(options = {}) {
  const calls = { opening: 0, assessment: 0, narration: 0, summaries: [] };
  return {
    kind: 'ollama', calls,
    generateOpening: async () => {
      calls.opening += 1;
      return { premise: 'A new bell rings.', narrative: 'The road reaches the abbey.', choices };
    },
    assessAction: async () => {
      calls.assessment += 1;
      return options.checked ? { kind: 'check', difficulty: 'Hard', attribute: 'Strength' }
        : { kind: 'no-check', narrative: 'Mira waits. The abbess approaches.', choices };
    },
    narrateCheck: async (request) => {
      calls.narration += 1;
      return { outcome: request.check.outcome, narrative: 'The gate gives way.', choices };
    },
    summarize: async (request) => {
      calls.summaries.push(structuredClone(request));
      return options.summarize ? options.summarize(request) : memory(request);
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

async function fixture(t, { files = fs, initial = adventure() } = {}) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-summary-flow-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-summary-flow-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const store = new AdventureStore(directory, files);
  if (initial !== null) await store.save(initial);
  return { store, directory };
}

test('completed scenes and pending summaries are saved together before either memory level is requested', async (t) => {
  const writes = [];
  const { store, directory } = await fixture(t, { files: {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('adventure.json')) writes.push(JSON.parse(await fs.readFile(from, 'utf8')));
      return fs.rename(from, to);
    }
  } });
  const before = await store.load();
  let pending;
  const stub = provider({ summarize: async (request) => {
    pending = await new AdventureStore(directory).load();
    assert.equal(pending.phase.kind, 'pending-summary');
    assert.equal(pending.segments.length, 2);
    assert.equal(pending.phase.turnId, pending.segments[1].id);
    assert.equal(pending.segments[0].selectedChoiceId, 'wait');
    assert.equal(pending.segments[1].selectedChoiceId, null);
    assert.deepEqual(pending.segments[1].choices, choices);
    assert.deepEqual(pending.chapterSummaries, before.chapterSummaries);
    assert.equal(pending.globalSummary, before.globalSummary);
    return memory(request);
  } });
  const result = await new StoryController(store, source(stub), { chapterLength: 2 }).submitChoice('scene-1', 'wait');
  assert.deepEqual(stub.calls.summaries.map((request) => request.kind), ['chapter', 'global']);
  assert.equal(result.adventure.phase.kind, 'ready');
  assert.deepEqual(result.adventure.segments, pending.segments);
  assert.equal(result.adventure.chapterSummaries[0].throughSegmentId, pending.segments[1].id);
  assert.ok(result.adventure.chapterSummaries[0].text.includes('Locate the buried bell.'));
  assert.ok(result.adventure.globalSummary.includes('Find Mira’s sister.'));
  assert.deepEqual(writes.filter((saved) => saved.segments.length === 2).map((saved) => saved.phase.kind),
    ['pending-summary', 'ready']);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
});

test('below the chapter boundary no summary is requested; subsequent chapters summarize exactly when full', async (t) => {
  const { store } = await fixture(t);
  const stub = provider();
  const controller = new StoryController(store, source(stub), { chapterLength: 3 });
  let result = await controller.submitChoice('scene-1', 'wait');
  assert.equal(result.adventure.segments.length, 2);
  assert.equal(stub.calls.summaries.length, 0);
  result = await controller.submitChoice(result.adventure.segments.at(-1).id, 'wait');
  assert.equal(result.adventure.segments[2].chapterNumber, 1);
  assert.deepEqual(stub.calls.summaries.map((request) => [request.kind, request.chapterNumber]),
    [['chapter', 1], ['global', undefined]]);
  for (let count = 4; count <= 6; count += 1) {
    result = await controller.submitChoice(result.adventure.segments.at(-1).id, 'wait');
    assert.equal(result.adventure.segments.at(-1).chapterNumber, 2);
    assert.equal(stub.calls.summaries.length, count < 6 ? 2 : 4);
  }
  assert.deepEqual(result.adventure.chapterSummaries.map((summary) => summary.chapterNumber), [1, 2]);
  assert.equal(result.adventure.segments.length, 6);
});

for (const threshold of ['chapterSummaryThresholdTokens', 'globalSummaryThresholdTokens']) {
  test(`${threshold} connects early summary updates to completed turns`, async (t) => {
    const { store } = await fixture(t);
    const stub = provider();
    const result = await new StoryController(store, source(stub), { chapterLength: 10, [threshold]: 1 })
      .submitChoice('scene-1', 'wait');
    assert.equal(result.adventure.phase.kind, 'ready');
    assert.equal(result.adventure.segments.at(-1).chapterNumber, 1);
    assert.equal(stub.calls.summaries.length, 2);
    assert.equal(result.adventure.chapterSummaries[0].throughSegmentId, result.adventure.segments.at(-1).id);
  });
}

for (const checked of [false, true]) {
  for (const failedKind of ['chapter', 'global']) {
    test(`${checked ? 'checked' : 'no-check'} turn survives ${failedKind} summary failure and restart without repeating the completed segment`, async (t) => {
      const { store, directory } = await fixture(t);
      let rolls = 0;
      t.mock.method(crypto, 'randomInt', () => { rolls += 1; return 25; });
      const before = await store.load();
      const error = new ProviderError('ollama', 'request-timeout', 'Retry the summary.');
      const failing = provider({ checked, summarize: (request) => {
        if (request.kind === failedKind) throw error;
        return memory(request);
      } });
      const controller = new StoryController(store, source(failing), { chapterLength: 2 });
      await assert.rejects(controller.submitChoice('scene-1', checked ? 'force' : 'wait'), (caught) => caught === error);
      const pending = await controller.restore();
      const bytes = await fs.readFile(store.activePath, 'utf8');
      assert.equal(pending.phase.kind, 'pending-summary');
      assert.equal(pending.segments.length, 2);
      assert.equal(pending.segments[1].id, pending.phase.turnId);
      assert.deepEqual(pending.chapterSummaries, before.chapterSummaries);
      assert.equal(pending.globalSummary, before.globalSummary);
      if (checked) assert.equal(pending.segments[1].check.roll, 25);
      else assert.equal(pending.segments[1].check, null);
      await assert.rejects(controller.retryTurn(pending.phase.turnId), (caught) => caught === error);
      await assert.rejects(controller.submitChoice(pending.segments[1].id, 'wait'), /not ready/);
      assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
      assert.equal(failing.calls.assessment, 1);
      assert.equal(failing.calls.narration, checked ? 1 : 0);

      const recovered = provider();
      recovered.kind = 'openai';
      const restarted = new StoryController(new AdventureStore(directory), source(recovered, 'new-model'), { chapterLength: 2 });
      assert.deepEqual(await restarted.restore(), pending);
      assert.equal(recovered.calls.summaries.length, 0); // Restoration is available offline.
      await assert.rejects(restarted.retryTurn('wrong-turn'), /No matching turn/);
      const result = await restarted.retryTurn(pending.phase.turnId);
      assert.equal(result.adventure.phase.kind, 'ready');
      assert.deepEqual(result.adventure.segments, pending.segments);
      assert.ok(recovered.calls.summaries.every((request) => request.modelId === 'new-model'));
      assert.equal(recovered.calls.assessment, 0);
      assert.equal(recovered.calls.narration, 0);
      assert.equal(recovered.calls.opening, 0);
      assert.equal(rolls, checked ? 1 : 0);
      await assert.rejects(restarted.retryTurn(pending.phase.turnId), /No matching turn/);
    });
  }
}

for (const fail of [false, true]) {
  test(`a one-segment opening chapter ${fail ? 'recovers a failed summary without regenerating its opening' : 'automatically summarizes after saving its first scene'}`, async (t) => {
    const { store, directory } = await fixture(t, { initial: null });
    let failing = fail;
    const stub = provider({ summarize: (request) => {
      if (failing) throw new ProviderError('ollama', 'request-failed', 'Retry summary.');
      return memory(request);
    } });
    const controller = new StoryController(store, source(stub), { chapterLength: 1 });
    let completed;
    const setup = adventure();
    if (fail) {
      await assert.rejects(controller.startOpening({ theme: setup.theme, character: setup.character }), ProviderError);
      const pending = await new AdventureStore(directory).load();
      assert.equal(pending.phase.kind, 'pending-summary');
      assert.equal(pending.segments.length, 1);
      assert.equal(pending.premise, 'A new bell rings.');
      await assert.rejects(controller.retryOpening(), /No opening/);
      failing = false;
      completed = (await new StoryController(new AdventureStore(directory), source(stub), { chapterLength: 1 })
        .retryTurn(pending.phase.turnId)).adventure;
    } else {
      completed = await controller.startOpening({ theme: setup.theme, character: setup.character });
    }
    assert.equal(completed.phase.kind, 'ready');
    assert.equal(completed.segments.length, 1);
    assert.equal(completed.chapterSummaries[0].throughSegmentId, completed.segments[0].id);
    assert.equal(stub.calls.opening, 1);
  });
}

test('a failed summary commit preserves the completed segment and both prior memory levels', async (t) => {
  let renames = 0;
  const { store } = await fixture(t, { files: {
    ...fs,
    rename: async (from, to) => {
      if (to.endsWith('adventure.json') && ++renames === 4) throw new Error('Summary commit failed.');
      return fs.rename(from, to);
    }
  } });
  const stub = provider();
  const controller = new StoryController(store, source(stub), { chapterLength: 2 });
  await assert.rejects(controller.submitChoice('scene-1', 'wait'), /Summary commit failed/);
  const pending = await store.load();
  assert.equal(pending.phase.kind, 'pending-summary');
  assert.equal(pending.segments.length, 2);
  assert.deepEqual(pending.chapterSummaries, adventure().chapterSummaries);
  assert.equal(pending.globalSummary, adventure().globalSummary);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
  const result = await controller.retryTurn(pending.phase.turnId);
  assert.deepEqual(result.adventure.segments, pending.segments);
  assert.equal(stub.calls.assessment, 1);
  assert.equal(stub.calls.summaries.length, 4);
});

test('duplicate choices and retries are blocked while summarizing', async (t) => {
  const { store } = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const stub = provider({ summarize: async (request) => { entered.resolve(); await release.promise; return memory(request); } });
  const controller = new StoryController(store, source(stub), { chapterLength: 2 });
  const first = controller.submitChoice('scene-1', 'wait');
  await entered.promise;
  const pending = await controller.restore();
  await assert.rejects(controller.submitChoice(pending.segments[1].id, 'wait'), /already pending/);
  await assert.rejects(controller.retryTurn(pending.phase.turnId), /already pending/);
  release.resolve();
  const completed = await first;
  assert.equal(completed.adventure.segments.length, 2);
  assert.equal(stub.calls.assessment, 1);
  assert.equal(stub.calls.summaries.length, 2);
});

test('restart from a saved summary state finishes independently and a late original result cannot overwrite it', async (t) => {
  const { store, directory } = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const slow = provider({ summarize: async (request) => { entered.resolve(); await release.promise; return memory(request); } });
  const first = new StoryController(store, source(slow), { chapterLength: 2 }).submitChoice('scene-1', 'wait');
  const rejected = assert.rejects(first, /saved adventure changed/);
  await entered.promise;
  const recovered = provider();
  const restarted = new StoryController(new AdventureStore(directory), source(recovered), { chapterLength: 2 });
  const pending = await restarted.restore();
  assert.equal(pending.phase.kind, 'pending-summary');
  const completed = await restarted.retryTurn(pending.phase.turnId);
  const bytes = await fs.readFile(store.activePath, 'utf8');
  release.resolve();
  await rejected;
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  assert.deepEqual(completed.adventure.segments, pending.segments);
  assert.equal(recovered.calls.assessment, 0);
});

test('completed chapters are committed one at a time and a later failure resumes only remaining chapters', async (t) => {
  const initial = adventure();
  initial.chapterSummaries = [];
  initial.segments[0].selectedChoiceId = 'wait';
  initial.segments.push({ ...structuredClone(initial.segments[0]), id: 'scene-2', chapterNumber: 2, selectedChoiceId: null });
  const { store, directory } = await fixture(t, { initial });
  const stub = provider({ summarize: (request) => {
    if (request.kind === 'chapter' && request.chapterNumber === 2) throw new Error('Chapter two failed.');
    return memory(request);
  } });
  await assert.rejects(new StoryController(store, source(stub), { chapterLength: 1 }).submitChoice('scene-2', 'wait'), /Chapter two failed/);
  const pending = await store.load();
  assert.equal(pending.phase.kind, 'pending-summary');
  assert.equal(pending.phase.chapterNumber, 2);
  assert.deepEqual(pending.chapterSummaries.map((summary) => summary.chapterNumber), [1]);
  assert.equal(pending.segments.length, 3);
  const retry = provider();
  const result = await new StoryController(new AdventureStore(directory), source(retry), { chapterLength: 1 }).retryTurn(pending.phase.turnId);
  assert.deepEqual(retry.calls.summaries.filter((request) => request.kind === 'chapter').map((request) => request.chapterNumber), [2, 3]);
  assert.deepEqual(result.adventure.chapterSummaries.map((summary) => summary.chapterNumber), [1, 2, 3]);
  assert.deepEqual(result.adventure.segments, pending.segments);
});

test('each chapter and global operation reads the currently selected provider and model', async (t) => {
  const { store } = await fixture(t);
  const global = provider();
  global.kind = 'openai';
  let selected;
  const chapter = provider({ summarize: (request) => {
    assert.equal(request.kind, 'chapter');
    selected = { provider: global, modelId: 'global-model' };
    return memory(request);
  } });
  selected = { provider: chapter, modelId: 'chapter-model' };
  await new StoryController(store, async () => selected, { chapterLength: 2 }).submitChoice('scene-1', 'wait');
  assert.equal(chapter.calls.summaries[0].modelId, 'chapter-model');
  assert.equal(global.calls.summaries[0].kind, 'global');
  assert.equal(global.calls.summaries[0].modelId, 'global-model');
});

test('a late summary cannot resurrect an adventure replaced through New Story', async (t) => {
  const { store } = await fixture(t);
  const entered = deferred();
  const release = deferred();
  const slow = provider({ summarize: async (request) => { entered.resolve(); await release.promise; return memory(request); } });
  const first = new StoryController(store, source(slow), { chapterLength: 2 }).submitChoice('scene-1', 'wait');
  const rejected = assert.rejects(first, /saved adventure changed/);
  await entered.promise;
  const replacement = new NewStoryController(store);
  const confirmation = await replacement.request();
  await replacement.resolve(confirmation.confirmationId, 'Yes');
  const setup = adventure();
  await new StoryController(store, source(provider())).startOpening({ theme: setup.theme, character: setup.character });
  const bytes = await fs.readFile(store.activePath, 'utf8');
  release.resolve();
  await rejected;
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
});

test('malformed summary output leaves the completed scene available for a corrected retry', async (t) => {
  const { store } = await fixture(t);
  let valid = false;
  const stub = provider({ summarize: (request) => valid ? memory(request) : { text: '', keyFacts: [], unresolvedThreads: [] } });
  const controller = new StoryController(store, source(stub), { chapterLength: 2 });
  await assert.rejects(controller.submitChoice('scene-1', 'wait'), ProviderContractError);
  const pending = await store.load();
  assert.equal(pending.phase.kind, 'pending-summary');
  assert.equal(pending.segments.length, 2);
  valid = true;
  const result = await controller.retryTurn(pending.phase.turnId);
  assert.deepEqual(result.adventure.segments, pending.segments);
  assert.equal(stub.calls.assessment, 1);
});

for (const kind of ['ollama', 'openai']) {
  test(`${kind} exhausted summary retries retain the completed segment and retry only memory after restart`, async (t) => {
    const { store, directory } = await fixture(t);
    let valid = false;
    let assessments = 0;
    let chapters = 0;
    let globals = 0;
    const key = 'sk-summary-flow-private-key';
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body);
      const request = JSON.parse((kind === 'ollama' ? body.messages : body.input)[1].content);
      assert.ok(!init.body.includes(key));
      let value;
      if (request.operation === 'assessment') {
        assessments += 1;
        value = { kind: 'no-check', narrative: 'Mira greets the abbess.', choices };
      } else {
        assert.equal(request.operation, 'summary');
        assert.equal((await new AdventureStore(directory).load()).phase.kind, 'pending-summary');
        if (request.kind === 'chapter') chapters += 1;
        else globals += 1;
        value = request.kind === 'global' && !valid ? { text: '', keyFacts: [], unresolvedThreads: [] } : memory(request);
      }
      const text = JSON.stringify(value);
      return new Response(JSON.stringify(kind === 'ollama'
        ? { done: true, message: { role: 'assistant', content: text } }
        : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const adapter = kind === 'ollama' ? new OllamaAdapter('localhost:11434', { fetchImpl })
      : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => key }, { fetchImpl });
    await assert.rejects(new StoryController(store, source(adapter), { chapterLength: 2 }).submitChoice('scene-1', 'wait'),
      (error) => error instanceof ProviderError && error.code === 'invalid-provider-response');
    const pending = await store.load();
    assert.equal(pending.phase.kind, 'pending-summary');
    assert.equal(pending.segments.length, 2);
    assert.deepEqual(pending.chapterSummaries, adventure().chapterSummaries);
    valid = true;
    const result = await new StoryController(new AdventureStore(directory), source(adapter), { chapterLength: 2 }).retryTurn(pending.phase.turnId);
    assert.deepEqual(result.adventure.segments, pending.segments);
    assert.equal(result.adventure.phase.kind, 'ready');
    assert.equal(assessments, 1);
    assert.equal(chapters, 2);
    assert.equal(globals, 4);
    assert.ok(!(await fs.readFile(store.activePath, 'utf8')).includes(key));
  });
}
