const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { AdventureProgress } = require('../dist/main/adventure-progress.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');

const secret = 'sk-test-private-response-data';
const character = {
  name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
  attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
};
const choices = [
  { id: 'inspect', text: 'Inspect the gate.' },
  { id: 'wait', text: 'Wait until dawn.' },
  { id: 'leave', text: 'Leave the abbey.' }
];
const choice = { turnId: 'turn-1', choiceId: 'inspect', choiceText: 'Inspect the gate.' };
const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};
const common = { modelId: 'story-model', paragraphTarget: 2, choiceTarget: 3 };
const operations = [
  {
    method: 'generateOpening', phase: 'pending-opening',
    request: { ...common, theme: 'Horror', character, rules: 'D100 rules' },
    valid: { premise: 'The abbey bell rings.', narrative: 'The gate is locked.', choices },
    invalid: { premise: 'The abbey bell rings.', narrative: secret, choices: [choices[0], choices[0], choices[2]] }
  },
  {
    method: 'assessAction', phase: 'pending-assessment',
    request: { ...common, context: 'The gate is locked.', choice, attributes: character.attributes },
    valid: { kind: 'check', difficulty: 'Hard', attribute: 'Strength' },
    invalid: { kind: 'check', difficulty: 'Impossible', attribute: 'Strength' }
  },
  {
    method: 'assessAction', phase: 'pending-assessment',
    request: { ...common, context: 'The path is clear.', choice, attributes: character.attributes },
    valid: { kind: 'no-check', narrative: 'Mira follows the path.', choices },
    invalid: { kind: 'no-check', narrative: secret, choices: [] }
  },
  {
    method: 'narrateCheck', phase: 'pending-narration',
    request: { ...common, context: 'The gate is locked.', choice, check },
    valid: { outcome: 'success', narrative: 'The gate gives way.', choices },
    invalid: { outcome: 'failure', narrative: secret, choices }
  },
  {
    method: 'summarize', phase: 'pending-summary',
    request: { modelId: 'story-model', kind: 'chapter', chapterNumber: 1, context: 'Chapter events.' },
    valid: { text: 'Mira reached the abbey.', keyFacts: ['The gate opened.'], unresolvedThreads: [] },
    invalid: { text: '', keyFacts: [secret], unresolvedThreads: [] }
  },
  {
    method: 'summarize', phase: 'pending-summary',
    request: { modelId: 'story-model', kind: 'global', context: 'Previous chapters.' },
    valid: { text: 'Mira is exploring the abbey.', keyFacts: [], unresolvedThreads: ['Find the bell.'] },
    invalid: { text: secret, keyFacts: [], unresolvedThreads: ['Find the bell.', 'Find the bell.'] }
  }
];

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

async function stub(t, provider, handler, timeoutMs = 1000) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push(body ? JSON.parse(body) : null);
      handler(response, requests.length);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const address = `http://127.0.0.1:${server.address().port}`;
  const adapter = provider === 'ollama'
    ? new OllamaAdapter(address, { timeoutMs })
    : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
      timeoutMs,
      fetchImpl: (url, init) => fetch(`${address}${new URL(url).pathname}`, init)
    });
  return { adapter, requests };
}

function output(response, provider, value, mode = 'content') {
  response.writeHead(200, { 'content-type': 'application/json' });
  if (mode === 'http-json') {
    response.end(`{invalid ${secret}`);
    return;
  }
  const text = mode === 'content-json' ? `{invalid ${secret}` : JSON.stringify(value);
  const envelope = provider === 'ollama'
    ? { done: mode !== 'envelope', message: { role: 'assistant', content: text } }
    : { status: mode === 'envelope' ? 'incomplete' : 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] };
  response.end(JSON.stringify(envelope));
}

