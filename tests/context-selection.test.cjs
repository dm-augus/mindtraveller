const assert = require('node:assert/strict');
const test = require('node:test');
const { GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');
const { StoryContextBuilder, StoryContextBudgetError, estimateContextTokens } = require('../dist/main/story-context.js');
const { StorySummarizer } = require('../dist/main/story-summarizer.js');

const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 99, outcome: 'failure'
};

function adventure(chapters = 60) {
  const segments = [];
  const chapterSummaries = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    for (let event = 1; event <= 2; event += 1) {
      const number = segments.length + 1;
      segments.push({
        id: `segment-${number}`, chapterNumber: chapter,
        narrative: `Detail from chapter ${chapter}, event ${event}. ${'Mira crosses the old abbey courtyard. '.repeat(8)}`,
        choices: [{ id: `choice-${number}`, text: `Explore chamber ${number}.` }],
        selectedChoiceId: chapter === chapters && event === 2 ? null : `choice-${number}`,
        check: event === 2 ? { ...check } : null, createdAt: '2026-11-11T12:00:00.000Z'
      });
    }
    chapterSummaries.push({
      chapterNumber: chapter, throughSegmentId: `segment-${chapter * 2}`,
      text: `Chapter ${chapter} developments. ${'Mira helped the abbess and learned about the sealed crypt. '.repeat(8)}`
    });
  }
  return {
    schemaVersion: 1, id: 'long-adventure', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell rings beneath the abbey.', segments, chapterSummaries,
    globalSummary: 'The abbess remains an ally from chapter 1. Unresolved threads: Find Mira’s sister. Locate the buried bell.',
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

function protectedContext(saved, recentEventCount = 2) {
  const context = JSON.parse(new StoryContextBuilder({ recentEventCount, contextBudgetTokens: 1_000_000 }).build(saved));
  context.chapterSummaries = [];
  return context;
}

test('long adventures use bounded chapter memory while preserving rules, objectives, and the recent window', () => {
  for (const chapters of [20, 200, 1000]) {
    const saved = freeze(adventure(chapters));
    const before = JSON.stringify(saved);
    const builder = new StoryContextBuilder({ recentEventCount: 4, contextBudgetTokens: 3000 });
    const text = builder.build(saved);
    const context = JSON.parse(text);
    assert.ok(estimateContextTokens(text) <= builder.configuration.contextBudgetTokens);
    assert.equal(context.rules, GAME_RULES_TEXT);
    assert.equal(context.theme, saved.theme);
    assert.deepEqual(context.character, saved.character);
    assert.equal(context.premise, saved.premise);
    assert.equal(context.globalSummary, saved.globalSummary);
    assert.ok(context.globalSummary.includes('Find Mira’s sister.'));
    assert.deepEqual(context.recentEvents.map((event) => event.segmentId), saved.segments.slice(-4).map((event) => event.id));
    for (const event of context.recentEvents) {
      assert.equal(event.narrative, saved.segments.find((source) => source.id === event.segmentId).narrative);
    }
    assert.deepEqual(context.unsummarizedEvents, []);
    assert.ok(context.chapterSummaries.length > 0 && context.chapterSummaries.length < chapters);
    assert.ok(context.chapterSummaries.some((summary) => summary.chapterNumber === chapters));
    assert.ok(!text.includes('Detail from chapter 1, event 1.'));
    assert.ok(text.includes('ally from chapter 1'));
    assert.equal(JSON.stringify(saved), before);
  }
});

test('chapter detail fits at the exact budget boundary, in chronological order', () => {
  const saved = freeze(adventure(3));
  const expected = protectedContext(saved);
  expected.chapterSummaries = saved.chapterSummaries.slice(-1);
  const budget = estimateContextTokens(JSON.stringify(expected));
  const text = new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: budget }).build(saved);
  assert.equal(estimateContextTokens(text), budget);
  assert.deepEqual(JSON.parse(text), expected);

  const expanded = new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: budget + 500 }).build(saved);
  const summaries = JSON.parse(expanded).chapterSummaries;
  assert.ok(summaries.length > 1);
  assert.deepEqual(summaries.map((summary) => summary.chapterNumber),
    [...summaries].map((summary) => summary.chapterNumber).sort((left, right) => left - right));
});

test('a large optional summary is skipped so smaller chapter memory can still fit', () => {
  const saved = adventure(3);
  saved.chapterSummaries[2].text = 'Oversized chapter detail. '.repeat(2000);
  const text = new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: 3000 }).build(freeze(saved));
  const context = JSON.parse(text);
  assert.ok(context.chapterSummaries.length > 0);
  assert.ok(context.chapterSummaries.every((summary) => summary.chapterNumber !== 3));
  assert.equal(context.globalSummary, saved.globalSummary);
  assert.equal(context.recentEvents.length, 2);
  assert.ok(estimateContextTokens(text) <= 3000);
});

test('recent chapters are preferred even when summary storage order changes', () => {
  const saved = adventure(4);
  saved.chapterSummaries.reverse();
  const expected = protectedContext(saved);
  expected.chapterSummaries = [saved.chapterSummaries[0]];
  const budget = estimateContextTokens(JSON.stringify(expected));
  const context = JSON.parse(new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: budget }).build(freeze(saved)));
  assert.deepEqual(context.chapterSummaries.map((summary) => summary.chapterNumber), [4]);
});

