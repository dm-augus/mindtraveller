const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');

function memoryFiles() {
  const documents = new Map();
  return { documents, mkdir: async () => undefined,
    readFile: async (file) => {
      if (!documents.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return documents.get(file);
    },
    writeFile: async (file, text) => { documents.set(file, text); },
    rename: async (from, to) => { documents.set(to, documents.get(from)); documents.delete(from); },
    unlink: async (file) => { documents.delete(file); } };
}
const choice = { turnId: 'turn', choiceId: 'enter', choiceText: 'Enter.' };
const check = { difficulty: 'Medium', attribute: 'Dexterity', attributeValue: 3,
  baseThreshold: 50, threshold: 80, roll: 30, outcome: 'success' };
function legacy(phase) {
  return { schemaVersion: 1, language: 'pt-BR', id: 'richter', theme: 'High Fantasy', character: {
    name: 'Richter', gender: 'male', nature: 'Neutral', allocationMethod: 'Simplified',
    attributes: { Strength: 0, Dexterity: 3, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
  }, premise: phase.kind === 'pending-opening' ? null : 'Encontrar a origem da doença e uma cura.',
  segments: phase.kind === 'pending-opening' ? [] : [{ id: 'scene', chapterNumber: 1,
    narrative: 'Richter está na janela de Thoric.', choices: [{ id: 'enter', text: 'Enter.' }],
    selectedChoiceId: ['pending-assessment', 'pending-narration'].includes(phase.kind) ? 'enter' : null,
    check: null, createdAt: '2026-11-14' }],
  chapterSummaries: [], globalSummary: '', phase, updatedAt: '2026-11-14' };
}
for (const phase of [{ kind: 'ready' }, { kind: 'pending-opening', turnId: 'turn' },
  { kind: 'pending-assessment', choice }, { kind: 'pending-narration', choice, check },
  { kind: 'pending-summary', turnId: 'turn', chapterNumber: 1 }]) {
  test(`memory migration preserves ${phase.kind}, source bytes, and legacy backup`, async () => {
    const files = memoryFiles(), store = new AdventureStore(path.resolve('out/memory-test'), files);
    const old = legacy(phase), bytes = JSON.stringify(old);
    files.documents.set(store.activePath, bytes);
    const loaded = await store.load();
    assert.equal(loaded.mainObjective, old.premise);
    assert.deepEqual(loaded.storyState, old.segments.length
      ? { location: null, situation: old.segments.at(-1).narrative, currentFocus: null } : null);
    assert.deepEqual(loaded.phase, old.phase);
    assert.deepEqual(loaded.segments, old.segments);
    assert.equal(files.documents.get(store.activePath), bytes);
    await store.saveIfUnchanged(old, { ...loaded, updatedAt: 'later' });
    assert.deepEqual((await store.load()).phase, phase);
    files.documents.set(store.activePath, '{broken');
    assert.deepEqual(await store.load(), loaded);
    assert.equal(files.documents.get(store.backupPath), bytes);
  });
}

test('explicit malformed objective/state is rejected and valid memory round-trips', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/memory-test'), files);
  const saved = { ...legacy({ kind: 'ready' }), mainObjective: 'Find the cure.',
    storyState: { location: 'Thoric’s house', situation: 'Outside the window.', currentFocus: 'Find Thoric.' } };
  for (const patch of [{ mainObjective: 12 }, { mainObjective: '' }, { mainObjective: null }, { storyState: null }, { storyState: {} },
    { storyState: { location: null, situation: '', currentFocus: null } },
    { storyState: { ...saved.storyState, invented: true } }]) {
    await assert.rejects(store.save({ ...saved, ...patch }), /save schema/);
    files.documents.set(store.activePath, JSON.stringify({ ...saved, ...patch }));
    await assert.rejects(store.load(), /No valid adventure/);
  }
  await store.save(saved);
  assert.deepEqual(await store.load(), { ...saved, character: { ...saved.character, avatarId: null } });
  await assert.rejects(store.save({ ...saved, mainObjective: undefined }), /save schema/);
  await assert.rejects(store.save({ ...saved, storyState: undefined }), /save schema/);
});
