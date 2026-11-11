const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StorySummarizer } = require('../dist/main/story-summarizer.js');
const { StoryContextBudgetError } = require('../dist/main/story-context.js');
const { ProviderContractError } = require('../dist/shared/provider-contract.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');
const { summaryMessages } = require('../dist/main/providers/story-prompts.js');

const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};
const chapterResult = {
  text: 'Mira entered the ruined abbey.',
  keyFacts: ['The abbess is an ally.', 'Mira forced the gate with a successful Strength check.'],
  unresolvedThreads: ['Find Mira’s sister.', 'Discover who rings the buried bell.']
};
const globalResult = {
  text: 'Mira searches the abbey for her sister.',
  keyFacts: ['The abbess remains an ally.', 'The sealed gate was forced open.'],
  unresolvedThreads: ['Locate the buried bell.']
};

function segment(number, chapterNumber = 1) {
  return {
    id: `segment-${number}`, chapterNumber,
    narrative: number === 1 ? 'The abbess offers help at a sealed gate.' : `Mira enters chamber ${number}.`,
    choices: [{ id: `choice-${number}`, text: number === 1 ? 'Force the gate.' : `Explore chamber ${number}.` }],
    selectedChoiceId: null, check: number === 2 ? { ...check } : null,
    createdAt: '2026-11-11T12:00:00.000Z'
  };
}

