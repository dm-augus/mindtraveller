const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { parseOpeningResponse, parseActionAssessmentResponse, parseCheckedNarrationResponse } = require('../dist/shared/provider-contract.js');
const { openingMessages, assessmentMessages, checkedNarrationMessages } = require('../dist/main/providers/story-prompts.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { assertFreshNarrative, DuplicateNarrativeError } = require('../dist/main/providers/story-continuation.js');
const { StoryContextBuilder } = require('../dist/main/story-context.js');

function memoryFiles() {
  const documents = new Map();
  return { documents, mkdir: async () => undefined,
    readFile: async (file) => {
      if (!documents.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return documents.get(file);
    },
    writeFile: async (file, text) => { documents.set(file, text); },
    rename: async (from, to) => { documents.set(to, documents.get(from)); documents.delete(from); },
    unlink: async (file) => { documents.delete(file); } };
}
const choices = [{ id: 'enter', text: 'Entrar na casa de Thoric.' },
  { id: 'ask', text: 'Perguntar aos vizinhos.' }, { id: 'leave', text: 'Deixar a vila.' }];
const setup = { language: 'pt-BR', theme: 'High Fantasy', character: {
  name: 'Richter', gender: 'male', nature: 'Neutral', allocationMethod: 'Simplified',
  attributes: { Strength: 0, Dexterity: 3, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
} };
const initialState = { location: 'Casa de Thoric', situation: 'Richter está do lado de fora da janela.',
  currentFocus: 'Perguntar a Thoric sobre a doença.' };
const opening = { premise: 'Uma doença ameaça Caldeirão.', mainObjective: 'Encontrar a origem da doença e uma cura.',
  storyState: initialState, narrative: initialState.situation, choices };
const insideState = { location: 'Dentro da casa de Thoric', situation: 'Richter encontra Thoric doente.',
  currentFocus: 'Examinar a água que Thoric bebeu.' };
const fresh = { kind: 'no-check', storyState: insideState, narrative: 'Richter entra pela janela e encontra Thoric doente.', choices };
const check = { difficulty: 'Medium', attribute: 'Dexterity', attributeValue: 3,
  baseThreshold: 50, threshold: 80, roll: 40, outcome: 'success' };

test('objective and scene state survive atomic continuation, summaries, restart, and provider switch', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/coherence-state'), files), seen = [];
  const provider = { kind: 'ollama', generateOpening: async () => opening,
    assessAction: async request => { seen.push(request); return fresh; },
    summarize: async request => { seen.push(request); return { text: 'Thoric foi encontrado.', keyFacts: [], unresolvedThreads: [] }; } };
  const controller = new StoryController(store, async () => ({ provider, modelId: 'test' }), { chapterLength: 2 });
  const started = await controller.startOpening(setup);
  assert.equal(started.mainObjective, opening.mainObjective);
  assert.deepEqual(started.storyState, initialState);
  const result = await controller.submitChoice(started.segments[0].id, 'enter');
  assert.deepEqual(seen.map(r => r.kind || 'assessment'), ['assessment', 'chapter', 'global']);
  assert.deepEqual(JSON.parse(seen[0].context).storyState, initialState);
  for (const request of seen) assert.equal(JSON.parse(request.context).mainObjective, opening.mainObjective);
  for (const request of seen.slice(1)) assert.deepEqual(JSON.parse(request.context).storyState, insideState);
  assert.deepEqual(result.adventure.storyState, insideState);
  let calls = 0;
  const changed = new StoryController(store, async () => ({ modelId: 'other', provider: { kind: 'openai',
    assessAction: async request => { calls++; assert.deepEqual(JSON.parse(request.context).storyState, insideState);
      return { ...fresh, narrative: 'Richter decide deixar a vila.', storyState: {
        location: 'Estrada', situation: 'Richter abandona a investigação e deixa a vila.', currentFocus: 'Viajar para outra cidade.' } }; } } }));
  assert.deepEqual(await changed.restore(), result.adventure);
  assert.equal(calls, 0);
  const detour = await changed.submitChoice(result.adventure.segments.at(-1).id, 'leave');
  assert.equal(calls, 1);
  assert.equal(detour.adventure.mainObjective, opening.mainObjective);
  assert.equal(detour.adventure.storyState.location, 'Estrada');
});

test('failed checked continuation save retains prior memory and the authoritative roll', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/coherence-save'), files);
  const start = await new StoryController(store, async () => ({ modelId: 'test', provider: {
    kind: 'ollama', generateOpening: async () => opening } })).startOpening(setup);
  const pending = { ...start, segments: [{ ...start.segments[0], selectedChoiceId: 'enter' }],
    phase: { kind: 'pending-narration', choice: { turnId: 'turn', choiceId: 'enter', choiceText: choices[0].text }, check } };
  await store.save(pending);
  const rename = files.rename;
  files.rename = async (from, to) => { if (to === store.activePath) throw new Error('disk full'); await rename(from, to); };
  const retry = new StoryController(store, async () => ({ modelId: 'test', provider: { kind: 'ollama',
    narrateCheck: async () => ({ outcome: 'success', narrative: fresh.narrative, choices, storyState: insideState }) } }));
  await assert.rejects(retry.retryTurn('turn'), /disk full/);
  assert.deepEqual(await store.load(), pending);
  files.rename = rename;
  const completed = await retry.retryTurn('turn');
  assert.deepEqual(completed.adventure.storyState, insideState);
  assert.deepEqual(completed.adventure.segments.at(-1).check, check);
});

test('state response contracts reject absent, malformed, or extra fields', () => {
  assert.deepEqual(parseOpeningResponse(opening, 3), opening);
  const narrated = { outcome: 'success', narrative: fresh.narrative, choices, storyState: insideState };
  for (const storyState of [undefined, null, {}, { ...insideState, location: 5 },
    { ...insideState, situation: '' }, { ...insideState, extra: true }]) {
    assert.throws(() => parseOpeningResponse({ ...opening, storyState }, 3));
    assert.throws(() => parseActionAssessmentResponse({ ...fresh, storyState }, 3, setup.character.attributes));
    assert.throws(() => parseCheckedNarrationResponse({ ...narrated, storyState }, 3, 'success'));
  }
  assert.throws(() => parseOpeningResponse({ ...opening, mainObjective: '' }, 3));
  assert.throws(() => parseActionAssessmentResponse({ ...fresh, mainObjective: 'Replace the goal.' }, 3, setup.character.attributes));
});

test('prompts carry structured memory, action resolution, relevant attributes, and state language', () => {
  const context = JSON.stringify({ mainObjective: opening.mainObjective, storyState: initialState, recentEvents: [] });
  const common = { ...setup, modelId: 'test', choice: { choiceId: 'enter', choiceText: choices[0].text, turnId: 'turn' },
    context, attributes: setup.character.attributes, check, rules: 'Rules', paragraphTarget: 3, choiceTarget: 3 };
  assert.match(openingMessages(common)[0].content, /mainObjective/);
  for (const messages of [assessmentMessages(common), checkedNarrationMessages(common)]) {
    assert.deepEqual(JSON.parse(messages[1].content).context, JSON.parse(context));
    assert.match(messages[0].content, /Brazilian Portuguese/);
    assert.match(messages[0].content, /success accomplishes that action/);
    assert.match(messages[0].content, /player chooses a detour/);
  }
  assert.match(assessmentMessages(common)[0].content, /Dexterity for climbing/);
  assert.match(assessmentMessages(common)[0].content, /Ordinary travel/);
});

function adapterFixture(kind, generate) {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    const content = generate(body, requests.length);
    const envelope = kind === 'ollama'
      ? { done: true, message: { role: 'assistant', content: JSON.stringify(content) } }
      : { status: 'completed', output: [{ type: 'message', role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(content) }] }] };
    return new Response(JSON.stringify(envelope));
  };
  return { requests, adapter: kind === 'ollama' ? new OllamaAdapter('http://localhost:11434', { fetchImpl })
    : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => 'test-key' }, { fetchImpl }) };
}
const repeat = 'Richter se ajoelha e começa a escalar a janela. Ele se move silenciosamente e rapidamente.';
const aaronScene = 'O velho agricultor olha para você com esperança nos olhos. Ele fala: "Se você aceitar o desafio, podemos reunir todos os moradores para discutir sobre o que fazer. Você pode ser o líder que nos guie contra o Rei das Trevas." Ele entrega um papel com uma mensagem escrita: "Encontre o senhor da floresta, ele pode ter informações valiosas sobre o Rei das Trevas."';
function continuationRequest() {
  return { language: 'pt-BR', modelId: 'test', paragraphTarget: 3, choiceTarget: 3,
    choice: { choiceId: 'enter', choiceText: choices[0].text, turnId: 'turn' },
    attributes: setup.character.attributes, check,
    context: JSON.stringify({ mainObjective: opening.mainObjective, storyState: initialState,
      recentEvents: [{ narrative: repeat }] }) };
}

