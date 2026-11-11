const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ATTRIBUTE_RANGES,
  createInitialAttributes,
  validateAttributeAllocation,
  validateCharacterSetup
} = require('../dist/shared/character-rules.js');

const balanced = {
  Strength: 3,
  Dexterity: 2,
  Intelligence: -2,
  Endurance: 0,
  Charisma: 0,
  Luck: 0
};

const simplified = {
  Strength: 2,
  Dexterity: 1,
  Intelligence: 0,
  Endurance: 0,
  Charisma: 0,
  Luck: 0
};

function setup(allocationMethod, attributes) {
  return {
    theme: 'Horror',
    character: { name: '  Mira  ', gender: '  Woman  ', nature: 'Good', allocationMethod, attributes }
  };
}

test('all six attributes start at zero with the agreed ranges', () => {
  assert.deepEqual(createInitialAttributes(), {
    Strength: 0, Dexterity: 0, Intelligence: 0,
    Endurance: 0, Charisma: 0, Luck: 0
  });
  for (const name of ['Strength', 'Dexterity', 'Intelligence', 'Endurance']) {
    assert.deepEqual(ATTRIBUTE_RANGES[name], { min: -2, max: 3 });
  }
  for (const name of ['Charisma', 'Luck']) {
    assert.deepEqual(ATTRIBUTE_RANGES[name], { min: -1, max: 1 });
  }
});

test('Balanced accepts five positive and two negative final points, including range edges', () => {
  assert.deepEqual(validateAttributeAllocation('Balanced', balanced), { valid: true, value: balanced });
  assert.equal(validateCharacterSetup(setup('Balanced', balanced)).valid, true);
});

test('Simplified accepts three positive final points and no negatives', () => {
  assert.deepEqual(validateAttributeAllocation('Simplified', simplified), { valid: true, value: simplified });
  assert.equal(validateCharacterSetup(setup('Simplified', simplified)).valid, true);
});

test('allocation budgets count positive and negative points separately', () => {
  assert.equal(validateAttributeAllocation('Balanced', { ...balanced, Intelligence: -1 }).valid, false);
  assert.equal(validateAttributeAllocation('Balanced', { ...balanced, Dexterity: 1 }).valid, false);
  assert.equal(validateAttributeAllocation('Simplified', { ...simplified, Luck: -1 }).valid, false);
  assert.equal(validateAttributeAllocation('Simplified', { ...simplified, Dexterity: 0 }).valid, false);
  // A matching net total does not substitute for either separate budget.
  assert.equal(validateAttributeAllocation('Balanced', { ...simplified, Luck: -1 }).valid, false);
});

test('out-of-range, fractional, missing, and extra attributes are rejected', () => {
  const invalid = [
    { ...balanced, Strength: 4 },
    { ...balanced, Intelligence: -3 },
    { ...balanced, Charisma: 2 },
    { ...balanced, Luck: -2 },
    { ...balanced, Strength: 1.5 },
    { ...balanced, Strength: Infinity },
    { ...balanced, Luck: undefined },
    { ...balanced, Agility: 0 }
  ];
  for (const attributes of invalid) {
    assert.equal(validateAttributeAllocation('Balanced', attributes).valid, false);
  }
});

test('theme, identity, Nature, and allocation method are required', () => {
  assert.equal(validateCharacterSetup(setup('Balanced', balanced)).value.character.name, 'Mira');
  assert.equal(validateCharacterSetup(setup('Balanced', balanced)).value.character.gender, 'Woman');
  for (const theme of ['Horror', 'Romance', 'High Fantasy']) {
    for (const nature of ['Good', 'Neutral', 'Bad']) {
      assert.equal(validateCharacterSetup({ ...setup('Simplified', simplified), theme,
        character: { ...setup('Simplified', simplified).character, nature } }).valid, true);
    }
  }
  for (const [field, value] of [
    ['theme', 'Science Fiction'], ['theme', undefined]
  ]) {
    assert.equal(validateCharacterSetup({ ...setup('Balanced', balanced), [field]: value }).valid, false);
  }
  for (const [field, value] of [
    ['name', '   '], ['gender', ' '], ['nature', 'Chaotic'], ['allocationMethod', 'Custom']
  ]) {
    const input = setup('Balanced', balanced);
    input.character[field] = value;
    assert.equal(validateCharacterSetup(input).valid, false);
  }
});