function adventure(count = 2) {
  const segments = Array.from({ length: count }, (_, index) => segment(index + 1));
  for (const event of segments.slice(0, -1)) event.selectedChoiceId = event.choices[0].id;
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell rings beneath the abbey.', segments, chapterSummaries: [],
    globalSummary: 'Mira seeks her missing sister. The abbess is an ally.',
    phase: { kind: 'ready' }, updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function provider(handler) {
  const requests = [];
  return {
    requests,
    summarize: async (request) => {
      requests.push(structuredClone(request));
      return handler ? handler(request, requests.length)
        : structuredClone(request.kind === 'chapter' ? chapterResult : globalResult);
    }
  };
}

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-summaries-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-summaries-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('chapter length controls the exact summary boundary and assignment of the next segment', async () => {
  const summarizer = new StorySummarizer({ chapterLength: 2 });
  const stub = provider();
  const before = freeze(adventure(1));
  assert.deepEqual(summarizer.chaptersDue(before), []);
  assert.equal(summarizer.nextChapterNumber(adventure(0)), 1);
  assert.equal(summarizer.nextChapterNumber(before), 1);
  assert.deepEqual(await summarizer.update(before, stub, 'story-model'), before);
  assert.equal(stub.requests.length, 0);

  const boundary = freeze(adventure(2));
  assert.deepEqual(summarizer.chaptersDue(boundary), [1]);
  assert.equal(summarizer.nextChapterNumber(boundary), 2);
  const staged = await summarizer.update(boundary, stub, 'story-model');
  assert.deepEqual(stub.requests.map((request) => request.kind), ['chapter', 'global']);
  assert.equal(staged.chapterSummaries[0].throughSegmentId, 'segment-2');
  assert.deepEqual(summarizer.chaptersDue(staged), []);
  await summarizer.update(staged, stub, 'story-model');
  assert.equal(stub.requests.length, 2);
  assert.equal(boundary.chapterSummaries.length, 0);
});

test('summary requests carry full source decisions and checks, prior memory, rules, and character', async () => {
  const saved = freeze(adventure(3));
  const stub = provider();
  const staged = await new StorySummarizer({ chapterLength: 3, recentEventCount: 1 })
    .update(saved, stub, 'configured-model');
  assert.ok(stub.requests.every((request) => request.modelId === 'configured-model'));
  const chapter = JSON.parse(stub.requests[0].context);
  assert.equal(chapter.rules, GAME_RULES_TEXT);
  assert.equal(chapter.theme, saved.theme);
  assert.deepEqual(chapter.character, saved.character);
  assert.equal(chapter.premise, saved.premise);
  assert.equal(chapter.globalSummary, saved.globalSummary);
  assert.equal(chapter.previousChapterSummary, '');
  assert.deepEqual(chapter.sourceEvents.map((event) => event.segmentId), ['segment-1', 'segment-2', 'segment-3']);
  assert.deepEqual(chapter.sourceEvents[0].decision, { id: 'choice-1', text: 'Force the gate.' });
  assert.deepEqual(chapter.sourceEvents[1].check, check);

  const global = JSON.parse(stub.requests[1].context);
  assert.equal(global.globalSummary, saved.globalSummary);
  assert.deepEqual(global.chapterSummaries, staged.chapterSummaries);
  assert.equal(global.recentEvents.length, 1);
  // Explicit fact and thread arrays survive even when they are absent from the prose field.
  for (const fact of [...chapterResult.keyFacts, ...chapterResult.unresolvedThreads]) {
    assert.ok(staged.chapterSummaries[0].text.includes(fact));
    assert.ok(global.chapterSummaries[0].text.includes(fact));
  }
  for (const fact of [...globalResult.keyFacts, ...globalResult.unresolvedThreads]) {
    assert.ok(staged.globalSummary.includes(fact));
  }
  assert.deepEqual(staged.segments, saved.segments);
  assert.deepEqual(staged.phase, saved.phase);
});

test('a new chapter retains the preceding selected action associated with its first check', async () => {
  const saved = adventure(2);
  saved.segments[1].chapterNumber = 2;
  saved.chapterSummaries = [{ chapterNumber: 1, throughSegmentId: 'segment-1', text: 'The sealed gate blocks Mira.' }];
  const stub = provider();
  const staged = await new StorySummarizer({ chapterLength: 1 }).update(freeze(saved), stub, 'story-model');
  assert.equal(stub.requests[0].chapterNumber, 2);
  const context = JSON.parse(stub.requests[0].context);
  assert.deepEqual(context.precedingDecision, { id: 'choice-1', text: 'Force the gate.' });
  assert.deepEqual(context.sourceEvents[0].check, check);
  assert.equal(staged.chapterSummaries[0].text, 'The sealed gate blocks Mira.');
  assert.equal(staged.chapterSummaries[1].chapterNumber, 2);
});

test('multiple completed chapters stage together before a single global update', async () => {
  const saved = adventure(4);
  saved.segments[2].chapterNumber = 2;
  saved.segments[3].chapterNumber = 2;
  const stub = provider();
  const summarizer = new StorySummarizer({ chapterLength: 2 });
  assert.deepEqual(summarizer.chaptersDue(saved), [1, 2]);
  const staged = await summarizer.update(freeze(saved), stub, 'story-model');
  assert.deepEqual(stub.requests.map((request) => [request.kind, request.chapterNumber]),
    [['chapter', 1], ['chapter', 2], ['global', undefined]]);
  assert.deepEqual(staged.chapterSummaries.map((summary) => summary.throughSegmentId), ['segment-2', 'segment-4']);
  assert.equal(JSON.parse(stub.requests[2].context).chapterSummaries.length, 2);
  assert.deepEqual(staged.segments, saved.segments);
});

for (const threshold of ['chapterSummaryThresholdTokens', 'globalSummaryThresholdTokens']) {
  test(`${threshold} triggers a partial update without closing the chapter or repeating covered events`, async () => {
    const summarizer = new StorySummarizer({ chapterLength: 10, [threshold]: 1 });
    const stub = provider();
    const first = await summarizer.update(freeze(adventure(1)), stub, 'story-model');
    assert.equal(first.chapterSummaries[0].throughSegmentId, 'segment-1');
    assert.equal(summarizer.nextChapterNumber(first), 1);
    assert.deepEqual(summarizer.chaptersDue(first), []);
    await summarizer.update(first, stub, 'story-model');
    assert.equal(stub.requests.length, 2);

    const continued = structuredClone(first);
    continued.segments[0].selectedChoiceId = 'choice-1';
    continued.segments.push(segment(2));
    const updated = await summarizer.update(freeze(continued), stub, 'story-model');
    const context = JSON.parse(stub.requests[2].context);
    assert.equal(context.previousChapterSummary, first.chapterSummaries[0].text);
    assert.equal(context.globalSummary, first.globalSummary);
    assert.deepEqual(context.sourceEvents.map((event) => event.segmentId), ['segment-2']);
    assert.deepEqual(context.precedingDecision, { id: 'choice-1', text: 'Force the gate.' });
    assert.equal(updated.chapterSummaries.length, 1);
    assert.equal(updated.chapterSummaries[0].throughSegmentId, 'segment-2');
    assert.deepEqual(updated.segments, continued.segments);
  });
}

test('an earlier chapter is summarized when a later chapter exists even after configuration changes', () => {
  const saved = adventure(2);
  saved.segments[1].chapterNumber = 2;
  assert.deepEqual(new StorySummarizer({ chapterLength: 10 }).chaptersDue(saved), [1]);
});

test('chapter and global results remain staged until one atomic adventure save commits them', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const saved = adventure();
  await store.save(saved);
  const bytes = await fs.readFile(store.activePath, 'utf8');
  const stub = provider(async (request) => {
    assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
    assert.deepEqual(await new AdventureStore(userData).load(), saved);
    assert.equal(saved.chapterSummaries.length, 0);
    return structuredClone(request.kind === 'chapter' ? chapterResult : globalResult);
  });
  const staged = await new StorySummarizer({ chapterLength: 2 }).update(freeze(saved), stub, 'story-model');
  assert.equal(await fs.readFile(store.activePath, 'utf8'), bytes);
  await store.save(staged);
  assert.deepEqual(await new AdventureStore(userData).load(), staged);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), saved);
  assert.deepEqual(staged.segments, saved.segments);
});