test('duplicate comparison normalizes Unicode, case, and whitespace over exactly six recent narratives', () => {
  assert.throws(() => assertFreshNarrative('  RICHTER\nse ajoelha. ', ['Richter se ajoelha.']), DuplicateNarrativeError);
  assert.throws(() => assertFreshNarrative('Richter vê a doença.', ['Ｒｉｃｈｔｅｒ vê a doença.']), DuplicateNarrativeError);
  assert.doesNotThrow(() => assertFreshNarrative('An old scene.', ['An old scene.', '1', '2', '3', '4', '5', '6']));
});

test('copied substantial scenes cannot bypass validation with small additions or punctuation changes', () => {
  for (const narrative of [aaronScene + ' Ele espera.', 'Aaron escuta. ' + aaronScene,
    aaronScene.replaceAll('.', '!') + ' Aaron pensa.', aaronScene + ', choices: [{']) {
    assert.throws(() => assertFreshNarrative(narrative, [aaronScene]), DuplicateNarrativeError);
  }
  assert.doesNotThrow(() => assertFreshNarrative('Ele repete: "Encontre o senhor da floresta." Aaron parte.', [aaronScene]));
  assert.doesNotThrow(() => assertFreshNarrative(aaronScene + ' Aaron encontra o senhor da floresta e descobre a localização do exército. Os moradores organizam a defesa e enviam um mensageiro para alertar o rei. Um mapa revela uma passagem secreta para o castelo.', [aaronScene]));
});

