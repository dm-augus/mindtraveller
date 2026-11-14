const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { validateCharacterSetup } = require('../dist/shared/character-rules.js');

function memoryFiles() {
  const documents = new Map();
  return { documents, mkdir: async () => undefined,
    readFile: async (file) => { if (!documents.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return documents.get(file); },
    writeFile: async (file, text) => { documents.set(file, text); },
    rename: async (from, to) => { documents.set(to, documents.get(from)); documents.delete(from); },
    unlink: async (file) => { documents.delete(file); } };
}
const choice = { turnId: 'turn', choiceId: 'enter', choiceText: 'Enter.' };
const check = { difficulty: 'Hard', attribute: 'Strength', attributeValue: 3,
  baseThreshold: 20, threshold: 50, roll: 30, outcome: 'success' };
function legacy(phase) {
  return { schemaVersion: 1, id: 'old', theme: 'Horror', character: {
    name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Simplified',
    attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
  }, premise: phase.kind === 'pending-opening' ? null : 'A village.',
  segments: phase.kind === 'pending-opening' ? [] : [{ id: 'scene', chapterNumber: 1, narrative: 'A gate.',
    choices: [{ id: 'enter', text: 'Enter.' }],
    selectedChoiceId: ['pending-assessment', 'pending-narration'].includes(phase.kind) ? 'enter' : null,
    check: null, createdAt: '2026-11-14' }], chapterSummaries: [], globalSummary: '', phase, updatedAt: '2026-11-14' };
}
for (const phase of [{ kind: 'ready' }, { kind: 'pending-opening', turnId: 'turn' },
  { kind: 'pending-assessment', choice }, { kind: 'pending-narration', choice, check },
  { kind: 'pending-summary', turnId: 'turn', chapterNumber: 1 }]) {
  test(`legacy ${phase.kind} normalizes on read and optimistic save without rewriting history`, async () => {
    const files = memoryFiles(), store = new AdventureStore(path.resolve('out/language-test'), files);
    const old = legacy(phase), bytes = JSON.stringify(old);
    files.documents.set(store.activePath, bytes);
    const loaded = await store.load();
    assert.deepEqual(loaded, { ...old, language: 'en' });
    assert.equal(files.documents.get(store.activePath), bytes);
    await store.saveIfUnchanged(old, { ...loaded, updatedAt: 'later' });
    assert.deepEqual((await store.load()).phase, phase);
    assert.deepEqual((await store.load()).segments, old.segments);
    assert.equal(JSON.parse(files.documents.get(store.activePath)).language, 'en');
    files.documents.set(store.activePath, '{broken');
    assert.deepEqual(await store.load(), loaded);
  });
}
test('explicit language validation and Portuguese round-trip', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/language-test'), files);
  const adventure = { ...legacy({ kind: 'ready' }), language: 'pt-BR' };
  assert.equal(validateCharacterSetup(adventure).value.language, 'pt-BR');
  for (const language of ['pt', 'fr', null, undefined]) {
    assert.equal(validateCharacterSetup({ ...adventure, language }).valid, false);
    await assert.rejects(store.save({ ...adventure, language }));
  }
  await store.save(adventure);
  assert.deepEqual(await store.load(), adventure);
  files.documents.set(store.activePath, JSON.stringify({ ...adventure, language: 'fr' }));
  await assert.rejects(store.load(), /No valid adventure/);
});
