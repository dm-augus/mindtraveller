const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { StoryPreferencesStore } = require('../dist/main/story-preferences.js');
const preferences = defaultStoryLanguage => ({ defaultStoryLanguage, interfaceLanguage: 'en', autoReadStory: true });
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
  assert.deepEqual(await store.get(), preferences('en'));
  await Promise.all([store.save({ defaultStoryLanguage: 'en' }), store.save({ defaultStoryLanguage: 'pt-BR' })]);
  assert.deepEqual(await new StoryPreferencesStore(base, io).get(), preferences('pt-BR'));
  assert.deepEqual(JSON.parse(io.data.get(store.preferencesPath)), { schemaVersion: 1, ...preferences('pt-BR') });
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
    assert.deepEqual(await failing.get(), preferences('en'));
    await store.save({ defaultStoryLanguage: 'pt-BR' });
    assert.deepEqual(await failing.get(), preferences('pt-BR'));
  }
});

test('legacy preferences normalize without rewriting and concurrent patches preserve independent values', async () => {
  const io = files(), base = path.resolve('out/preferences-test'), store = new StoryPreferencesStore(base, io);
  const legacy = JSON.stringify({ schemaVersion: 1, defaultStoryLanguage: 'pt-BR' });
  io.data.set(store.preferencesPath, legacy);
  assert.deepEqual(await store.get(), preferences('pt-BR'));
  assert.equal(io.data.get(store.preferencesPath), legacy);
  await Promise.all([store.save({ interfaceLanguage: 'pt-BR' }), store.save({ autoReadStory: false }),
    store.save({ defaultStoryLanguage: 'en' })]);
  assert.deepEqual(await new StoryPreferencesStore(base, io).get(), {
    defaultStoryLanguage: 'en', interfaceLanguage: 'pt-BR', autoReadStory: false
  });
  for (const patch of [{ interfaceLanguage: 'pt' }, { interfaceLanguage: undefined }, { autoReadStory: 1 },
    { autoReadStory: undefined }, { defaultStoryLanguage: undefined }, { extra: true }]) {
    const before = io.data.get(store.preferencesPath);
    await assert.rejects(store.save(patch), TypeError);
    assert.equal(io.data.get(store.preferencesPath), before);
    io.data.set(store.preferencesPath, JSON.stringify({ schemaVersion: 1, ...preferences('en'), ...patch }));
    if (!Object.values(patch).includes(undefined)) await assert.rejects(store.get(), /invalid or unsupported/);
    io.data.set(store.preferencesPath, before);
  }
});
