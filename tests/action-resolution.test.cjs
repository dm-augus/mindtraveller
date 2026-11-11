const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const {
  DIFFICULTY_BASE_THRESHOLDS,
  calculateSuccessThreshold,
  createCheckRecord,
  validateCheckSelection
} = require('../dist/shared/action-rules.js');
const { rollCheck } = require('../dist/main/action-resolution.js');

const attributes = {
  Strength: 3,
  Dexterity: 0,
  Intelligence: -2,
  Endurance: 0,
  Charisma: 0,
  Luck: 1
};

test('difficulty classes map to their agreed base thresholds', () => {
  assert.deepEqual(DIFFICULTY_BASE_THRESHOLDS, {
    'Very Hard': 5,
    Hard: 20,
    Medium: 50,
    Easy: 80,
    'Very Easy': 90
  });
  assert.equal(calculateSuccessThreshold('Hard', 1), 30);
  assert.equal(calculateSuccessThreshold('Medium', -2), 30);
});

test('thresholds clamp at 0 and 98', () => {
  assert.equal(calculateSuccessThreshold('Very Hard', -2), 0);
  assert.equal(calculateSuccessThreshold('Easy', 3), 98);
  assert.equal(calculateSuccessThreshold('Very Easy', 1), 98);
  assert.equal(createCheckRecord({ difficulty: 'Very Hard', attribute: 'Intelligence', attributeValue: -2 }, 1).outcome, 'failure');
});

test('result record keeps the input and succeeds at the inclusive threshold', () => {
  const selection = { difficulty: 'Hard', attribute: 'Strength', attributeValue: 1 };
  assert.deepEqual(createCheckRecord(selection, 30), {
    difficulty: 'Hard',
    attribute: 'Strength',
    attributeValue: 1,
    baseThreshold: 20,
    threshold: 30,
    roll: 30,
    outcome: 'success'
  });
  assert.equal(createCheckRecord(selection, 31).outcome, 'failure');
});

test('99 and 100 always fail, even at the maximum threshold', () => {
  const selection = { difficulty: 'Easy', attribute: 'Strength', attributeValue: 3 };
  assert.equal(createCheckRecord(selection, 98).outcome, 'success');
  assert.equal(createCheckRecord(selection, 99).outcome, 'failure');
  assert.equal(createCheckRecord(selection, 100).outcome, 'failure');
});

test('unknown classifications and malformed values are rejected', () => {
  assert.throws(() => validateCheckSelection('Impossible', 'Strength', attributes), /difficulty/);
  assert.throws(() => validateCheckSelection('Hard', 'Agility', attributes), /attribute/);
  assert.throws(() => validateCheckSelection('Hard', 'Charisma', { ...attributes, Charisma: 2 }), /Charisma/);
  assert.throws(() => validateCheckSelection('Hard', 'Strength', { ...attributes, Strength: 1.5 }), /Strength/);
  assert.throws(() => createCheckRecord({ difficulty: 'Hard', attribute: 'Strength', attributeValue: 1 }, 0), /D100/);
  assert.throws(() => createCheckRecord({ difficulty: 'Hard', attribute: 'Strength', attributeValue: 1 }, 101), /D100/);
  assert.throws(() => createCheckRecord({ difficulty: 'Hard', attribute: 'Strength', attributeValue: 1 }, 3.5), /D100/);
});

test('main process requests exactly one secure D100 roll after validation', (t) => {
  let calls = 0;
  t.mock.method(crypto, 'randomInt', (min, max) => {
    calls += 1;
    assert.deepEqual([min, max], [1, 101]);
    return 99;
  });
  assert.throws(() => rollCheck('Impossible', 'Strength', attributes), /difficulty/);
  assert.throws(() => rollCheck('Hard', 'Agility', attributes), /attribute/);
  assert.equal(calls, 0);
  const record = rollCheck('Easy', 'Strength', attributes);
  assert.equal(calls, 1);
  assert.deepEqual(record, {
    difficulty: 'Easy',
    attribute: 'Strength',
    attributeValue: 3,
    baseThreshold: 80,
    threshold: 98,
    roll: 99,
    outcome: 'failure'
  });
});