test('opening and both continuation contracts reject leaked fields while accepting ordinary prose', () => {
  for (const fragment of [', choices: [{', ', "choices": [ { "id": "go"', '\nchoices: [',
    ', storyState: {', ', "outcome": "success"']) {
    const narrative = 'Aaron descobre uma pista.' + fragment;
    for (const parse of [
      () => parseOpeningResponse({ ...opening, narrative }, 3),
      () => parseActionAssessmentResponse({ ...fresh, narrative }, 3, setup.character.attributes),
      () => parseCheckedNarrationResponse({ outcome: 'success', narrative, choices, storyState: insideState }, 3, 'success')
    ]) assert.throws(parse, error => error.name === 'MalformedNarrativeError');
  }
  const narrative = 'Aaron considers his choices: ask the farmer, or search the forest. "Choices matter," he says.';
  assert.equal(parseOpeningResponse({ ...opening, narrative }, 3).narrative, narrative);
});

for (const kind of ['ollama', 'openai']) {
  for (const method of ['assessAction', 'narrateCheck']) {
    test(`${kind} ${method} regenerates Aaron's leaked and padded scenes before accepting new prose`, async () => {
      const fixture = adapterFixture(kind, (_body, attempt) => ({
        ...(method === 'assessAction' ? { kind: 'no-check' } : { outcome: 'success' }),
        narrative: attempt === 1 ? aaronScene + ', choices: [{' : attempt === 2 ? aaronScene + ' Ele espera.' : fresh.narrative,
        choices, storyState: insideState
      }));
      const request = { ...continuationRequest(), recentNarratives: [aaronScene] };
      const response = await fixture.adapter[method](request);
      assert.equal(response.narrative, fresh.narrative);
      assert.equal(fixture.requests.length, 3);
      const messages = fixture.requests.map(body => body.messages ?? body.input);
      assert.match(messages[1][0].content, /response-field syntax/);
      assert.match(messages[2][0].content, /repeated a recent scene/);
      for (const message of messages) {
        const prompt = JSON.parse(message[1].content);
        assert.deepEqual(prompt.choice, request.choice);
        if (method === 'narrateCheck') assert.deepEqual(prompt.check, check);
      }
    });
    test(`${kind} ${method} rejects Richter's repeated window scene and retries with correction`, async () => {
      const fixture = adapterFixture(kind, (_body, attempt) => ({
        ...(method === 'assessAction' ? { kind: 'no-check' } : { outcome: 'success' }),
        narrative: attempt < 3 ? `  ${repeat.toUpperCase().replaceAll(' ', '\n')} ` : fresh.narrative,
        choices, storyState: insideState
      }));
      const request = continuationRequest(), before = structuredClone(request);
      const result = await fixture.adapter[method](request);
      assert.equal(fixture.requests.length, 3);
      assert.equal(result.narrative, fresh.narrative);
      assert.deepEqual(request, before);
      for (const [index, body] of fixture.requests.entries()) {
        const messages = body.messages ?? body.input;
        assert.equal(/previous continuation repeated/.test(messages[0].content), index > 0);
        const prompt = JSON.parse(messages[1].content);
        assert.deepEqual(prompt.choice, request.choice);
        if (method === 'narrateCheck') assert.deepEqual(prompt.check, check);
      }
    });
  }

  test(`${kind} normal continuation needs one call and permits another failed attempt with fresh consequences`, async () => {
    const fixture = adapterFixture(kind, () => ({ outcome: 'failure', narrative: 'Richter cai e chama a atenção de Thoric.',
      choices, storyState: { ...initialState, situation: 'Thoric ouviu Richter cair.' } }));
    await fixture.adapter.narrateCheck({ ...continuationRequest(), check: { ...check, roll: 99, outcome: 'failure' } });
    assert.equal(fixture.requests.length, 1);
  });

  test(`${kind} keeps six-scene duplicate validation when fewer scenes are sent to the model`, async () => {
    const files = memoryFiles(), store = new AdventureStore(path.resolve(`out/coherence-window-${kind}`), files);
    const saved = await new StoryController(store, async () => ({ modelId: 'test', provider: {
      kind: 'ollama', generateOpening: async () => opening } })).startOpening(setup);
    saved.segments = Array.from({ length: 8 }, (_, index) => ({ ...saved.segments[0], id: `scene-${index}`,
      narrative: `Richter investigates clue ${index}.`, selectedChoiceId: index === 7 ? 'enter' : null }));
    saved.phase = { kind: 'pending-assessment', choice: continuationRequest().choice };
    const request = new StoryContextBuilder({ recentEventCount: 1 }).assessmentRequest('test', saved);
    assert.equal(JSON.parse(request.context).recentEvents.length, 1);
    assert.equal(request.recentNarratives.length, 6);
    const fixture = adapterFixture(kind, (_body, attempt) => ({ ...fresh,
      narrative: attempt === 1 ? saved.segments[3].narrative : fresh.narrative }));
    await fixture.adapter.assessAction(request);
    assert.equal(fixture.requests.length, 2);
    const prompt = JSON.parse((fixture.requests[0].messages ?? fixture.requests[0].input)[1].content);
    assert.equal('recentNarratives' in prompt, false);
  });

  for (const suffix of ['', ', choices: [{']) {
  test(`${kind} ${suffix ? 'leaked narrative' : 'duplicate'} exhaustion and manual retry preserve checked state and roll`, async () => {
    const files = memoryFiles(), store = new AdventureStore(path.resolve(`out/coherence-repeat-${kind}`), files);
    const started = await new StoryController(store, async () => ({ modelId: 'test', provider: {
      kind: 'ollama', generateOpening: async () => ({ ...opening, narrative: repeat }) } })).startOpening(setup);
    const pending = { ...started, segments: [{ ...started.segments[0], selectedChoiceId: 'enter' }],
      phase: { kind: 'pending-narration', choice: continuationRequest().choice, check } };
    await store.save(pending);
    const bytes = files.documents.get(store.activePath);
    let valid = false;
    const fixture = adapterFixture(kind, () => ({ outcome: 'success', narrative: valid ? fresh.narrative : repeat + suffix,
      choices, storyState: insideState }));
    const controller = new StoryController(store, async () => ({ provider: fixture.adapter, modelId: 'test' }));
    await assert.rejects(controller.retryTurn('turn'), error => error.code === 'invalid-provider-response');
    assert.equal(fixture.requests.length, 3);
    assert.equal(files.documents.get(store.activePath), bytes);
    assert.deepEqual(await controller.restore(), pending);
    valid = true;
    const completed = await new StoryController(store, async () => ({ provider: fixture.adapter, modelId: 'test' })).retryTurn('turn');
    assert.equal(fixture.requests.length, 4);
    assert.deepEqual(completed.adventure.segments.at(-1).check, check);
    assert.equal(completed.adventure.segments.length, 2);
    assert.deepEqual(completed.adventure.storyState, insideState);
    for (const body of fixture.requests) assert.deepEqual(JSON.parse((body.messages ?? body.input)[1].content).check, check);
  });
  }
}

