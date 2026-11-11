const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALLOCATION_BUDGETS,
  ATTRIBUTE_NAMES,
  ATTRIBUTE_RANGES,
  ATTRIBUTE_THRESHOLD_STEP,
  DIFFICULTY_BASE_THRESHOLDS,
  MAX_SUCCESS_THRESHOLD,
  MIN_SUCCESS_THRESHOLD
} = require('../dist/shared/rules.js');
const { GAME_RULES_TEXT, RULES_SECTIONS } = require('../dist/shared/rules-reference.js');

test('one English rule source can be used by prompts and the Rules screen', () => {
  assert.equal(
    GAME_RULES_TEXT,
    RULES_SECTIONS.map(({ heading, text }) => `${heading}\n${text}`).join('\n\n')
  );
  for (const heading of ['Story choices', 'Attributes', 'Character creation', 'D100 checks', 'Difficulty', 'Threshold and result', 'Nature']) {
    assert.ok(RULES_SECTIONS.some((section) => section.heading === heading));
  }
});

test('the text lists every validated attribute and allocation budget', () => {
  for (const name of ATTRIBUTE_NAMES) {
    const { min, max } = ATTRIBUTE_RANGES[name];
    assert.ok(GAME_RULES_TEXT.includes(`${name}: ${min} to +${max}`), name);
  }
  for (const method of ['Balanced', 'Simplified']) {
    const { positive, negative } = ALLOCATION_BUDGETS[method];
    assert.ok(GAME_RULES_TEXT.includes(`${method} allocation requires exactly ${positive} positive points and ${negative} negative points`));
  }
  assert.match(GAME_RULES_TEXT, /Every attribute starts at 0/);
});

test('the text lists each base threshold and the implemented D100 boundaries', () => {
  for (const [difficulty, base] of Object.entries(DIFFICULTY_BASE_THRESHOLDS)) {
    assert.ok(GAME_RULES_TEXT.includes(`${difficulty}: ${base}.`), difficulty);
  }
  assert.ok(GAME_RULES_TEXT.includes(
    `max(${MIN_SUCCESS_THRESHOLD}, min(${MAX_SUCCESS_THRESHOLD}, base threshold + attribute value × ${ATTRIBUTE_THRESHOLD_STEP}))`
  ));
  assert.match(GAME_RULES_TEXT, /integer from 1 to 100/);
  assert.match(GAME_RULES_TEXT, /less than or equal to the final threshold/);
  assert.match(GAME_RULES_TEXT, /99 and 100 always fail/);
  assert.match(GAME_RULES_TEXT, /threshold of 0 cannot succeed/);
});

test('the text distinguishes uncertain actions and Nature from numeric checks', () => {
  assert.match(GAME_RULES_TEXT, /Trivial or guaranteed actions continue without a roll/);
  assert.match(GAME_RULES_TEXT, /application validates them, generates the roll, and determines success or failure/);
  assert.match(GAME_RULES_TEXT, /Nature is Good, Neutral, or Bad/);
  assert.match(GAME_RULES_TEXT, /never changes D100 odds or forbids a plausible action/);
});
