const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { StoryPreferencesStore } = require('../dist/main/story-preferences.js');
function files() {
  const data = new Map();
  return { data, mkdir: async () => undefined,
    readFile: async (p) => { if (!data.has(p)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return data.get(p); },
    writeFile: async (p, text) => { data.set(p, text); },
    rename: async (from, to) => { data.set(to, data.get(from)); data.delete(from); } };
}
test('preferences default to English and queued selections persist separately across restart', async () => {
  const io = files(), base = path.resolve('out/preferences-test'), store = new StoryPreferencesStore(base, io);
  const adventure = path.join(base, 'mindtraveller/adventure.json'), provider = path.join(base, 'mindtraveller/provider-settings.json');
  io.data.set(adventure, 'original adventure'); io.data.set(provider, 'original provider');
  assert.deepEqual(await store.get(), { defaultStoryLanguage: 'en' });
  await Promise.all([store.save({ defaultStoryLanguage: 'en' }), store.save({ defaultStoryLanguage: 'pt-BR' })]);
  assert.deepEqual(await new StoryPreferencesStore(base, io).get(), { defaultStoryLanguage: 'pt-BR' });
  assert.deepEqual(JSON.parse(io.data.get(store.preferencesPath)), { schemaVersion: 1, defaultStoryLanguage: 'pt-BR' });
  assert.equal(io.data.get(adventure), 'original adventure'); assert.equal(io.data.get(provider), 'original provider');
});
test('invalid preference input and stored documents are rejected without writes', async () => {
  const io = files(), store = new StoryPreferencesStore(path.resolve('out/preferences-test'), io);
  for (const input of [null, [], {}, { defaultStoryLanguage: 'pt' }, { defaultStoryLanguage: 'en', extra: true }]) {
    await assert.rejects(store.save(input), TypeError);
  }
  assert.equal(io.data.size, 0);
  for (const document of ['{bad', '{}', '{"schemaVersion":2,"defaultStoryLanguage":"en"}',
    '{"schemaVersion":1,"defaultStoryLanguage":"fr"}']) {
    io.data.set(store.preferencesPath, document);
    await assert.rejects(store.get(), /invalid or unsupported/);
  }
});
test('failed temporary writes or replacement preserve prior preferences and allow recovery', async () => {
  for (const operation of ['writeFile', 'rename']) {
    const io = files(), base = path.resolve('out/preferences-test'), store = new StoryPreferencesStore(base, io);
    await store.save({ defaultStoryLanguage: 'en' });
    const failing = new StoryPreferencesStore(base, { ...io, [operation]: async () => { throw new Error('disk'); } });
    await assert.rejects(failing.save({ defaultStoryLanguage: 'pt-BR' }), /Unable to save/);
    assert.deepEqual(await failing.get(), { defaultStoryLanguage: 'en' });
    await store.save({ defaultStoryLanguage: 'pt-BR' });
    assert.deepEqual(await failing.get(), { defaultStoryLanguage: 'pt-BR' });
  }
});
