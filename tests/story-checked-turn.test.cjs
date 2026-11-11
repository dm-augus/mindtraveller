const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { NewStoryController } = require('../dist/main/new-story.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { StoryContextBuilder, estimateContextTokens } = require('../dist/main/story-context.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');
const { ProviderError } = require('../dist/shared/provider-error.js');

const choices = [
  { id: 'force', text: 'Force the gate.' }, { id: 'wait', text: 'Wait for dawn.' }, { id: 'leave', text: 'Leave the abbey.' }
];

function adventure() {
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell sounds beneath the abbey.',
    segments: [{ id: 'scene-1', chapterNumber: 1, narrative: 'The abbey gate is sealed.', choices,
      selectedChoiceId: null, check: null, createdAt: '2026-11-11T12:00:00.000Z' }],
    chapterSummaries: [], globalSummary: 'Find Mira’s sister.', phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

function narration(request) {
  return {
    outcome: request.check.outcome,
    narrative: request.check.outcome === 'success' ? 'The gate gives way.' : 'The gate withstands Mira’s efforts.',
    choices: Array.from({ length: request.choiceTarget }, (_, index) => ({ id: `next-${index}`, text: `Explore path ${index}.` }))
  };
}

function provider(handlers = {}) {
  const assessments = [];
  const narrations = [];
  return {
    kind: 'ollama', assessments, narrations,
    generateOpening: async () => ({ premise: 'A new mystery.', narrative: 'A new road begins.', choices }),
    assessAction: async (request) => {
      assessments.push(structuredClone(request));
      return handlers.assess ? handlers.assess(request) : { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
    },
    narrateCheck: async (request) => {
      narrations.push(structuredClone(request));
      return handlers.narrate ? handlers.narrate(request) : narration(request);
    }
  };
}

function source(stub, modelId = 'story-model') {
  return async () => ({ provider: stub, modelId });
}

function countRolls(t, value = 25) {
  let rolls = 0;
  t.mock.method(crypto, 'randomInt', (min, max) => {
    assert.deepEqual([min, max], [1, 101]);
    rolls += 1;
    return value;
  });
  return () => rolls;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, files = fs) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-checked-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-checked-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const store = new AdventureStore(directory, files);
  await store.save(adventure());
  return { store, directory };
}

for (const roll of [25, 30, 99]) {
  test(`checked turn rolling ${roll} saves the authoritative result before compatible narration and commits once`, async (t) => {
    const { store, directory } = await fixture(t);
    const rolls = countRolls(t, roll);
    let pending;
    const stub = provider({ narrate: async (request) => {
      pending = await new AdventureStore(directory).load();
      assert.equal(pending.phase.kind, 'pending-narration');
      assert.equal(pending.segments.length, 1);
      assert.equal(pending.segments[0].selectedChoiceId, 'force');
      assert.deepEqual(request.choice, pending.phase.choice);
      assert.deepEqual(request.check, pending.phase.check);
      assert.deepEqual(request.check, {
        difficulty: 'Hard', attribute: 'Strength', attributeValue: 1, baseThreshold: 20,
        threshold: 30, roll, outcome: roll <= 30 ? 'success' : 'failure'
      });
      assert.deepEqual(JSON.parse(request.context).latestCheck, pending.phase.check);
      assert.equal(request.modelId, 'configured-model');
      assert.equal(request.paragraphTarget, 2);
      assert.equal(request.choiceTarget, 4);
      return narration(request);
    } });
    const controller = new StoryController(store, source(stub, 'configured-model'), { paragraphTarget: 2, choiceTarget: 4, chapterLength: 1 });
    const result = await controller.submitChoice('scene-1', 'force');
    assert.equal(result.kind, 'continued');
    assert.equal(result.adventure.phase.kind, 'ready');
    assert.equal(result.adventure.segments.length, 2);
    const segment = result.adventure.segments[1];
    assert.equal(segment.id, pending.phase.choice.turnId);
    assert.equal(segment.chapterNumber, 2);
    assert.equal(segment.narrative, narration(stub.narrations[0]).narrative);
    assert.deepEqual(segment.check, pending.phase.check);
    assert.equal(segment.choices.length, 4);
    assert.deepEqual(await new AdventureStore(directory).load(), result.adventure);
    assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), pending);
    assert.equal(stub.assessments.length, 1);
    assert.equal(stub.narrations.length, 1);
    await assert.rejects(controller.retryTurn(pending.phase.choice.turnId), /No matching turn/);
    assert.equal(rolls(), 1);
  });
}

