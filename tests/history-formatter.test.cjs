const test = require('node:test');
const assert = require('node:assert/strict');
const { formatHistory } = require('../dist/main/history-formatter.js');
function fixture(language) {
  return { mainObjective: 'Find the cause of the disturbance.', storyState: { location: null, situation: 'At the current scene.', currentFocus: null }, language, theme: 'Horror', character: { name: 'João', gender: 'Man', nature: 'Good', allocationMethod: 'Simplified',
    attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 } },
    premise: 'Uma maldição. An ancient curse.', segments: Array.from({ length: 30 }, (_, index) => ({
      chapterNumber: Math.floor(index / 10) + 1, narrative: `Passagem ${index}: ação e coração.\n\nThe bell rings.`,
      choices: [{ id: 'a', text: `Investigar ${index}.` }, { id: 'b', text: `Esperar ${index}.` }],
      selectedChoiceId: 'a', check: null })), phase: { kind: 'ready' },
    globalSummary: 'SECRET MEMORY', chapterSummaries: [{ text: 'PRIVATE SUMMARY' }], openai: { key: 'SECRET KEY' } };
}
for (const language of ['en', 'pt-BR']) test(`${language} exports all source scenes and offered choices without mutating history`, () => {
  const adventure = fixture(language), before = structuredClone(adventure), text = formatHistory(adventure);
  for (const segment of adventure.segments) {
    assert.ok(text.includes(segment.narrative));
    for (const choice of segment.choices) assert.ok(text.includes(choice.text));
  }
  assert.equal((text.match(/^### Scene /gm) || []).length, 30);
  assert.equal((text.match(/^## Chapter /gm) || []).length, 3);
  assert.equal((text.match(/\[Selected\]/g) || []).length, 30);
  assert.match(text, /João/); assert.match(text, /Luck: 0/);
  assert.doesNotMatch(text, /SECRET|PRIVATE/);
  assert.deepEqual(Buffer.from(text, 'utf8').toString('utf8'), text);
  assert.deepEqual(adventure, before);
});
test('pending assessment and narration identify the selected action once and the saved roll once', () => {
  for (const kind of ['pending-assessment', 'pending-narration']) {
    const adventure = fixture('pt-BR');
    const check = { difficulty: 'Hard', attribute: 'Strength', attributeValue: 3, roll: 25, threshold: 50, outcome: 'success' };
    adventure.phase = { kind, choice: { choiceText: 'Investigar 29.' }, check };
    const text = formatHistory(adventure);
    assert.equal(text.split('Investigar 29.').length - 1, 1);
    assert.match(text, /selected option in Scene 30/);
    if (kind === 'pending-narration') assert.match(text, /Hard · Strength \+3 · D100 25 · Threshold 50 · success/);
    else assert.doesNotMatch(text, /D100/);
  }
});
test('committed checks and pending summaries do not invent scenes or export memory', () => {
  const adventure = fixture('en');
  adventure.segments[1].check = { difficulty: 'Very Hard', attribute: 'Luck', attributeValue: -1, roll: 99, threshold: 0, outcome: 'failure' };
  adventure.phase = { kind: 'pending-summary', chapterNumber: 3 };
  const text = formatHistory(adventure);
  assert.equal(text.split('D100 99').length - 1, 1);
  assert.match(text, /Luck -1/); assert.match(text, /Chapter 3 memory update pending/);
  assert.doesNotMatch(text, /PRIVATE SUMMARY|SECRET MEMORY|Scene 31/);
});