for (const phaseKind of ['pending-assessment', 'pending-narration']) {
  test(`bounded ${phaseKind} requests retain the saved choice and authoritative check`, () => {
    const saved = adventure();
    const latest = saved.segments.at(-1);
    latest.selectedChoiceId = latest.choices[0].id;
    const choice = { turnId: 'turn-120', choiceId: latest.choices[0].id, choiceText: latest.choices[0].text };
    saved.phase = phaseKind === 'pending-narration' ? { kind: phaseKind, choice, check: { ...check } }
      : { kind: phaseKind, choice };
    const before = structuredClone(saved);
    const builder = new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: 3000 });
    const request = phaseKind === 'pending-narration' ? builder.narrationRequest('model', freeze(saved))
      : builder.assessmentRequest('model', freeze(saved));
    const context = JSON.parse(request.context);
    assert.ok(estimateContextTokens(request.context) <= 3000);
    assert.deepEqual(request.choice, choice);
    assert.deepEqual(context.latestDecision, { id: choice.choiceId, text: choice.choiceText });
    assert.deepEqual(context.latestCheck, phaseKind === 'pending-narration' ? check : null);
    if (phaseKind === 'pending-narration') assert.deepEqual(request.check, check);
    assert.equal(context.globalSummary, saved.globalSummary);
    assert.deepEqual(saved, before);
  });
}

test('partial chapter coverage keeps older unsummarized source events outside the recent window', () => {
  const saved = adventure(3);
  saved.chapterSummaries[0].throughSegmentId = 'segment-1';
  saved.chapterSummaries.splice(1, 1);
  const context = JSON.parse(new StoryContextBuilder({ recentEventCount: 1 }).build(freeze(saved)));
  assert.deepEqual(context.unsummarizedEvents.map((event) => event.segmentId), ['segment-2', 'segment-3', 'segment-4']);
  assert.deepEqual(context.unsummarizedEvents[0].check, check);
  assert.deepEqual(context.unsummarizedEvents[0].decision,
    { id: 'choice-2', text: 'Explore chamber 2.' });
  assert.equal(context.recentEvents[0].segmentId, 'segment-6');
  assert.ok(!context.unsummarizedEvents.some((event) => event.segmentId === 'segment-1'));
});

test('missing or mismatched coverage cannot discard chapter source events', () => {
  for (const boundary of ['missing-segment', 'segment-4']) {
    const saved = adventure(3);
    saved.chapterSummaries[0].throughSegmentId = boundary;
    const context = JSON.parse(new StoryContextBuilder({ recentEventCount: 2 }).build(freeze(saved)));
    assert.deepEqual(context.unsummarizedEvents.map((event) => event.segmentId), ['segment-1', 'segment-2']);
  }
});

test('an impossible budget fails without truncating objectives, rules, or unsummarized events', () => {
  const saved = adventure(3);
  saved.chapterSummaries = [];
  const before = structuredClone(saved);
  const core = protectedContext(saved);
  const budget = estimateContextTokens(JSON.stringify(core)) - 1;
  assert.throws(() => new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: budget }).build(freeze(saved)),
    StoryContextBudgetError);
  assert.deepEqual(saved, before);

  const largeObjectives = adventure(2);
  largeObjectives.globalSummary = 'An unresolved objective must remain. '.repeat(1000);
  assert.throws(() => new StoryContextBuilder().build(freeze(largeObjectives)), StoryContextBudgetError);
});

test('required chapter updates cannot be displaced by optional memory during global summarization', async () => {
  const saved = adventure(40);
  saved.chapterSummaries.pop();
  const before = structuredClone(saved);
  const requests = [];
  const stub = {
    summarize: async (request) => {
      requests.push(request);
      return { text: 'Mira reached the final crypt.', keyFacts: ['The bell is inside.'], unresolvedThreads: ['Find her sister.'] };
    }
  };
  const updated = await new StorySummarizer({ chapterLength: 2, recentEventCount: 2, contextBudgetTokens: 3000 })
    .update(freeze(saved), stub, 'model');
  assert.deepEqual(requests.map((request) => request.kind), ['chapter', 'global']);
  const global = JSON.parse(requests[1].context);
  assert.ok(estimateContextTokens(requests[1].context) <= 3000);
  assert.ok(global.chapterSummaries.length < updated.chapterSummaries.length);
  assert.deepEqual(global.chapterSummaries.find((summary) => summary.chapterNumber === 40), updated.chapterSummaries.at(-1));
  assert.equal(global.globalSummary, saved.globalSummary);
  assert.deepEqual(saved, before);
});

test('a required chapter must exist and fit; optional selection cannot hide a failed update', () => {
  const saved = adventure(3);
  const builder = new StoryContextBuilder({ recentEventCount: 2, contextBudgetTokens: 3000 });
  assert.throws(() => builder.build(saved, { requiredChapterNumbers: [99] }), /required chapter summary is missing/);
  saved.chapterSummaries[0].text = 'New required memory. '.repeat(2000);
  assert.throws(() => builder.build(freeze(saved), { requiredChapterNumbers: [1] }), StoryContextBudgetError);
});