test('narration failures and restart retry reuse the same saved roll and skip reassessment', async (t) => {
  const { store, directory } = await fixture(t);
  const rolls = countRolls(t);
  const timeout = new ProviderError('ollama', 'request-timeout', 'Retry narration.');
  const failing = provider({ narrate: () => { throw timeout; } });
  const controller = new StoryController(store, source(failing));
  await assert.rejects(controller.submitChoice('scene-1', 'force'), (error) => error === timeout);
  const saved = await store.load();
  const bytes = await fs.readFile(store.activePath, 'utf8');
  assert.equal(saved.phase.kind, 'pending-narration');
  await assert.rejects(controller.retryTurn(saved.phase.choice.turnId), (error) => error === timeout);
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  assert.equal(failing.assessments.length, 1);
  assert.equal(failing.narrations.length, 2);
  for (const request of failing.narrations) assert.deepEqual(request.check, saved.phase.check);

  const recovered = provider({ assess: () => { throw new Error('Must not reassess a rolled turn.'); } });
  recovered.kind = 'openai';
  const restarted = new StoryController(new AdventureStore(directory), source(recovered, 'replacement-model'));
  const completed = await restarted.retryTurn(saved.phase.choice.turnId);
  assert.equal(recovered.assessments.length, 0);
  assert.equal(recovered.narrations[0].modelId, 'replacement-model');
  assert.deepEqual(recovered.narrations[0].check, saved.phase.check);
  assert.deepEqual(completed.adventure.segments[1].check, saved.phase.check);
  assert.equal(completed.adventure.segments[1].id, saved.phase.choice.turnId);
  assert.equal(completed.adventure.segments.length, 2);
  assert.equal(rolls(), 1);
});

test('restoring an already saved failure never consumes a new roll', async (t) => {
  const { store, directory } = await fixture(t);
  const saved = adventure();
  saved.segments[0].selectedChoiceId = 'force';
  saved.phase = {
    kind: 'pending-narration', choice: { turnId: 'saved-turn', choiceId: 'force', choiceText: 'Force the gate.' },
    check: { difficulty: 'Hard', attribute: 'Strength', attributeValue: 1, baseThreshold: 20, threshold: 30, roll: 100, outcome: 'failure' }
  };
  await store.save(saved);
  t.mock.method(crypto, 'randomInt', () => { throw new Error('Saved rolls cannot be regenerated.'); });
  const stub = provider({ assess: () => { throw new Error('Saved narration cannot be reassessed.'); } });
  const controller = new StoryController(new AdventureStore(directory), source(stub));
  await assert.rejects(controller.retryTurn('wrong-turn'), /No matching turn/);
  const result = await controller.retryTurn('saved-turn');
  assert.equal(stub.assessments.length, 0);
  assert.deepEqual(result.adventure.segments[1].check, saved.phase.check);
});

for (const assessment of [
  { kind: 'check', difficulty: 'Impossible', attribute: 'Strength' },
  { kind: 'check', difficulty: 'Hard', attribute: 'Wisdom' },
  { kind: 'check', difficulty: 'Hard', attribute: 'Strength', roll: 1 }
]) {
  test('invalid or model-supplied check details are rejected before rolling or narration', async (t) => {
    const { store } = await fixture(t);
    const rolls = countRolls(t);
    const stub = provider({ assess: () => assessment });
    await assert.rejects(new StoryController(store, source(stub)).submitChoice('scene-1', 'force'), ProviderContractError);
    assert.equal((await store.load()).phase.kind, 'pending-assessment');
    assert.equal(stub.narrations.length, 0);
    assert.equal(rolls(), 0);
  });
}