for (const failedCall of [1, 2, 3]) {
  test(`summary failure on call ${failedCall} preserves source events and all prior summaries for retry`, async (t) => {
    const userData = await temporaryUserData(t);
    const store = new AdventureStore(userData);
    const saved = adventure(4);
    saved.segments[2].chapterNumber = 2;
    saved.segments[3].chapterNumber = 2;
    saved.chapterSummaries = [{ chapterNumber: 1, throughSegmentId: 'segment-1', text: 'Prior chapter facts.' }];
    await store.save(saved);
    await store.save(saved);
    const active = await fs.readFile(store.activePath, 'utf8');
    const backup = await fs.readFile(store.backupPath, 'utf8');
    const error = new ProviderError('ollama', 'request-timeout', 'Retry the summary.');
    const stub = provider((request, call) => {
      if (call === failedCall) throw error;
      return structuredClone(request.kind === 'chapter' ? chapterResult : globalResult);
    });
    const summarizer = new StorySummarizer({ chapterLength: 2 });
    const before = structuredClone(saved);
    freeze(saved);
    await assert.rejects(summarizer.update(saved, stub, 'story-model').then((next) => store.save(next)),
      (caught) => caught === error);
    assert.deepEqual(saved, before);
    assert.equal(await fs.readFile(store.activePath, 'utf8'), active);
    assert.equal(await fs.readFile(store.backupPath, 'utf8'), backup);
    const restored = await new AdventureStore(userData).load();
    assert.deepEqual(restored, before);
    const retry = provider();
    const next = await summarizer.update(restored, retry, 'story-model');
    await store.save(next);
    assert.deepEqual((await new AdventureStore(userData).load()).segments, before.segments);
    assert.equal(next.chapterSummaries.length, 2);
    assert.deepEqual(summarizer.chaptersDue(next), []);
  });
}

