const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { AdventureProgress } = require('../dist/main/adventure-progress.js');

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-progress-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-progress-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function adventure() {
  return {
    schemaVersion: 1,
    id: 'adventure-1',
    theme: 'Horror',
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
    premise: 'A bell sounds under the ruined abbey.',
    segments: [{
      id: 'segment-1',
      chapterNumber: 1,
      narrative: 'The road leads to the abbey.',
      choices: [
        { id: 'choice-1', text: 'Open the gate.' },
        { id: 'choice-2', text: 'Wait for dawn.' }
      ],
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

function nextSegment(check = null) {
  return {
    id: 'segment-2',
    chapterNumber: 1,
    narrative: 'The gate creaks open.',
    choices: [{ id: 'choice-3', text: 'Enter the courtyard.' }],
    selectedChoiceId: null,
    check,
    createdAt: '2026-11-11T12:01:00.000Z'
  };
}

test('opening and summary pending states survive restart with stable identifiers', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  const opening = { ...adventure(), segments: [], premise: null,
    phase: { kind: 'pending-opening', turnId: 'opening-1' } };
  await store.save(opening);
  assert.deepEqual(await new AdventureProgress(new AdventureStore(userData)).restore(), opening);

  const summary = { ...adventure(), phase: { kind: 'pending-summary', turnId: 'summary-1', chapterNumber: 1 } };
  await store.save(summary);
  assert.deepEqual(await new AdventureProgress(new AdventureStore(userData)).restore(), summary);
});

test('selected choice is saved before assessment and duplicate selection reuses it', async (t) => {
  const userData = await temporaryUserData(t);
  await new AdventureStore(userData).save(adventure());
  const progress = new AdventureProgress(new AdventureStore(userData));
  const [first, simultaneous] = await Promise.all([
    progress.selectChoice('choice-1'),
    progress.selectChoice('choice-1')
  ]);
  assert.deepEqual(simultaneous, first);
  assert.ok(first.turnId);
  assert.deepEqual(first, { turnId: first.turnId, choiceId: 'choice-1', choiceText: 'Open the gate.' });

  const restarted = new AdventureProgress(new AdventureStore(userData));
  const saved = await restarted.restore();
  assert.equal(saved.phase.kind, 'pending-assessment');
  assert.deepEqual(saved.phase.choice, first);
  assert.equal(saved.segments.length, 1);
  assert.equal(saved.segments[0].selectedChoiceId, 'choice-1');
  assert.deepEqual(await restarted.selectChoice('choice-1'), first);
  await assert.rejects(restarted.selectChoice('choice-2'), /already pending/);
  assert.equal((await restarted.restore()).segments.length, 1);
});

test('saved D100 result survives restart and is never rolled again for that turn', async (t) => {
  const userData = await temporaryUserData(t);
  await new AdventureStore(userData).save(adventure());
  const progress = new AdventureProgress(new AdventureStore(userData));
  const pending = await progress.selectChoice('choice-1');

  let rolls = 0;
  t.mock.method(crypto, 'randomInt', (min, max) => {
    assert.deepEqual([min, max], [1, 101]);
    rolls += 1;
    return 25;
  });
  const check = await progress.recordCheck(pending.turnId, 'Hard', 'Strength');
  assert.equal(rolls, 1);
  assert.equal(check.roll, 25);
  assert.equal(check.outcome, 'success');

  const restarted = new AdventureProgress(new AdventureStore(userData));
  const saved = await restarted.restore();
  assert.equal(saved.phase.kind, 'pending-narration');
  assert.deepEqual(saved.phase.choice, pending);
  assert.deepEqual(saved.phase.check, check);
  assert.deepEqual(await restarted.recordCheck(pending.turnId, 'Very Hard', 'Luck'), check);
  assert.equal(rolls, 1);
  await assert.rejects(restarted.recordCheck('wrong-turn', 'Hard', 'Strength'), /Unknown pending turn/);
});

test('checked turn commits the saved roll once and restores as ready', async (t) => {
  const userData = await temporaryUserData(t);
  await new AdventureStore(userData).save(adventure());
  const progress = new AdventureProgress(new AdventureStore(userData));
  const pending = await progress.selectChoice('choice-1');
  const check = await progress.recordCheck(pending.turnId, 'Hard', 'Strength');

  const restarted = new AdventureProgress(new AdventureStore(userData));
  await assert.rejects(
    restarted.commitTurn(pending.turnId, nextSegment({ ...check, roll: check.roll === 1 ? 2 : 1 })),
    /saved check result/
  );
  assert.equal((await restarted.restore()).phase.kind, 'pending-narration');

  await restarted.commitTurn(pending.turnId, nextSegment(check));
  const completed = await new AdventureProgress(new AdventureStore(userData)).restore();
  assert.equal(completed.phase.kind, 'ready');
  assert.equal(completed.segments.length, 2);
  assert.equal(completed.segments[0].selectedChoiceId, 'choice-1');
  assert.deepEqual(completed.segments[1].check, check);
  await assert.rejects(restarted.commitTurn(pending.turnId, nextSegment(check)), /No matching turn/);
  assert.equal((await restarted.restore()).segments.length, 2);
});

test('no-check turn commits and restores without a roll or duplicate choice', async (t) => {
  const userData = await temporaryUserData(t);
  await new AdventureStore(userData).save(adventure());
  const pending = await new AdventureProgress(new AdventureStore(userData)).selectChoice('choice-2');
  const restarted = new AdventureProgress(new AdventureStore(userData));
  const completed = await restarted.commitTurn(pending.turnId, nextSegment());
  assert.equal(completed.segments.length, 2);
  assert.equal(completed.segments[0].selectedChoiceId, 'choice-2');
  assert.equal(completed.segments[1].check, null);
  assert.deepEqual(await new AdventureProgress(new AdventureStore(userData)).restore(), completed);
  await assert.rejects(restarted.selectChoice('choice-2'), /Unknown story choice/);
});

test('save failures leave the prior turn state intact', async (t) => {
  const userData = await temporaryUserData(t);
  const store = new AdventureStore(userData);
  await store.save(adventure());
  const failingFiles = {
    mkdir: fs.mkdir,
    readFile: fs.readFile,
    rename: fs.rename,
    writeFile: async (filePath, data, encoding) => {
      if (filePath === `${store.activePath}.tmp`) throw new Error('save unavailable');
      await fs.writeFile(filePath, data, encoding);
    }
  };
  const failing = new AdventureProgress(new AdventureStore(userData, failingFiles));
  await assert.rejects(failing.selectChoice('choice-1'), /save unavailable/);
  const unchanged = await new AdventureProgress(new AdventureStore(userData)).restore();
  assert.equal(unchanged.phase.kind, 'ready');
  assert.equal(unchanged.segments[0].selectedChoiceId, null);

  const pending = await new AdventureProgress(store).selectChoice('choice-1');
  await assert.rejects(failing.recordCheck(pending.turnId, 'Hard', 'Strength'), /save unavailable/);
  const recovered = await new AdventureProgress(new AdventureStore(userData)).restore();
  assert.equal(recovered.phase.kind, 'pending-assessment');
  assert.deepEqual(recovered.phase.choice, pending);
  assert.equal(recovered.segments.length, 1);
});