test('contradictory narration preserves the authoritative roll for a compatible retry', async (t) => {
  const { store } = await fixture(t);
  const rolls = countRolls(t);
  let contradict = true;
  const stub = provider({ narrate: (request) => ({ ...narration(request), outcome: contradict ? 'failure' : request.check.outcome }) });
  const controller = new StoryController(store, source(stub));
  await assert.rejects(controller.submitChoice('scene-1', 'force'), ProviderContractError);
  const saved = await store.load();
  assert.equal(saved.phase.kind, 'pending-narration');
  assert.equal(saved.phase.check.outcome, 'success');
  assert.equal(saved.segments.length, 1);
  contradict = false;
  const completed = await controller.retryTurn(saved.phase.choice.turnId);
  assert.deepEqual(completed.adventure.segments[1].check, saved.phase.check);
  assert.equal(stub.assessments.length, 1);
  assert.equal(rolls(), 1);
});

for (const failingRename of [3, 4]) {
  test(`failed ${failingRename === 3 ? 'roll save prevents narration' : 'narration commit retains the saved roll'}`, async (t) => {
    let renames = 0;
    const { store } = await fixture(t, {
      ...fs,
      rename: async (from, to) => {
        if (to.endsWith('adventure.json') && ++renames === failingRename) throw new Error('Save failed.');
        return fs.rename(from, to);
      }
    });
    const rolls = countRolls(t);
    const stub = provider();
    const controller = new StoryController(store, source(stub));
    await assert.rejects(controller.submitChoice('scene-1', 'force'), /Save failed/);
    const saved = await store.load();
    assert.equal(saved.segments.length, 1);
    assert.equal(saved.phase.kind, failingRename === 3 ? 'pending-assessment' : 'pending-narration');
    assert.equal(stub.narrations.length, failingRename === 3 ? 0 : 1);
    const completed = await controller.retryTurn(saved.phase.choice.turnId);
    assert.equal(completed.adventure.segments.length, 2);
    assert.equal(completed.adventure.segments[1].id, saved.phase.choice.turnId);
    // An unsaved roll may be regenerated; a saved roll must always be reused.
    assert.equal(rolls(), failingRename === 3 ? 2 : 1);
    if (failingRename === 4) assert.deepEqual(completed.adventure.segments[1].check, saved.phase.check);
  });
}

test('duplicate submissions and narration retries while waiting cannot reroll or submit another request', async (t) => {
  const { store } = await fixture(t);
  const rolls = countRolls(t);
  const entered = deferred();
  const release = deferred();
  const stub = provider({ narrate: async (request) => { entered.resolve(); await release.promise; return narration(request); } });
  const controller = new StoryController(store, source(stub));
  const first = controller.submitChoice('scene-1', 'force');
  await entered.promise;
  const saved = await store.load();
  assert.equal(saved.phase.kind, 'pending-narration');
  await assert.rejects(controller.submitChoice('scene-1', 'force'), /already pending/);
  await assert.rejects(controller.submitChoice('scene-1', 'wait'), /already pending/);
  await assert.rejects(controller.retryTurn(saved.phase.choice.turnId), /already pending/);
  release.resolve();
  await first;
  assert.equal(stub.assessments.length, 1);
  assert.equal(stub.narrations.length, 1);
  assert.equal(rolls(), 1);
});

