const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { NewStoryController } = require('../dist/main/new-story.js');

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-new-story-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-new-story-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function adventure(id, narrative = 'The road reaches the gate.') {
  return {
    schemaVersion: 1,
    id,
    theme: 'High Fantasy',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: 'A forgotten gate is opening.',
    segments: [{
      id: 'segment-1', chapterNumber: 1, narrative,
      choices: [{ id: 'choice-1', text: 'Inspect the gate.' }],
      selectedChoiceId: null, check: null, createdAt: '2026-11-11T12:00:00.000Z'
    }],
    chapterSummaries: [],
    globalSummary: '',
    phase: { kind: 'ready' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

test('New Story starts creation directly when no adventure is saved', async (t) => {
  const userData = await temporaryUserData(t);
  const controller = new NewStoryController(new AdventureStore(userData));
  assert.deepEqual(await controller.request(), { kind: 'start-creation' });
});

test('No cancels replacement and leaves active and backup bytes unchanged', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  await store.save(adventure('story-1'));
  const current = adventure('story-1', 'The gate opens a little.');
  await store.save(current);
  const activeBytes = await fs.readFile(store.activePath);
  const backupBytes = await fs.readFile(store.backupPath);

  const controller = new NewStoryController(store);
  const request = await controller.request();
  assert.equal(request.kind, 'confirmation-required');
  assert.equal(request.adventureId, 'story-1');
  assert.deepEqual(await controller.resolve(request.confirmationId, 'No'), {
    kind: 'continue-adventure', adventure: current
  });
  assert.deepEqual(await fs.readFile(store.activePath), activeBytes);
  assert.deepEqual(await fs.readFile(store.backupPath), backupBytes);
  assert.deepEqual(await new AdventureStore(userData).load(), current);
  await assert.rejects(controller.resolve(request.confirmationId, 'Yes'), /No matching/);
});

test('Yes discards the saved story and its backup before a new story is saved', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  await store.save(adventure('old-story'));
  await store.save(adventure('old-story', 'The gate opens.'));
  const controller = new NewStoryController(store);
  const request = await controller.request();
  assert.equal((await store.load()).id, 'old-story');

  assert.deepEqual(await controller.resolve(request.confirmationId, 'Yes'), { kind: 'start-creation' });
  assert.equal(await new AdventureStore(userData).load(), null);
  assert.deepEqual(await new NewStoryController(new AdventureStore(userData)).request(), { kind: 'start-creation' });
  await assert.rejects(fs.readFile(store.backupPath), { code: 'ENOENT' });

  const replacement = adventure('new-story');
  await new AdventureStore(userData).save(replacement);
  assert.deepEqual(await new AdventureStore(userData).load(), replacement);
  await assert.rejects(fs.readFile(store.backupPath), { code: 'ENOENT' });
});

test('stale or invalid confirmations cannot discard a changed adventure', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  await store.save(adventure('first'));
  const controller = new NewStoryController(store);
  const request = await controller.request();
  await assert.rejects(controller.resolve('wrong-token', 'Yes'), /No matching/);
  await assert.rejects(controller.resolve(request.confirmationId, 'Maybe'), /Choose Yes or No/);

  const second = adventure('second');
  await store.save(second);
  await assert.rejects(controller.resolve(request.confirmationId, 'Yes'), /saved adventure changed/);
  assert.deepEqual(await new AdventureStore(userData).load(), second);
});

test('failed discard write preserves the original saved adventure', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const original = adventure('original');
  await store.save(original);
  const failingFiles = {
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    unlink: fs.unlink,
    rename: async (from, to) => {
      if (to === store.activePath) throw new Error('simulated replacement failure');
      await fs.rename(from, to);
    }
  };
  const controller = new NewStoryController(new AdventureStore(userData, failingFiles));
  const request = await controller.request();
  await assert.rejects(controller.resolve(request.confirmationId, 'Yes'), /simulated replacement failure/);
  assert.deepEqual(await new AdventureStore(userData).load(), original);
});

test('discard marker blocks old-backup recovery if cleanup is interrupted', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  await store.save(adventure('old'));
  await store.save(adventure('old', 'A second scene.'));
  const interruptedFiles = {
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    unlink: async () => { throw new Error('simulated backup cleanup failure'); }
  };
  const controller = new NewStoryController(new AdventureStore(userData, interruptedFiles));
  const request = await controller.request();
  assert.deepEqual(await controller.resolve(request.confirmationId, 'Yes'), { kind: 'start-creation' });
  assert.equal(await new AdventureStore(userData).load(), null);
  assert.equal(JSON.parse(await fs.readFile(store.backupPath, 'utf8')).id, 'old');

  const replacement = adventure('new');
  await new AdventureStore(userData).save(replacement);
  assert.deepEqual(await new AdventureStore(userData).load(), replacement);
  await assert.rejects(fs.readFile(store.backupPath), { code: 'ENOENT' });
});