function exhausted(provider) {
  return (error) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.provider, provider);
    assert.equal(error.code, 'invalid-provider-response');
    assert.match(error.message, /Retry.*Settings/);
    assert.ok(!`${error.stack}${JSON.stringify(error)}`.includes(secret));
    assert.equal(error.cause, undefined);
    return true;
  };
}

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-retries-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-retries-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function adventure() {
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror', character,
    premise: 'A bell sounds under the abbey.',
    segments: [{
      id: 'segment-1', chapterNumber: 1, narrative: 'The gate is locked.', choices,
      selectedChoiceId: null, check: null, createdAt: '2026-11-11T12:00:00.000Z'
    }],
    chapterSummaries: [{ chapterNumber: 1, throughSegmentId: 'segment-1', text: 'Mira reached the abbey.' }],
    globalSummary: 'Find the source of the bell.', phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

for (const provider of ['ollama', 'openai']) {
  for (const [index, operation] of operations.entries()) {
    test(`${provider} ${operation.method} variant ${index}: validates every attempt and stops on success`, async (t) => {
      const { adapter, requests } = await stub(t, provider, (response, count) => {
        output(response, provider, count < 3 ? operation.invalid : operation.valid);
      });
      const request = freeze(structuredClone(operation.request));
      assert.deepEqual(await adapter[operation.method](request), operation.valid);
      assert.equal(requests.length, 3);
      assert.deepEqual(requests[0], requests[1]);
      assert.deepEqual(requests[0], requests[2]);
      assert.deepEqual(request, operation.request);
      // A new operation starts with its own attempt budget and stops immediately on success.
      assert.deepEqual(await adapter[operation.method](request), operation.valid);
      assert.equal(requests.length, 4);
    });

    test(`${provider} ${operation.method} variant ${index}: exhaustion preserves saved ${operation.phase}`, async (t) => {
      const userData = await temporaryUserData(t);
      const store = new AdventureStore(userData);
      const progress = new AdventureProgress(store);
      await store.save(adventure());
      let request = structuredClone(operation.request);
      let rolls = 0;
      t.mock.method(crypto, 'randomInt', () => { rolls += 1; return 25; });
      if (operation.phase === 'pending-assessment' || operation.phase === 'pending-narration') {
        request.choice = await progress.selectChoice('inspect');
        if (operation.phase === 'pending-narration') {
          request.check = await progress.recordCheck(request.choice.turnId, 'Hard', 'Strength');
        }
      } else {
        const saved = adventure();
        saved.phase = operation.phase === 'pending-opening'
          ? { kind: 'pending-opening', turnId: 'opening-1' }
          : { kind: 'pending-summary', turnId: 'summary-1', chapterNumber: 1 };
        if (operation.phase === 'pending-opening') {
          saved.segments = [];
          saved.premise = null;
          saved.chapterSummaries = [];
          saved.globalSummary = '';
        }
        await store.save(saved);
      }
      const before = await progress.restore();
      const activeBytes = await fs.readFile(store.activePath, 'utf8');
      const backupBytes = await fs.readFile(store.backupPath, 'utf8');
      let valid = false;
      const { adapter, requests } = await stub(t, provider, (response) => {
        output(response, provider, valid ? operation.valid : operation.invalid);
      });
      freeze(request);
      await assert.rejects(adapter[operation.method](request), exhausted(provider));
      assert.equal(requests.length, 3);
      const restarted = new AdventureProgress(new AdventureStore(userData));
      assert.deepEqual(await restarted.restore(), before);
      assert.equal(await fs.readFile(store.activePath, 'utf8'), activeBytes);
      assert.equal(await fs.readFile(store.backupPath, 'utf8'), backupBytes);
      for (const body of requests) assert.deepEqual(body, requests[0]);

      // Player retry uses the same pending request, with no duplicate decision or roll.
      valid = true;
      const result = await adapter[operation.method](request);
      assert.deepEqual(result, operation.valid);
      assert.equal(requests.length, 4);
      assert.deepEqual(requests[3], requests[0]);
      assert.deepEqual(await restarted.restore(), before);
      if (operation.phase === 'pending-narration') {
        const completed = await restarted.commitTurn(request.choice.turnId, {
          id: 'segment-2', chapterNumber: 1, narrative: result.narrative, choices: result.choices,
          selectedChoiceId: null, check: request.check, createdAt: '2026-11-11T12:01:00.000Z'
        });
        assert.equal(completed.segments.length, 2);
        assert.deepEqual(completed.segments[1].check, request.check);
        assert.equal(completed.phase.kind, 'ready');
      }
      assert.equal(rolls, operation.phase === 'pending-narration' ? 1 : 0);
    });
  }

  for (const mode of ['http-json', 'envelope', 'content-json']) {
    test(`${provider} retries malformed ${mode} and maps exhaustion safely`, async (t) => {
      const { adapter, requests } = await stub(t, provider, (response, count) => {
        output(response, provider, operations[0].valid, count < 3 ? mode : 'content');
      });
      assert.deepEqual(await adapter.generateOpening(operations[0].request), operations[0].valid);
      assert.equal(requests.length, 3);
      const failing = await stub(t, provider, (response) => output(response, provider, null, mode));
      await assert.rejects(failing.adapter.generateOpening(operations[0].request), exhausted(provider));
      assert.equal(failing.requests.length, 3);
    });
  }

  for (const [status, code] of [[401, provider === 'openai' ? 'authentication-failed' : 'request-failed'],
    [404, 'inaccessible-model'], [500, 'request-failed']]) {
    test(`${provider} does not retry HTTP ${status} during generation`, async (t) => {
      const { adapter, requests } = await stub(t, provider, (response) => {
        response.writeHead(status);
        response.end(secret);
      });
      await assert.rejects(adapter.generateOpening(operations[0].request), (error) =>
        error instanceof ProviderError && error.code === code && !error.message.includes(secret));
      assert.equal(requests.length, 1);
    });
  }

  test(`${provider} does not retry timeouts, invalid configuration, or model discovery`, async (t) => {
    const { adapter, requests } = await stub(t, provider, () => {}, 25);
    await assert.rejects(adapter.generateOpening(operations[0].request), (error) =>
      error instanceof ProviderError && error.code === 'request-timeout');
    assert.equal(requests.length, 1);
    await assert.rejects(adapter.generateOpening({ ...operations[0].request, modelId: '' }), TypeError);
    assert.equal(requests.length, 1);

    const discovery = await stub(t, provider, (response) => output(response, provider, null, 'http-json'));
    await assert.rejects(discovery.adapter.listModels(), ProviderContractError);
    assert.equal(discovery.requests.length, 1);
  });
}