test('narration resolves the active provider and model independently of assessment', async (t) => {
  const { store } = await fixture(t);
  const rolls = countRolls(t);
  const narrator = provider();
  narrator.kind = 'openai';
  let selected;
  const assessor = provider({ assess: () => {
    selected = { provider: narrator, modelId: 'narration-model' };
    return { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
  } });
  selected = { provider: assessor, modelId: 'assessment-model' };
  const result = await new StoryController(store, async () => selected).submitChoice('scene-1', 'force');
  assert.equal(assessor.assessments[0].modelId, 'assessment-model');
  assert.equal(assessor.narrations.length, 0);
  assert.equal(narrator.narrations[0].modelId, 'narration-model');
  assert.equal(result.adventure.segments[1].check.roll, 25);
  assert.equal(rolls(), 1);
});

for (const stage of ['assessment', 'narration']) {
  test(`a late ${stage} response cannot modify a replacement adventure`, async (t) => {
    const { store } = await fixture(t);
    const rolls = countRolls(t);
    const entered = deferred();
    const release = deferred();
    const handlers = stage === 'assessment'
      ? { assess: async () => { entered.resolve(); await release.promise; return { kind: 'check', difficulty: 'Hard', attribute: 'Strength' }; } }
      : { narrate: async (request) => { entered.resolve(); await release.promise; return narration(request); } };
    const first = new StoryController(store, source(provider(handlers))).submitChoice('scene-1', 'force');
    const rejected = assert.rejects(first, /No matching turn/);
    await entered.promise;
    const replacement = new NewStoryController(store);
    const confirmation = await replacement.request();
    await replacement.resolve(confirmation.confirmationId, 'Yes');
    const original = adventure();
    await new StoryController(store, source(provider())).startOpening({ theme: original.theme, character: original.character });
    const bytes = await fs.readFile(store.activePath, 'utf8');
    release.resolve();
    await rejected;
    assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
    assert.equal(rolls(), stage === 'assessment' ? 0 : 1);
  });
}

test('a narration context error after rolling remains retryable without reassessment or another roll', async (t) => {
  const { store } = await fixture(t);
  const rolls = countRolls(t);
  const pending = adventure();
  pending.segments[0].selectedChoiceId = 'force';
  pending.phase = { kind: 'pending-assessment', choice: { turnId: 'example', choiceId: 'force', choiceText: 'Force the gate.' } };
  const budget = estimateContextTokens(new StoryContextBuilder().build(pending));
  const stub = provider();
  await assert.rejects(new StoryController(store, source(stub), { contextBudgetTokens: budget }).submitChoice('scene-1', 'force'),
    (error) => error.code === 'context-budget-exceeded');
  const saved = await store.load();
  assert.equal(saved.phase.kind, 'pending-narration');
  assert.equal(stub.narrations.length, 0);
  await new StoryController(store, source(stub)).retryTurn(saved.phase.choice.turnId);
  assert.equal(stub.assessments.length, 1);
  assert.equal(rolls(), 1);
});

for (const kind of ['ollama', 'openai']) {
  for (const exhaust of [false, true]) {
    test(`${kind} ${exhaust ? 'exhausted' : 'successful'} automatic narration retries preserve one persisted roll`, async (t) => {
      const { store, directory } = await fixture(t);
      const rolls = countRolls(t);
      let assessments = 0;
      let narrations = 0;
      let compatible = false;
      const checks = [];
      const key = 'sk-checked-private-key';
      const fetchImpl = async (_url, init) => {
        const body = JSON.parse(init.body);
        const input = JSON.parse((kind === 'ollama' ? body.messages : body.input)[1].content);
        assert.ok(!init.body.includes(key));
        let value;
        if (input.operation === 'assessment') {
          assessments += 1;
          value = { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
        } else {
          assert.equal(input.operation, 'checked-narration');
          narrations += 1;
          checks.push(input.check);
          const saved = await new AdventureStore(directory).load();
          assert.equal(saved.phase.kind, 'pending-narration');
          assert.deepEqual(input.check, saved.phase.check);
          value = { ...narration(input), outcome: compatible || (!exhaust && narrations === 3) ? 'success' : 'failure' };
        }
        const text = JSON.stringify(value);
        return new Response(JSON.stringify(kind === 'ollama'
          ? { done: true, message: { role: 'assistant', content: text } }
          : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
      };
      const adapter = kind === 'ollama' ? new OllamaAdapter('localhost:11434', { fetchImpl })
        : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => key }, { fetchImpl });
      const controller = new StoryController(store, source(adapter));
      let result;
      if (exhaust) {
        await assert.rejects(controller.submitChoice('scene-1', 'force'), (error) =>
          error instanceof ProviderError && error.code === 'invalid-provider-response');
        const saved = await store.load();
        assert.equal(saved.phase.kind, 'pending-narration');
        assert.equal(saved.segments.length, 1);
        compatible = true;
        result = await new StoryController(new AdventureStore(directory), source(adapter)).retryTurn(saved.phase.choice.turnId);
      } else {
        result = await controller.submitChoice('scene-1', 'force');
      }
      assert.equal(assessments, 1);
      assert.equal(narrations, exhaust ? 4 : 3);
      assert.equal(rolls(), 1);
      assert.equal(result.adventure.segments.length, 2);
      for (const record of checks) assert.deepEqual(record, result.adventure.segments[1].check);
      assert.ok(!(await fs.readFile(store.activePath, 'utf8')).includes(key));
    });
  }
}
