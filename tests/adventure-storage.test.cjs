const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-storage-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-storage-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function adventure(id) {
  return {
    schemaVersion: 1,
    id,
    theme: 'High Fantasy',
    character: {
      name: 'Mira',
      gender: 'Woman',
      nature: 'Good',
      allocationMethod: 'Balanced',
      attributes: {
        Strength: 1,
        Dexterity: 1,
        Intelligence: 2,
        Endurance: 1,
        Charisma: -1,
        Luck: -1
      }
    },
    premise: 'The gate is opening.',
    segments: [{
      id: 'segment-1',
      chapterNumber: 1,
      narrative: 'The road reaches the gate.',
      choices: [{ id: 'choice-1', text: 'Inspect the gate.' }],
      selectedChoiceId: null,
      check: null,
      createdAt: '2026-11-11T12:00:00.000Z'
    }],
    chapterSummaries: [],
    globalSummary: '',
    phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

test('saves and loads one versioned adventure from userData', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  assert.equal(await store.load(), null);

  const first = adventure('first');
  await store.save(first);
  assert.deepEqual(await new AdventureStore(userData).load(), first);
  assert.equal(JSON.parse(await fs.readFile(store.activePath, 'utf8')).schemaVersion, 1);

  const second = { ...adventure('second'), globalSummary: 'The gate has opened.' };
  await store.save(second);
  assert.deepEqual(await new AdventureStore(userData).load(), second);
  assert.deepEqual(JSON.parse(await fs.readFile(store.backupPath, 'utf8')), first);
});

test('loads the last-known-good backup when active data is corrupt or unsupported', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const first = adventure('first');
  await store.save(first);
  await store.save(adventure('second'));

  await fs.writeFile(store.activePath, '{corrupted json', 'utf8');
  assert.deepEqual(await new AdventureStore(userData).load(), first);

  await fs.writeFile(store.activePath, JSON.stringify({ ...adventure('unsupported'), schemaVersion: 2 }), 'utf8');
  assert.deepEqual(await new AdventureStore(userData).load(), first);

  await fs.writeFile(store.backupPath, JSON.stringify({ schemaVersion: 1 }), 'utf8');
  await assert.rejects(new AdventureStore(userData).load(), /No valid adventure save/);
});

test('failed temporary writes do not replace the active adventure', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const first = adventure('first');
  await store.save(first);

  const failingFiles = {
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    rename: fs.rename,
    writeFile: async (filePath, data, encoding) => {
      if (filePath === `${store.activePath}.tmp`) throw new Error('simulated disk failure');
      await fs.writeFile(filePath, data, encoding);
    }
  };
  await assert.rejects(new AdventureStore(userData, failingFiles).save(adventure('second')), /simulated disk failure/);
  assert.deepEqual(await new AdventureStore(userData).load(), first);
});

test('failed replacement leaves the prior save available and a later retry succeeds', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const first = adventure('first');
  const second = adventure('second');
  await store.save(first);

  const failingFiles = {
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: async (from, to) => {
      if (to === store.activePath) throw new Error('simulated rename failure');
      await fs.rename(from, to);
    }
  };
  await assert.rejects(new AdventureStore(userData, failingFiles).save(second), /simulated rename failure/);
  assert.deepEqual(await new AdventureStore(userData).load(), first);

  await store.save(second);
  assert.deepEqual(await new AdventureStore(userData).load(), second);
});

test('invalid documents and failed serialization never replace a valid save', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const first = adventure('first');
  await store.save(first);

  await assert.rejects(store.save({ ...adventure('wrong-version'), schemaVersion: 2 }), /save schema version 1/);
  const circular = adventure('circular');
  circular.self = circular;
  await assert.rejects(store.save(circular), /circular/i);
  assert.deepEqual(await new AdventureStore(userData).load(), first);
});
