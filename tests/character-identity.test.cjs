const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { AVATARS, avatarForGender, isAvatarId } = require('../dist/shared/avatars.js');
const { validateCharacterSetup } = require('../dist/shared/character-rules.js');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { StoryContextBuilder } = require('../dist/main/story-context.js');
const { StorySummarizer } = require('../dist/main/story-summarizer.js');

function memoryFiles() {
  const documents = new Map();
  return { documents, mkdir: async () => undefined,
    readFile: async file => {
      if (!documents.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return documents.get(file);
    }, writeFile: async (file, text) => { documents.set(file, text); },
    rename: async (from, to) => { documents.set(to, documents.get(from)); documents.delete(from); },
    unlink: async file => { documents.delete(file); } };
}
const character = { name: 'Mira', gender: 'Female', avatarId: 'set_01_female_mage', nature: 'Good',
  allocationMethod: 'Simplified', attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 } };
const setup = { theme: 'High Fantasy', language: 'pt-BR', character };
const choice = { turnId: 'turn', choiceId: 'enter', choiceText: 'Enter.' };
const check = { difficulty: 'Hard', attribute: 'Strength', attributeValue: 3, baseThreshold: 20, threshold: 50, roll: 30, outcome: 'success' };
function legacy(phase) {
  const { avatarId, ...oldCharacter } = character;
  return { schemaVersion: 1, language: 'pt-BR', id: 'legacy', theme: 'High Fantasy',
    character: { ...oldCharacter, gender: '  A traveller of unknown gender  ' },
    premise: phase.kind === 'pending-opening' ? null : 'Find the bell.',
    mainObjective: phase.kind === 'pending-opening' ? null : 'Find the bell.',
    storyState: phase.kind === 'pending-opening' ? null : { location: 'Abbey', situation: 'Outside the gate.', currentFocus: null },
    segments: phase.kind === 'pending-opening' ? [] : [{ id: 'scene', chapterNumber: 1, narrative: 'A gate.',
      choices: [{ id: 'enter', text: 'Enter.' }], selectedChoiceId: ['pending-assessment', 'pending-narration'].includes(phase.kind) ? 'enter' : null,
      check: null, createdAt: '2026-11-15' }], chapterSummaries: [], globalSummary: '', phase, updatedAt: '2026-11-15' };
}

test('catalog covers the twelve bundled portraits, six per gender, and preserves roles across gender changes', () => {
  assert.equal(AVATARS.length, 12);
  assert.equal(new Set(AVATARS.map(avatar => avatar.id)).size, 12);
  for (const gender of ['Male', 'Female']) {
    assert.equal(AVATARS.filter(avatar => avatar.gender === gender).length, 6);
    assert.match(avatarForGender(gender, null), /_warrior$/);
  }
  for (const avatar of AVATARS) {
    assert.ok(fs.existsSync(path.join(__dirname, '../src/assets/faces', `${avatar.id}.png`)));
    const other = AVATARS.find(item => item.id === avatarForGender(avatar.gender === 'Male' ? 'Female' : 'Male', avatar.id));
    assert.equal(other.role, avatar.role);
  }
  for (const value of ['../faces/set_01_male_mage.png', 'file:///portrait.png', 'https://example.test/portrait', null, 'set_01_male_mage.png']) assert.equal(isAvatarId(value), false);
});

test('all portrait roles produce identical narrative requests and summary context for the same identity', async () => {
  for (const gender of ['Male', 'Female']) {
    const builder = new StoryContextBuilder(), contexts = [];
    for (const avatar of AVATARS.filter(item => item.gender === gender)) {
      const saved = { ...legacy({ kind: 'ready' }), character: { ...character, gender, avatarId: avatar.id } };
      const before = structuredClone(saved);
      const opening = builder.openingRequest('fixture', saved);
      const continuation = builder.build(saved);
      const summaries = [];
      await new StorySummarizer({ chapterLength: 1 }).update(saved, { summarize: async request => {
        summaries.push(request.context);
        return { text: 'Reached the gate.', keyFacts: [], unresolvedThreads: [] };
      } }, 'fixture');
      const requests = { opening, continuation, summaries };
      assert.doesNotMatch(JSON.stringify(requests), /avatarId|set_01_|\.png/);
      assert.deepEqual(saved, before);
      contexts.push(requests);
    }
    for (const context of contexts) assert.deepEqual(context, contexts[0]);
  }
});

test('new characters require canonical gender and matching whitelisted portraits before generation or saves', async () => {
  for (const avatar of AVATARS) assert.equal(validateCharacterSetup({ ...setup, character: { ...character, gender: avatar.gender, avatarId: avatar.id } }).valid, true);
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/avatar-rejection'), files);
  let calls = 0;
  const controller = new StoryController(store, async () => { calls++; throw new Error('unexpected provider'); });
  for (const patch of [{ gender: 'Woman' }, { gender: 'male' }, { gender: '' }, { gender: null },
    { avatarId: null }, { avatarId: undefined }, { avatarId: '../portrait.png' }, { avatarId: 'http://example.test/image.png' },
    { avatarId: 'set_01_male_mage' }, { avatarId: 'missing' }]) {
    const input = { ...setup, character: { ...character, ...patch } };
    assert.equal(validateCharacterSetup(input).valid, false);
    await assert.rejects(controller.startOpening(input), TypeError);
    assert.equal(files.documents.size, 0);
  }
  assert.equal(calls, 0);
});

for (const phase of [{ kind: 'ready' }, { kind: 'pending-opening', turnId: 'turn' },
  { kind: 'pending-assessment', choice }, { kind: 'pending-narration', choice, check },
  { kind: 'pending-summary', turnId: 'turn', chapterNumber: 1 }]) {
  test(`legacy avatar migration preserves ${phase.kind}, arbitrary gender, bytes, and backup`, async () => {
    const files = memoryFiles(), store = new AdventureStore(path.resolve('out/avatar-migration'), files);
    const old = legacy(phase), bytes = JSON.stringify(old);
    files.documents.set(store.activePath, bytes);
    const normalized = { ...old, character: { ...old.character, avatarId: null } };
    assert.deepEqual(await store.load(), normalized);
    assert.equal(files.documents.get(store.activePath), bytes);
    await store.saveIfUnchanged(old, { ...normalized, updatedAt: 'later' });
    assert.deepEqual((await store.load()).phase, phase);
    files.documents.set(store.activePath, '{broken');
    assert.deepEqual(await store.load(), normalized);
    assert.equal(files.documents.get(store.backupPath), bytes);
  });
}

test('portrait IDs round-trip with saved identity while explicit invalid IDs are rejected', async () => {
  const files = memoryFiles(), store = new AdventureStore(path.resolve('out/avatar-save'), files);
  const saved = { ...legacy({ kind: 'ready' }), character };
  for (const avatarId of ['', 'unknown', '../portrait.png', undefined, 7]) {
    await assert.rejects(store.save({ ...saved, character: { ...character, avatarId } }), /save schema/);
  }
  await store.save(saved);
  assert.deepEqual(await new AdventureStore(path.resolve('out/avatar-save'), files).load(), saved);
  files.documents.set(store.activePath, JSON.stringify({ ...saved, character: { ...character, avatarId: 'unknown' } }));
  await assert.rejects(store.load(), /No valid adventure/);
});
