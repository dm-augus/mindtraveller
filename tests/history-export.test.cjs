const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { HistoryExporter, AdventureOperationGate } = require('../dist/main/history-export.js');
function fixture() {
  return { language: 'pt-BR', theme: 'Horror', character: { name: 'João:/?*', gender: 'Man', nature: 'Good', allocationMethod: 'Simplified',
    attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 } },
    premise: 'Maldição.', segments: [{ chapterNumber: 1, narrative: 'Ação e coração.', choices: [{ id: 'a', text: 'Investigar.' }], selectedChoiceId: null, check: null }], phase: { kind: 'ready' } };
}
function harness() {
  const directory = path.resolve('out/export-profile/mindtraveller'), destination = path.resolve('out/exported-history.md');
  const original = new Map(['adventure.json', 'adventure.last-good.json', 'provider-settings.json', 'preferences.json', 'openai-key.bin']
    .map((file) => [path.join(directory, file), `original ${file}`]));
  const written = new Map(original), adventure = fixture(), gate = new AdventureOperationGate();
  const store = { directory, load: async () => adventure };
  const files = { realpath: async (file) => path.resolve(file), writeFile: async (file, text, encoding) => {
    assert.equal(encoding, 'utf8'); written.set(file, text);
  } };
  const exporter = (dialog = async () => ({ canceled: false, filePath: destination }), pending = () => false, io = files) =>
    new HistoryExporter(store, gate, dialog, pending, io);
  return { directory, destination, original, written, adventure, gate, store, files, exporter };
}
test('export writes a detached UTF-8 snapshot with a safe Markdown filename and no application writes', async () => {
  const h = harness();
  const result = await h.exporter(async (options) => {
    assert.match(options.defaultPath, /^Mindtraveller-João-+\d{4}-\d{2}-\d{2}\.md$/);
    assert.deepEqual(options.filters[0].extensions, ['md']);
    assert.ok(options.properties.includes('showOverwriteConfirmation'));
    h.adventure.segments[0].narrative = 'Changed while choosing';
    return { canceled: false, filePath: h.destination };
  }).export();
  assert.deepEqual(result, { kind: 'saved', filePath: h.destination });
  assert.match(h.written.get(h.destination), /Ação e coração/);
  assert.doesNotMatch(h.written.get(h.destination), /Changed while choosing/);
  for (const [file, bytes] of h.original) assert.equal(h.written.get(file), bytes);
});
test('cancellation writes nothing and permits another export', async () => {
  const h = harness();
  assert.deepEqual(await h.exporter(async () => ({ canceled: true })).export(), { kind: 'cancelled' });
  assert.deepEqual(h.written, h.original);
  assert.equal((await h.exporter().export()).kind, 'saved');
});
test('write failure reports failure, preserves application data, and releases the operation guard', async () => {
  const h = harness();
  await assert.rejects(h.exporter(undefined, undefined, { ...h.files, writeFile: async () => { throw new Error('disk'); } }).export(), /Unable to write exported history/);
  assert.deepEqual(h.written, h.original);
  assert.equal((await h.exporter().export()).kind, 'saved');
});
test('no history, replacement confirmation, and active operations never open the save dialog', async () => {
  const h = harness(), dialog = async () => { throw new Error('Dialog must not open'); };
  await assert.rejects(h.exporter(dialog, () => true).export(), /confirmation/);
  const segments = h.adventure.segments; h.adventure.segments = [];
  await assert.rejects(h.exporter(dialog).export(), /No saved story/);
  h.adventure.segments = segments;
  let release;
  const pending = h.gate.run(() => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(h.exporter(dialog).export(), /already active/);
  release(); await pending;
});
test('export reserves the adventure across the dialog and write, including duplicate export and replacement', async () => {
  const h = harness(); let release;
  const pending = h.exporter(() => new Promise((resolve) => { release = resolve; })).export();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(h.exporter().export(), /already active/);
  await assert.rejects(h.gate.run(async () => 'replace'), /already active/);
  release({ canceled: false, filePath: h.destination }); await pending;
});
test('protected application paths and links into them cannot be overwritten', async () => {
  const h = harness();
  for (const file of [...h.original.keys(), path.join(h.directory, 'adventure.json.tmp')]) {
    await assert.rejects(h.exporter(async () => ({ canceled: false, filePath: file })).export(), /outside the application data/);
  }
  const linked = path.resolve('out/linked.md');
  await assert.rejects(h.exporter(async () => ({ canceled: false, filePath: linked }), undefined,
    { ...h.files, realpath: async (file) => file === linked ? path.join(h.directory, 'adventure.json') : path.resolve(file) }).export(), /outside the application data/);
  assert.deepEqual(h.written, h.original);
});
