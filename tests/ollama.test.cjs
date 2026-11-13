const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { OllamaAdapter, normalizeOllamaAddress } = require('../dist/main/providers/ollama.js');

const choices = [
  { id: 'inspect', text: 'Inspect the gate.' },
  { id: 'wait', text: 'Wait until dawn.' },
  { id: 'leave', text: 'Leave the abbey.' }
];
const character = {
  name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
  attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
};
const pendingChoice = { turnId: 'turn-1', choiceId: 'inspect', choiceText: 'Inspect the gate.' };
const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};

async function stubServer(t, handler) {
  const server = http.createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { server, address: `http://127.0.0.1:${server.address().port}` };
}

async function bodyJson(request) {
  let text = '';
  for await (const chunk of request) text += chunk;
  return JSON.parse(text);
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function expectProviderCode(code) {
  return (error) => error instanceof ProviderError && error.provider === 'ollama' && error.code === code;
}

test('normalizes server origins and rejects unsafe or endpoint addresses', () => {
  assert.equal(normalizeOllamaAddress('  localhost:11434/  '), 'http://localhost:11434');
  assert.equal(normalizeOllamaAddress('https://example.test:11434/'), 'https://example.test:11434');
  for (const address of [
    '', 'file:///tmp/model', 'http://user:pass@localhost:11434',
    'http://localhost:11434/api/chat', 'http://localhost:11434/?model=x',
    'http://localhost:11434/#fragment', 'http://localhost:bad'
  ]) assert.throws(() => normalizeOllamaAddress(address), TypeError);
  assert.throws(() => new OllamaAdapter('localhost:11434', { timeoutMs: 0 }), /timeout/);
});

test('local stub covers model discovery and all four story operations', async (t) => {
  const seen = [];
  const { address } = await stubServer(t, async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/tags') {
      sendJson(response, 200, { models: [{ name: 'story-model', model: 'story-model', size: 123 }] });
      return;
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/chat');
    const body = await bodyJson(request);
    seen.push(body);
    const input = JSON.parse(body.messages[1].content);
    const content = {
      opening: { premise: 'A bell wakes the abbey.', narrative: 'The road reaches the gate.', choices },
      assessment: { kind: 'check', difficulty: 'Hard', attribute: 'Strength' },
      'checked-narration': { outcome: 'success', narrative: 'The gate gives way.', choices },
      summary: { text: 'Mira reached the abbey.', keyFacts: ['The gate opened.'], unresolvedThreads: [] }
    }[input.operation];
    sendJson(response, 200, {
      model: body.model,
      message: { role: 'assistant', content: JSON.stringify(content) },
      done: true
    });
  });
  const adapter = new OllamaAdapter(`${address}/`, { timeoutMs: 1000 });
  assert.deepEqual(await adapter.listModels(), [{ id: 'story-model', label: 'story-model' }]);
  assert.deepEqual(await adapter.generateOpening({
    modelId: 'story-model', theme: 'Horror', character, rules: 'D100 rules',
    paragraphTarget: 2, choiceTarget: 3
  }), { premise: 'A bell wakes the abbey.', narrative: 'The road reaches the gate.', choices });
  assert.deepEqual(await adapter.assessAction({
    modelId: 'story-model', context: 'The gate is locked.', choice: pendingChoice,
    attributes: character.attributes, paragraphTarget: 2, choiceTarget: 3
  }), { kind: 'check', difficulty: 'Hard', attribute: 'Strength' });
  assert.deepEqual(await adapter.narrateCheck({
    modelId: 'story-model', context: 'The gate is locked.', choice: pendingChoice,
    check, paragraphTarget: 2, choiceTarget: 3
  }), { outcome: 'success', narrative: 'The gate gives way.', choices });
  assert.deepEqual(await adapter.summarize({
    modelId: 'story-model', kind: 'chapter', chapterNumber: 1, context: 'Chapter events.'
  }), { text: 'Mira reached the abbey.', keyFacts: ['The gate opened.'], unresolvedThreads: [] });

  assert.equal(seen.length, 4);
  for (const call of seen) {
    assert.equal(call.model, 'story-model');
    assert.equal(call.stream, false);
    assert.equal(typeof call.format, 'object');
    assert.deepEqual(call.messages.map((message) => message.role), ['system', 'user']);
  }
  assert.deepEqual(seen[0].format.required, ['premise', 'narrative', 'choices']);
  assert.equal(seen[0].format.additionalProperties, false);
  assert.equal(seen[0].format.properties.choices.minItems, 3);
  assert.equal(seen[0].format.properties.choices.maxItems, 3);
  assert.deepEqual(seen[0].format.properties.choices.items.required, ['id', 'text']);
  assert.deepEqual(seen[1].format.oneOf.map((branch) => branch.properties.kind.const), ['no-check', 'check']);
  assert.equal(seen[1].format.oneOf[0].properties.choices.maxItems, 3);
  assert.ok(seen[1].format.oneOf[1].properties.difficulty.enum.includes('Hard'));
  assert.ok(seen[1].format.oneOf[1].properties.attribute.enum.includes('Strength'));
  assert.equal(seen[2].format.properties.outcome.const, 'success');
  assert.equal(seen[2].format.properties.choices.minItems, 3);
  assert.deepEqual(seen[3].format.required, ['text', 'keyFacts', 'unresolvedThreads']);
  assert.equal(seen[3].format.properties.keyFacts.items.type, 'string');
  assert.match(seen[0].messages[0].content, /D100 rules/);
  assert.deepEqual(JSON.parse(seen[2].messages[1].content).check, check);
});

