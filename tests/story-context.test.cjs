const assert = require('node:assert/strict');
const test = require('node:test');
const { GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');
const { DEFAULT_STORY_CONFIGURATION, createStoryConfiguration } = require('../dist/main/story-config.js');
const { StoryContextBuilder, StoryContextBudgetError, estimateContextTokens } = require('../dist/main/story-context.js');

const check = {
  difficulty: 'Hard', attribute: 'Strength', attributeValue: 1,
  baseThreshold: 20, threshold: 30, roll: 25, outcome: 'success'
};
const pendingChoice = { turnId: 'turn-3', choiceId: 'enter', choiceText: 'Enter the crypt.' };

function adventure() {
  return {
    schemaVersion: 1, id: 'adventure-1', theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A bell sounds beneath the abbey.',
    globalSummary: 'Mira seeks her missing sister. The abbess is an ally.',
    chapterSummaries: [
      { chapterNumber: 1, throughSegmentId: 'segment-1', text: 'Mira promised to find the bell.' }
    ],
    segments: [
      {
        id: 'segment-1', chapterNumber: 1, narrative: 'The abbess points to a sealed gate.',
        choices: [{ id: 'open', text: 'Force the gate.' }], selectedChoiceId: 'open', check: null,
        createdAt: '2026-11-11T12:00:00.000Z'
      },
      {
        id: 'segment-2', chapterNumber: 2, narrative: 'The gate gives way. A crypt lies ahead.',
        choices: [{ id: 'enter', text: 'Enter the crypt.' }, { id: 'wait', text: 'Wait for the abbess.' }],
        selectedChoiceId: null, check, createdAt: '2026-11-11T12:01:00.000Z'
      }
    ],
    phase: { kind: 'ready' }, updatedAt: '2026-11-11T12:01:00.000Z'
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('internal story defaults match narrative targets and support independent overrides', () => {
  const defaults = createStoryConfiguration();
  assert.ok(defaults.paragraphTarget >= 2 && defaults.paragraphTarget <= 3);
  assert.ok(defaults.choiceTarget >= 3 && defaults.choiceTarget <= 4);
  const overrides = {
    paragraphTarget: 5, choiceTarget: 2, chapterLength: 12, recentEventCount: 8,
    contextBudgetTokens: 12_000, chapterSummaryThresholdTokens: 3_000, globalSummaryThresholdTokens: 5_000
  };
  assert.deepEqual(createStoryConfiguration(overrides), overrides);
  assert.deepEqual(createStoryConfiguration({ choiceTarget: 4 }), { ...defaults, choiceTarget: 4 });
  overrides.choiceTarget = 7;
  assert.equal(defaults.choiceTarget, DEFAULT_STORY_CONFIGURATION.choiceTarget);
  assert.ok(Object.isFrozen(defaults));
  assert.ok(Object.isFrozen(DEFAULT_STORY_CONFIGURATION));
});

test('invalid configuration values fail before context can be built', () => {
  for (const key of Object.keys(DEFAULT_STORY_CONFIGURATION)) {
    for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '3', null, undefined]) {
      assert.throws(() => new StoryContextBuilder({ [key]: value }), TypeError);
    }
  }
  assert.throws(() => createStoryConfiguration({ recentEvents: 3 }), /Unknown story configuration/);
});

test('context contains shared rules, full character, theme, premise, memory, decisions, and check results', () => {
  const saved = freeze(adventure());
  const before = structuredClone(saved);
  const context = JSON.parse(new StoryContextBuilder().build(saved));
  assert.equal(context.rules, GAME_RULES_TEXT);
  assert.equal(context.theme, saved.theme);
  assert.deepEqual(context.character, saved.character);
  assert.equal(context.character.nature, 'Good');
  assert.equal(context.premise, saved.premise);
  assert.equal(context.globalSummary, saved.globalSummary);
  assert.deepEqual(context.chapterSummaries, saved.chapterSummaries);
  assert.deepEqual(context.recentEvents, [
    { segmentId: 'segment-1', chapterNumber: 1, narrative: saved.segments[0].narrative,
      decision: { id: 'open', text: 'Force the gate.' }, check: null },
    { segmentId: 'segment-2', chapterNumber: 2, narrative: saved.segments[1].narrative,
      decision: null, check }
  ]);
  assert.deepEqual(context.latestDecision, { id: 'open', text: 'Force the gate.' });
  assert.deepEqual(context.latestCheck, check);
  assert.deepEqual(saved, before);
});

test('recent-event configuration limits detail while retaining memory and the latest decision', () => {
  const saved = freeze(adventure());
  const context = JSON.parse(new StoryContextBuilder({ recentEventCount: 1 }).build(saved));
  assert.deepEqual(context.recentEvents.map((event) => event.segmentId), ['segment-2']);
  assert.deepEqual(context.latestDecision, { id: 'open', text: 'Force the gate.' });
  assert.equal(context.globalSummary, saved.globalSummary);
  assert.deepEqual(context.chapterSummaries, saved.chapterSummaries);
  assert.equal(saved.segments.length, 2);
});

test('pending assessment uses the saved decision and keeps the prior roll historical', () => {
  const saved = adventure();
  saved.segments[1].selectedChoiceId = 'enter';
  saved.phase = { kind: 'pending-assessment', choice: pendingChoice };
  const builder = new StoryContextBuilder({ paragraphTarget: 4, choiceTarget: 2 });
  const request = builder.assessmentRequest('local-model', freeze(saved));
  assert.equal(request.modelId, 'local-model');
  assert.equal(request.paragraphTarget, 4);
  assert.equal(request.choiceTarget, 2);
  assert.deepEqual(request.choice, pendingChoice);
  assert.deepEqual(request.attributes, saved.character.attributes);
  const context = JSON.parse(request.context);
  assert.deepEqual(context.latestDecision, { id: 'enter', text: 'Enter the crypt.' });
  assert.equal(context.latestCheck, null);
  assert.deepEqual(context.recentEvents[1].check, check);
  // Requests are detached from saved data, including the authoritative pending choice.
  request.choice.choiceText = 'Changed request';
  request.attributes.Strength = -2;
  assert.equal(saved.phase.choice.choiceText, 'Enter the crypt.');
  assert.equal(saved.character.attributes.Strength, 1);
});

test('checked narration includes the saved authoritative result and configured targets', () => {
  const saved = adventure();
  const failedCheck = { ...check, roll: 99, outcome: 'failure' };
  saved.segments[1].selectedChoiceId = 'enter';
  saved.phase = { kind: 'pending-narration', choice: pendingChoice, check: failedCheck };
  const request = new StoryContextBuilder({ paragraphTarget: 2, choiceTarget: 4 })
    .narrationRequest('external-model', freeze(saved));
  assert.equal(request.modelId, 'external-model');
  assert.equal(request.paragraphTarget, 2);
  assert.equal(request.choiceTarget, 4);
  assert.deepEqual(request.choice, pendingChoice);
  assert.deepEqual(request.check, failedCheck);
  const context = JSON.parse(request.context);
  assert.deepEqual(context.latestCheck, failedCheck);
  assert.deepEqual(context.latestDecision, { id: 'enter', text: 'Enter the crypt.' });
  request.check.roll = 1;
  assert.equal(saved.phase.check.roll, 99);
});

test('opening requests use shared rules and configured targets with no existing story required', () => {
  const saved = adventure();
  saved.segments = [];
  saved.chapterSummaries = [];
  saved.globalSummary = '';
  saved.premise = null;
  saved.phase = { kind: 'pending-opening', turnId: 'opening-1' };
  freeze(saved);
  const builder = new StoryContextBuilder({ paragraphTarget: 2, choiceTarget: 4 });
  const request = builder.openingRequest('story-model', saved);
  assert.deepEqual(request, {
    modelId: 'story-model', theme: saved.theme, character: saved.character,
    rules: GAME_RULES_TEXT, paragraphTarget: 2, choiceTarget: 4
  });
  request.character.attributes.Luck = 1;
  assert.equal(saved.character.attributes.Luck, -1);
  const context = JSON.parse(builder.build(saved));
  assert.deepEqual(context.recentEvents, []);
  assert.deepEqual(context.chapterSummaries, []);
  assert.equal(context.globalSummary, '');
  assert.equal(context.latestDecision, null);
  assert.equal(context.latestCheck, null);
});

test('request builders reject phases that lack a saved decision or check', () => {
  const builder = new StoryContextBuilder();
  const saved = adventure();
  assert.throws(() => builder.assessmentRequest('story-model', saved), /saved pending choice/);
  assert.throws(() => builder.narrationRequest('story-model', saved), /saved check result/);
  saved.phase = { kind: 'pending-assessment', choice: pendingChoice };
  assert.throws(() => builder.narrationRequest('story-model', saved), /saved check result/);
  saved.phase = { kind: 'pending-narration', choice: pendingChoice, check };
  assert.throws(() => builder.assessmentRequest('story-model', saved), /saved pending choice/);
});

test('context budget accepts its boundary and rejects oversized context without changing saved data', () => {
  const saved = freeze(adventure());
  const before = structuredClone(saved);
  const text = new StoryContextBuilder().build(saved);
  const tokens = estimateContextTokens(text);
  assert.equal(new StoryContextBuilder({ contextBudgetTokens: tokens }).build(saved), text);
  assert.throws(() => new StoryContextBuilder({ contextBudgetTokens: tokens - 1 }).build(saved), (error) => {
    assert.ok(error instanceof StoryContextBudgetError);
    assert.equal(error.code, 'context-budget-exceeded');
    assert.equal(error.estimatedTokens, tokens);
    assert.equal(error.budgetTokens, tokens - 1);
    return true;
  });
  assert.throws(() => new StoryContextBuilder({ contextBudgetTokens: 1 }).openingRequest('model', saved),
    StoryContextBudgetError);
  assert.deepEqual(saved, before);
});

test('size estimation accounts for UTF-8 text rather than only JavaScript string length', () => {
  assert.equal(estimateContextTokens(''), 0);
  assert.equal(estimateContextTokens('abcd'), 2);
  assert.equal(estimateContextTokens('古城'), 2);
  assert.equal(estimateContextTokens('🏰'), 2);
});
