const test = require('node:test');
const assert = require('node:assert/strict');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OpenAiAdapter } = require('../dist/main/providers/openai.js');
const { StoryContextBuilder, estimateContextTokens, StoryContextBudgetError } = require('../dist/main/story-context.js');
const { StorySummarizer } = require('../dist/main/story-summarizer.js');
const { storyLanguageInstruction } = require('../dist/shared/story-language.js');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryPreferencesStore } = require('../dist/main/story-preferences.js');
const { StoryController } = require('../dist/main/story-controller.js');

const choices = [{ id: 'enter', text: 'Entrar.' }, { id: 'wait', text: 'Esperar.' }, { id: 'ask', text: 'Perguntar.' }];
const character = { name: 'Mira', gender: 'Female', avatarId: 'set_01_female_warrior', nature: 'Good', allocationMethod: 'Simplified',
  attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 } };
const choice = { turnId: 'turn', choiceId: 'enter', choiceText: 'Entrar.' };
const check = { difficulty: 'Hard', attribute: 'Strength', attributeValue: 3, baseThreshold: 20, threshold: 50, roll: 30, outcome: 'success' };
const memory = { text: 'Mira chegou.', keyFacts: ['O portão abriu.'], unresolvedThreads: ['Encontrar o sino.'] };
function adventure(language) {
  return { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, schemaVersion: 1, id: 'story', language, theme: 'Horror', character, premise: 'Um sino.',
    segments: [{ id: 'scene', chapterNumber: 1, narrative: 'Um portão.', choices, selectedChoiceId: null, check: null, createdAt: '2026-11-14' }],
    chapterSummaries: [], globalSummary: '', phase: { kind: 'ready' }, updatedAt: '2026-11-14' };
}
for (const language of ['en', 'pt-BR']) for (const kind of ['ollama', 'openai']) for (const gender of ['Male', 'Female']) {
  test(`${kind} sends ${language} and ${gender} for every prose operation without cosmetics`, async () => {
    const identity = { ...character, gender, avatarId: `set_01_${gender.toLowerCase()}_mage` };
    const seen = [];
    let checkedAssessment = false;
    const fetchImpl = async (_url, options) => {
      const body = JSON.parse(options.body), messages = body.input ?? body.messages;
      const prompt = JSON.parse(messages[1].content);
      const sentCharacter = prompt.operation === 'opening' ? prompt.character : prompt.context.character;
      assert.equal(sentCharacter.gender, gender);
      assert.deepEqual(sentCharacter.attributes, character.attributes);
      assert.equal(Object.hasOwn(sentCharacter, 'avatarId'), false);
      assert.doesNotMatch(JSON.stringify(messages), /avatarId|set_01_|\.png/);
      if (prompt.operation !== 'summary') assert.match(messages[0].content, /gender as secondary narrative context/);
      seen.push(prompt.operation === 'summary' ? prompt.kind : prompt.operation);
      assert.equal(prompt.language, language);
      assert.match(messages[0].content, language === 'en' ? /in English/ : /in Brazilian Portuguese/);
      assert.match(messages[0].content, /Keep JSON field names/);
      if (['assessment', 'checked-narration'].includes(prompt.operation)) assert.match(messages[0].content, /Return a new set of choices/);
      const output = {
        opening: { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, premise: 'Um sino.', narrative: 'Um portão.', choices },
        assessment: checkedAssessment ? { kind: 'check', difficulty: 'Hard', attribute: 'Strength' }
          : { storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, kind: 'no-check', narrative: 'Mira entra.', choices },
        'checked-narration': { storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, outcome: 'success', narrative: 'O portão abriu.', choices }, summary: memory
      }[prompt.operation];
      if (prompt.operation === 'checked-narration') assert.deepEqual(prompt.check, check);
      return Response.json(kind === 'ollama' ? { done: true, message: { role: 'assistant', content: JSON.stringify(output) } }
        : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
    };
    const provider = kind === 'ollama' ? new OllamaAdapter('http://127.0.0.1:11434', { fetchImpl })
      : new OpenAiAdapter({ getOpenAiKeyForRequest: async () => 'fixture-key' }, { fetchImpl });
    const base = { modelId: 'fixture', language, context: JSON.stringify({ character: identity }), paragraphTarget: 3, choiceTarget: 3 };
    const opening = await provider.generateOpening({ ...base, theme: 'Horror', character: identity, rules: 'D100' });
    assert.deepEqual(opening.choices, choices);
    assert.equal((await provider.assessAction({ ...base, choice, attributes: character.attributes })).kind, 'no-check');
    checkedAssessment = true;
    assert.deepEqual(await provider.assessAction({ ...base, choice, attributes: character.attributes }), { kind: 'check', difficulty: 'Hard', attribute: 'Strength' });
    assert.equal((await provider.narrateCheck({ ...base, choice, check })).outcome, 'success');
    for (const summaryKind of ['chapter', 'global']) assert.deepEqual(await provider.summarize({ ...base, kind: summaryKind, chapterNumber: 1 }), memory);
    assert.deepEqual(seen, ['opening', 'assessment', 'assessment', 'checked-narration', 'chapter', 'global']);
  });
}
for (const language of ['en', 'pt-BR']) test(`${language} survives context and summary construction with language counted in budgets`, async () => {
  const saved = adventure(language), builder = new StoryContextBuilder();
  const text = builder.build(saved), context = JSON.parse(text);
  assert.equal(context.language, language);
  assert.equal(context.languageInstruction, storyLanguageInstruction(language));
  const budget = estimateContextTokens(text);
  assert.equal(new StoryContextBuilder({ contextBudgetTokens: budget }).build(saved), text);
  assert.throws(() => new StoryContextBuilder({ contextBudgetTokens: budget - 1 }).build(saved), StoryContextBudgetError);
  const opening = builder.openingRequest('fixture', saved);
  assert.equal(opening.language, language);
  const bareOpeningTokens = estimateContextTokens(JSON.stringify(opening));
  assert.throws(() => new StoryContextBuilder({ contextBudgetTokens: bareOpeningTokens }).openingRequest('fixture', saved), StoryContextBudgetError);
  const pending = structuredClone(saved);
  pending.phase = { kind: 'pending-assessment', choice };
  assert.equal(builder.assessmentRequest('fixture', pending).language, language);
  pending.phase = { kind: 'pending-narration', choice, check };
  assert.equal(builder.narrationRequest('fixture', pending).language, language);
  const requests = [];
  await new StorySummarizer({ chapterLength: 1 }).update(saved, { summarize: async (request) => { requests.push(request); return memory; } }, 'fixture');
  assert.deepEqual(requests.map((request) => request.kind), ['chapter', 'global']);
  for (const request of requests) {
    assert.equal(request.language, language);
    assert.equal(JSON.parse(request.context).languageInstruction, storyLanguageInstruction(language));
  }
  const chapterTokens = estimateContextTokens(requests[0].context);
  await assert.rejects(new StorySummarizer({ chapterLength: 1, contextBudgetTokens: chapterTokens - 1 })
    .update(saved, { summarize: async () => { throw new Error('must fail before provider'); } }, 'fixture'), StoryContextBudgetError);
});

function memoryFiles() {
  const documents = new Map();
  return { mkdir: async () => undefined,
    readFile: async (file) => { if (!documents.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return documents.get(file); },
    writeFile: async (file, text) => { documents.set(file, text); },
    rename: async (from, to) => { documents.set(to, documents.get(from)); documents.delete(from); },
    unlink: async (file) => { documents.delete(file); } };
}
for (const language of ['en', 'pt-BR']) for (const failure of ['opening', 'assessment', 'narration', 'chapter', 'global']) for (const gender of ['Male', 'Female']) {
  test(`${language} ${gender} ${failure} recovery keeps identity and decisions after defaults and provider change`, async () => {
    const identity = { ...character, gender, avatarId: `set_01_${gender.toLowerCase()}_cleric` };
    const files = memoryFiles(), base = path.resolve('out/language-recovery');
    const store = new AdventureStore(base, files), preferences = new StoryPreferencesStore(base, files);
    await preferences.save({ defaultStoryLanguage: language });
    let failing = true;
    const requests = [];
    function provider(kind) {
      function receive(operation, request, output) {
        requests.push({ kind, operation, request: structuredClone(request) });
        assert.equal(request.language, language);
        const sentCharacter = operation === 'opening' ? request.character : JSON.parse(request.context).character;
        assert.equal(sentCharacter.gender, gender);
        assert.equal(Object.hasOwn(sentCharacter, 'avatarId'), false);
        assert.doesNotMatch(JSON.stringify(request), /avatarId|set_01_|\.png/);
        if (failing && operation === failure) throw new Error('Simulated interruption');
        return output;
      }
      return { kind,
        generateOpening: async (request) => receive('opening', request, { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, premise: 'Um sino.', narrative: 'Um portão.', choices }),
        assessAction: async (request) => receive('assessment', request, failure === 'assessment'
          ? { storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, kind: 'no-check', narrative: 'Mira entrou.', choices }
          : { kind: 'check', difficulty: 'Hard', attribute: 'Strength' }),
        narrateCheck: async (request) => receive('narration', request, { storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, outcome: request.check.outcome, narrative: 'Mira tentou abrir.', choices }),
        summarize: async (request) => receive(request.kind, request, memory) };
    }
    const old = provider('ollama');
    let selection = { provider: old, modelId: 'old-model' };
    const source = async () => selection;
    const controller = new StoryController(store, source, { chapterLength: 2 });
    if (failure === 'opening') {
      await assert.rejects(controller.startOpening({ language, theme: 'Horror', character: identity }), /Simulated/);
    } else {
      await store.save({ ...adventure(language), character: identity });
      await assert.rejects(controller.submitChoice('scene', 'enter'), /Simulated/);
    }
    const pending = await store.load(), priorSegments = structuredClone(pending.segments);
    const pendingRoll = pending.phase.kind === 'pending-narration' ? pending.phase.check
      : pending.segments.at(-1)?.check;
    const oldRequestCount = requests.length;
    await preferences.save({ defaultStoryLanguage: language === 'en' ? 'pt-BR' : 'en' });
    assert.deepEqual(await store.load(), pending);
    selection = { provider: provider('openai'), modelId: 'new-model' };
    failing = false;
    const restarted = new StoryController(new AdventureStore(base, files), source, { chapterLength: 2 });
    assert.deepEqual(await restarted.restore(), pending);
    assert.equal(requests.length, oldRequestCount, 'Restoration must not call a provider');
    const completed = failure === 'opening' ? await restarted.retryOpening()
      : (await restarted.retryTurn('choice' in pending.phase ? pending.phase.choice.turnId : pending.phase.turnId)).adventure;
    assert.equal(completed.language, language);
    assert.deepEqual(completed.character, identity);
    assert.equal(completed.phase.kind, 'ready');
    assert.equal(completed.segments.length, failure === 'opening' ? 1 : 2);
    assert.equal(new Set(completed.segments.map((segment) => segment.id)).size, completed.segments.length);
    assert.equal(completed.segments.filter((segment) => segment.selectedChoiceId !== null).length, failure === 'opening' ? 0 : 1);
    if (pendingRoll) assert.deepEqual(completed.segments.at(-1).check, pendingRoll);
    if (['chapter', 'global'].includes(failure)) assert.deepEqual(completed.segments, priorSegments);
    if (failure === 'narration') assert.equal(requests.filter((entry) => entry.operation === 'assessment').length, 1);
    for (const entry of requests.slice(oldRequestCount)) {
      assert.equal(entry.kind, 'openai');
      assert.equal(entry.request.modelId, 'new-model');
      assert.equal(entry.request.language, language);
    }
    assert.equal((await new StoryPreferencesStore(base, files).get()).defaultStoryLanguage, language === 'en' ? 'pt-BR' : 'en');
  });
}