test('unavailable server maps to a recoverable provider error', async (t) => {
  const { server, address } = await stubServer(t, () => {});
  await new Promise((resolve) => server.close(resolve));
  const adapter = new OllamaAdapter(address, { timeoutMs: 300 });
  await assert.rejects(adapter.listModels(), expectProviderCode('unavailable-provider'));
});

test('a missing model maps to an inaccessible-model error', async (t) => {
  const { address } = await stubServer(t, async (request, response) => {
    if (request.url === '/api/chat') {
      sendJson(response, 404, { error: "model 'missing' not found" });
      return;
    }
    sendJson(response, 200, { models: [] });
  });
  const adapter = new OllamaAdapter(address);
  await assert.rejects(adapter.generateOpening({
    modelId: 'missing', theme: 'Horror', character, rules: 'D100 rules',
    paragraphTarget: 2, choiceTarget: 3
  }), expectProviderCode('inaccessible-model'));
});

test('request timeout aborts a stalled local server', async (t) => {
  const { address } = await stubServer(t, async () => {
    // Keep the request open until the client aborts it.
  });
  const adapter = new OllamaAdapter(address, { timeoutMs: 25 });
  await assert.rejects(adapter.listModels(), expectProviderCode('request-timeout'));
});

test('server failures and malformed model output have distinct error types', async (t) => {
  const { address } = await stubServer(t, async (request, response) => {
    if (request.url === '/api/tags') {
      sendJson(response, 500, { error: 'internal details must not leak' });
      return;
    }
    sendJson(response, 200, {
      model: 'story-model', message: { role: 'assistant', content: '{not json' }, done: true
    });
  });
  const adapter = new OllamaAdapter(address);
  await assert.rejects(adapter.listModels(), expectProviderCode('request-failed'));
  await assert.rejects(adapter.generateOpening({
    modelId: 'story-model', theme: 'Horror', character, rules: 'D100 rules',
    paragraphTarget: 2, choiceTarget: 3
  }), expectProviderCode('invalid-provider-response'));
});

test('a response violating the opening contract still retries and fails safely', async (t) => {
  let attempts = 0;
  const { address } = await stubServer(t, async (_request, response) => {
    attempts += 1;
    sendJson(response, 200, {
      model: 'story-model', done: true,
      message: { role: 'assistant', content: JSON.stringify({
        id: 1, text: 'A story.', choices: [{ id: 1, text: 'Go.' }]
      }) }
    });
  });
  const adapter = new OllamaAdapter(address);
  await assert.rejects(adapter.generateOpening({
    modelId: 'story-model', theme: 'Horror', character, rules: 'D100 rules',
    paragraphTarget: 2, choiceTarget: 3
  }), expectProviderCode('invalid-provider-response'));
  assert.equal(attempts, 3);
});
