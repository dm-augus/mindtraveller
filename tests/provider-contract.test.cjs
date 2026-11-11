const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ProviderContractError,
  parseActionAssessmentResponse,
  parseCheckedNarrationResponse,
  parseModelOptions,
  parseModelSelection,
  parseOpeningResponse,
  parseSummaryResponse
} = require('../dist/shared/provider-contract.js');

const choices = [
  { id: 'inspect', text: 'Inspect the gate.' },
  { id: 'wait', text: 'Wait until dawn.' },
  { id: 'leave', text: 'Leave the abbey.' }
];
const attributes = {
  Strength: 1, Dexterity: 1, Intelligence: 2,
  Endurance: 1, Charisma: -1, Luck: -1
};

function invalidResponse(action) {
  assert.throws(action, (error) => error instanceof ProviderContractError
    && error.code === 'invalid-provider-response');
}

test('opening and no-check responses accept distinct, well formed choices', () => {
  const opening = {
    premise: 'An ancient bell wakes the abbey.',
    narrative: 'The road leads to a locked gate.',
    choices
  };
  assert.deepEqual(parseOpeningResponse(opening, 3), opening);

  const continuation = { kind: 'no-check', narrative: 'You wait as dawn rises.', choices };
  assert.deepEqual(parseActionAssessmentResponse(continuation, 3, attributes), continuation);
});

test('choice schemas reject missing fields, blanks, duplicates, extras, and wrong counts', () => {
  const opening = { premise: 'A premise.', narrative: 'A scene.', choices };
  const invalidChoices = [
    choices.slice(0, 2),
    [choices[0], choices[1], { text: 'Another action.' }],
    [choices[0], choices[1], { id: 'third', text: '   ' }],
    [choices[0], choices[1], { id: 'inspect', text: 'Another action.' }],
    [choices[0], choices[1], { id: 'third', text: 'INSPECT THE GATE.' }],
    [choices[0], choices[1], { id: 'third', text: 'Another action.', roll: 42 }]
  ];
  for (const invalid of invalidChoices) {
    invalidResponse(() => parseOpeningResponse({ ...opening, choices: invalid }, 3));
    invalidResponse(() => parseActionAssessmentResponse({ kind: 'no-check', narrative: 'A scene.', choices: invalid }, 3, attributes));
  }
  invalidResponse(() => parseOpeningResponse({ ...opening, premise: '' }, 3));
  invalidResponse(() => parseOpeningResponse({ ...opening, roll: 42 }, 3));
  assert.throws(() => parseOpeningResponse(opening, 0), /Choice target/);
});

test('check assessment accepts known classifications and rejects malformed ones', () => {
  const valid = { kind: 'check', difficulty: 'Hard', attribute: 'Strength' };
  assert.deepEqual(parseActionAssessmentResponse(valid, 3, attributes), valid);
  for (const invalid of [
    { ...valid, difficulty: 'Impossible' },
    { ...valid, attribute: 'Agility' },
    { ...valid, roll: 10 },
    { kind: 'check', difficulty: 'Hard' },
    { kind: 'maybe', difficulty: 'Hard', attribute: 'Strength' }
  ]) invalidResponse(() => parseActionAssessmentResponse(invalid, 3, attributes));
  invalidResponse(() => parseActionAssessmentResponse(
    { kind: 'check', difficulty: 'Easy', attribute: 'Charisma' },
    3,
    { ...attributes, Charisma: 2 }
  ));
});

test('checked narration must acknowledge the saved outcome', () => {
  const response = { outcome: 'failure', narrative: 'The gate holds against you.', choices };
  assert.deepEqual(parseCheckedNarrationResponse(response, 3, 'failure'), response);
  invalidResponse(() => parseCheckedNarrationResponse({ ...response, outcome: 'success' }, 3, 'failure'));
  invalidResponse(() => parseCheckedNarrationResponse({ ...response, outcome: 'partial' }, 3, 'failure'));
  invalidResponse(() => parseCheckedNarrationResponse({ ...response, roll: 100 }, 3, 'failure'));
});

test('summary and model contracts validate structured details and selection', () => {
  const summary = {
    text: 'Mira reached the abbey.',
    keyFacts: ['The gate is sealed.'],
    unresolvedThreads: ['Who rang the bell?']
  };
  assert.deepEqual(parseSummaryResponse(summary), summary);
  invalidResponse(() => parseSummaryResponse({ ...summary, keyFacts: 'The gate is sealed.' }));
  invalidResponse(() => parseSummaryResponse({ ...summary, unresolvedThreads: ['Question?', 'question?'] }));

  const models = [{ id: 'story-a', label: 'Story A' }, { id: 'story-b', label: 'Story B' }];
  assert.deepEqual(parseModelOptions(models), models);
  invalidResponse(() => parseModelOptions([{ id: 'story-a', label: 'Story A' }, { id: 'story-a', label: 'Duplicate' }]));
  invalidResponse(() => parseModelOptions([{ id: '', label: 'Empty ID' }]));
  assert.deepEqual(parseModelSelection({ provider: 'ollama', modelId: ' story-a ' }), {
    provider: 'ollama', modelId: 'story-a'
  });
  assert.deepEqual(parseModelSelection({ provider: 'openai', modelId: 'story-b' }), {
    provider: 'openai', modelId: 'story-b'
  });
  assert.throws(() => parseModelSelection({ provider: 'other', modelId: 'story-a' }), /Unknown provider/);
  assert.throws(() => parseModelSelection({ provider: 'openai', modelId: ' ' }), /Select a model/);
});
