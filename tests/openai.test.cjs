const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');

const secret = 'sk-test-secret-do-not-display';
const choices = [
  { id: 'inspect', text: 'Inspect the gate.' },
  { id: 'wait', text: 'Wait until dawn.' },
  { id: 'leave', text: 'Leave the abbey.' }
];
const character = {
  name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
  attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
};
const choice = { turnId: 'turn-1', choiceId: 'inspect', choiceText: 'Inspect the gate.' };
const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};
const opening = {
  modelId: 'story-model', theme: 'Horror', character, rules: 'D100 rules',
  paragraphTarget: 2, choiceTarget: 3
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
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function localFetch(address) {
  return (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.openai.com');
    return fetch(`${address}${url.pathname}`, init);
  };
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

function sendText(response, text) {
  sendJson(response, 200, {
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(text) }] }]
  });
}

function expectCode(code) {
  return (error) => error instanceof ProviderError && error.provider === 'openai' && error.code === code;
}

test('discovers models and completes all four story requests with the current key', async (t) => {
  const seen = [];
  const address = await stubServer(t, async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${secret}`);
    if (request.method === 'GET' && request.url === '/v1/models') {
      sendJson(response, 200, { object: 'list', data: [{ id: 'story-model', object: 'model' }] });
      return;
    }
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/responses');
    const body = await bodyJson(request);
    seen.push(body);
    const operation = JSON.parse(body.input[1].content).operation;
    const output = {
      opening: { premise: 'A bell wakes the abbey.', narrative: 'The road reaches the gate.', choices },
      assessment: { kind: 'check', difficulty: 'Hard', attribute: 'Strength' },
      'checked-narration': { outcome: 'success', narrative: 'The gate gives way.', choices },
      summary: { text: 'Mira reached the abbey.', keyFacts: ['The gate opened.'], unresolvedThreads: [] }
    }[operation];
    sendText(response, output);
  });
  let keyReads = 0;
  const adapter = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => {
    keyReads += 1;
    return secret;
  } }, { fetchImpl: localFetch(address), timeoutMs: 1000 });
  assert.deepEqual(await adapter.listModels(), [{ id: 'story-model', label: 'story-model' }]);
  assert.deepEqual(await adapter.generateOpening(opening), {
    premise: 'A bell wakes the abbey.', narrative: 'The road reaches the gate.', choices
  });
  assert.deepEqual(await adapter.assessAction({
    modelId: 'story-model', context: 'The gate is locked.', choice,
    attributes: character.attributes, paragraphTarget: 2, choiceTarget: 3
  }), { kind: 'check', difficulty: 'Hard', attribute: 'Strength' });
  assert.deepEqual(await adapter.narrateCheck({
    modelId: 'story-model', context: 'The gate is locked.', choice, check,
    paragraphTarget: 2, choiceTarget: 3
  }), { outcome: 'success', narrative: 'The gate gives way.', choices });
  assert.deepEqual(await adapter.summarize({
    modelId: 'story-model', kind: 'chapter', chapterNumber: 1, context: 'Chapter events.'
  }), { text: 'Mira reached the abbey.', keyFacts: ['The gate opened.'], unresolvedThreads: [] });

  assert.equal(keyReads, 5);
  assert.equal(seen.length, 4);
  for (const body of seen) {
    assert.equal(body.model, 'story-model');
    assert.deepEqual(body.text, { format: { type: 'json_object' } });
    assert.equal(body.store, false);
    assert.deepEqual(body.input.map((message) => message.role), ['system', 'user']);
    assert.ok(!JSON.stringify(body).includes(secret));
  }
  assert.match(seen[0].input[0].content, /D100 rules/);
  assert.deepEqual(JSON.parse(seen[2].input[1].content).check, check);
});

test('missing, malformed, and inaccessible keys map to authentication feedback', async (t) => {
  const address = await stubServer(t, (_request, response) => {
    sendJson(response, 401, { error: { message: `Invalid key ${secret}` } });
  });
  const fetchImpl = localFetch(address);
  const missing = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => null }, { fetchImpl });
  await assert.rejects(missing.listModels(), expectCode('authentication-failed'));
  const bad = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => `${secret}\r\nInjected: yes` }, { fetchImpl });
  await assert.rejects(bad.listModels(), expectCode('authentication-failed'));
  const rejected = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, { fetchImpl });
  await assert.rejects(rejected.listModels(), (error) =>
    expectCode('authentication-failed')(error) && !error.message.includes(secret)
  );
});

test('an inaccessible model maps to a safe model error', async (t) => {
  const address = await stubServer(t, (_request, response) => {
    sendJson(response, 404, { error: { message: `Model not found; key ${secret}` } });
  });
  const adapter = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
    fetchImpl: localFetch(address)
  });
  await assert.rejects(adapter.generateOpening({ ...opening, modelId: 'missing-model' }), (error) =>
    expectCode('inaccessible-model')(error) && !error.message.includes(secret)
  );
});

test('server failures redact response bodies and transport errors', async (t) => {
  const address = await stubServer(t, (_request, response) => {
    sendJson(response, 500, { error: { message: `Failure with key ${secret}` } });
  });
  const adapter = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
    fetchImpl: localFetch(address)
  });
  await assert.rejects(adapter.listModels(), (error) =>
    expectCode('request-failed')(error) && !error.message.includes(secret)
  );
  const network = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
    fetchImpl: async () => { throw new TypeError(`Network failure with key ${secret}`); }
  });
  await assert.rejects(network.listModels(), (error) =>
    expectCode('unavailable-provider')(error) && !error.message.includes(secret)
  );
  const locked = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => {
    throw new Error(`Key storage failure with ${secret}`);
  } });
  await assert.rejects(locked.listModels(), (error) =>
    expectCode('authentication-failed')(error) && !error.message.includes(secret)
  );
});

test('request timeout aborts a stalled response', async (t) => {
  const address = await stubServer(t, () => {});
  const adapter = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
    fetchImpl: localFetch(address), timeoutMs: 25
  });
  await assert.rejects(adapter.listModels(), expectCode('request-timeout'));
});

test('incomplete and malformed successful responses reject before gameplay', async (t) => {
  let count = 0;
  const address = await stubServer(t, (_request, response) => {
    count += 1;
    if (count === 1) {
      sendJson(response, 200, { status: 'incomplete', output: [] });
    } else {
      sendJson(response, 200, {
        status: 'completed', output: [{ type: 'message', role: 'assistant',
          content: [{ type: 'refusal', refusal: 'No.' }] }]
      });
    }
  });
  const adapter = new OpenAiAdapter({ getOpenAiKeyForRequest: async () => secret }, {
    fetchImpl: localFetch(address)
  });
  await assert.rejects(adapter.generateOpening(opening), ProviderContractError);
  await assert.rejects(adapter.generateOpening(opening), ProviderContractError);
});