test('controller rejects a duplicate returned by a custom provider before saving state', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/coherence-custom'), files);
  const provider = { kind: 'ollama', generateOpening: async () => opening,
    assessAction: async () => ({ ...fresh, narrative: opening.narrative }) };
  const controller = new StoryController(store, async () => ({ provider, modelId: 'test' }));
  const started = await controller.startOpening(setup);
  await assert.rejects(controller.submitChoice(started.segments[0].id, 'enter'), DuplicateNarrativeError);
  const saved = await store.load();
  assert.equal(saved.phase.kind, 'pending-assessment');
  assert.equal(saved.segments.length, 1);
  assert.deepEqual(saved.storyState, initialState);
});

test('oversized required context retains the pending checked turn without contacting Ollama', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/coherence-budget'), files);
  const started = await new StoryController(store, async () => ({ modelId: 'test', provider: {
    kind: 'ollama', generateOpening: async () => opening } })).startOpening(setup);
  const pending = { ...started, mainObjective: 'A'.repeat(20000),
    segments: [{ ...started.segments[0], selectedChoiceId: 'enter' }],
    phase: { kind: 'pending-narration', choice: continuationRequest().choice, check } };
  await store.save(pending);
  const bytes = files.documents.get(store.activePath), fixture = adapterFixture('ollama', () => { throw new Error('unexpected request'); });
  const controller = new StoryController(store, async () => ({ modelId: 'test', provider: fixture.adapter }));
  await assert.rejects(controller.retryTurn('turn'), error => error.code === 'context-budget-exceeded');
  assert.equal(fixture.requests.length, 0);
  assert.equal(files.documents.get(store.activePath), bytes);
  assert.deepEqual(await controller.restore(), pending);
});