for (const failedKind of ['chapter', 'global']) {
  test(`malformed ${failedKind} output cannot replace prior memory`, async () => {
    const saved = freeze(adventure());
    const before = structuredClone(saved);
    const stub = provider((request) => request.kind === failedKind
      ? { text: '', keyFacts: [], unresolvedThreads: [] } : structuredClone(chapterResult));
    await assert.rejects(new StorySummarizer({ chapterLength: 2 }).update(saved, stub, 'story-model'), ProviderContractError);
    assert.deepEqual(saved, before);
  });
}

test('a failed final save leaves both memory levels and the source transcript available', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const saved = adventure();
  await store.save(saved);
  const staged = await new StorySummarizer({ chapterLength: 2 }).update(saved, provider(), 'story-model');
  const failing = new AdventureStore(userData, {
    ...fs,
    rename: async (from, to) => {
      if (to === store.activePath) throw new Error('Simulated commit failure.');
      return fs.rename(from, to);
    }
  });
  await assert.rejects(failing.save(staged), /Simulated commit failure/);
  assert.deepEqual(await new AdventureStore(userData).load(), saved);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), saved);
  await store.save(staged);
  assert.deepEqual(await new AdventureStore(userData).load(), staged);
});

test('summary budgets reject oversized chapter or global context without changing source data', async () => {
  const saved = freeze(adventure());
  const before = structuredClone(saved);
  const chapterStub = provider();
  await assert.rejects(new StorySummarizer({ chapterLength: 2, contextBudgetTokens: 1 })
    .update(saved, chapterStub, 'story-model'), StoryContextBudgetError);
  assert.equal(chapterStub.requests.length, 0);
  const globalStub = provider(() => ({ text: 'A'.repeat(30_000), keyFacts: [], unresolvedThreads: [] }));
  await assert.rejects(new StorySummarizer({ chapterLength: 2 }).update(saved, globalStub, 'story-model'),
    StoryContextBudgetError);
  assert.equal(globalStub.requests.length, 1);
  assert.deepEqual(saved, before);
});

test('pending actions and missing source boundaries are rejected before provider calls', async () => {
  const summarizer = new StorySummarizer({ chapterLength: 2 });
  const stub = provider();
  for (const phase of [
    { kind: 'pending-opening', turnId: 'opening-1' },
    { kind: 'pending-assessment', choice: { turnId: 'turn-1', choiceId: 'choice-2', choiceText: 'Explore.' } },
    { kind: 'pending-narration', choice: { turnId: 'turn-1', choiceId: 'choice-2', choiceText: 'Explore.' }, check }
  ]) {
    await assert.rejects(summarizer.update({ ...adventure(), phase }, stub, 'story-model'), /completed story progress/);
  }
  const saved = adventure();
  saved.chapterSummaries = [{ chapterNumber: 1, throughSegmentId: 'missing', text: 'Valid prior memory.' }];
  await assert.rejects(summarizer.update(saved, stub, 'story-model'), /source boundary is missing/);
  assert.equal(stub.requests.length, 0);
});

test('a pending summary can resume its saved chapter even when current thresholds differ', async () => {
  const saved = adventure(1);
  saved.phase = { kind: 'pending-summary', turnId: 'summary-1', chapterNumber: 1 };
  const summarizer = new StorySummarizer({ chapterLength: 10 });
  assert.deepEqual(summarizer.chaptersDue(saved), [1]);
  const staged = await summarizer.update(freeze(saved), provider(), 'story-model');
  assert.deepEqual(staged.phase, saved.phase);
  assert.equal(staged.chapterSummaries[0].throughSegmentId, 'segment-1');
});

test('summary prompt asks for the contracted field types and preservation of unresolved facts', () => {
  const messages = summaryMessages({ modelId: 'story-model', kind: 'global', context: 'Prior story memory.' });
  assert.match(messages[0].content, /text as a string/);
  assert.match(messages[0].content, /keyFacts and unresolvedThreads as arrays of strings/);
  assert.match(messages[0].content, /resolve a thread only when the source events establish its resolution/);
});
