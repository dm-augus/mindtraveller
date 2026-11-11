const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { ProviderSettingsStore } = require('../dist/main/provider-settings.js');

async function temporaryUserData(t) {
  const base = path.resolve(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(base, 'mindtraveller-settings-'));
  t.after(async () => {
    if (path.dirname(directory) !== base || !path.basename(directory).startsWith('mindtraveller-settings-')) {
      throw new Error('Refusing to remove a directory outside this test fixture.');
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function protector() {
  const vault = new Map();
  let nextId = 0;
  return {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (plainText) => {
      const encrypted = Buffer.from(`opaque-ciphertext-${++nextId}`);
      vault.set(encrypted.toString('hex'), plainText);
      return encrypted;
    },
    decryptStringAsync: async (encrypted) => {
      const result = vault.get(encrypted.toString('hex'));
      if (result === undefined) throw new Error('Cannot decrypt test ciphertext.');
      return { result, shouldReEncrypt: false };
    }
  };
}

function configuration() {
  return {
    activeProvider: 'openai',
    ollama: { serverAddress: 'http://127.0.0.1:11434', modelId: 'local-story' },
    openai: { modelId: 'story-model' }
  };
}

function adventure() {
  return {
    schemaVersion: 1,
    id: 'adventure-1',
    theme: 'Horror',
    character: {
      name: 'Mira', gender: 'Woman', nature: 'Good', allocationMethod: 'Balanced',
      attributes: { Strength: 1, Dexterity: 1, Intelligence: 2, Endurance: 1, Charisma: -1, Luck: -1 }
    },
    premise: null,
    segments: [],
    chapterSummaries: [],
    globalSummary: '',
    phase: { kind: 'pending-opening', turnId: 'opening-1' },
    updatedAt: '2026-11-11T12:00:00.000Z'
  };
}

test('provider settings and encrypted key live apart from adventure documents', async (t) => {
  const userData = await temporaryUserData(t);
  const secret = 'sk-test-private-key-123456';
  const crypto = protector();
  const settings = new ProviderSettingsStore(userData, crypto, 'win32');
  const adventureStore = new AdventureStore(userData);

  const input = configuration();
  input.openai.apiKey = secret; // An accidental extra field must not be persisted.
  await settings.saveConfiguration(input);
  assert.deepEqual(await settings.setOpenAiKey(secret, true), { persisted: true });
  await adventureStore.save(adventure());
  await adventureStore.save({ ...adventure(), updatedAt: '2026-11-11T12:01:00.000Z' });

  const publicSettings = await new ProviderSettingsStore(userData, crypto, 'win32').getPublicSettings();
  assert.deepEqual(publicSettings, {
    ...configuration(),
    openai: { modelId: 'story-model', hasSavedKey: true }
  });
  assert.equal(JSON.stringify(publicSettings).includes(secret), false);
  assert.equal(await new ProviderSettingsStore(userData, crypto, 'win32').getOpenAiKeyForRequest(), secret);

  for (const filePath of [
    settings.settingsPath,
    settings.encryptedKeyPath,
    adventureStore.activePath,
    adventureStore.backupPath
  ]) {
    const bytes = await fs.readFile(filePath);
    assert.equal(bytes.includes(Buffer.from(secret)), false, filePath);
  }
  const savedConfiguration = JSON.parse(await fs.readFile(settings.settingsPath, 'utf8'));
  assert.equal(savedConfiguration.schemaVersion, 1);
  assert.equal(Object.hasOwn(savedConfiguration.openai, 'apiKey'), false);
  await assert.rejects(adventureStore.save({ ...adventure(), openaiKey: secret }), /save schema version 1/);
});

test('Settings only reports saved-key status and never returns key material', async (t) => {
  const userData = await temporaryUserData(t);
  const secret = 'sk-test-another-private-key';
  const settings = new ProviderSettingsStore(userData, protector(), 'win32');
  assert.equal((await settings.getPublicSettings()).openai.hasSavedKey, false);
  await settings.setOpenAiKey(secret, true);

  const response = await settings.getPublicSettings();
  assert.equal(response.openai.hasSavedKey, true);
  assert.deepEqual(Object.keys(response.openai).sort(), ['hasSavedKey', 'modelId']);
  assert.equal(JSON.stringify(response).includes(secret), false);
});

test('unavailable secure storage keeps a key in memory for this session only', async (t) => {
  const userData = await temporaryUserData(t);
  const unavailable = {
    isAsyncEncryptionAvailable: async () => false,
    encryptStringAsync: async () => { throw new Error('Must not encrypt.'); },
    decryptStringAsync: async () => { throw new Error('Must not decrypt.'); }
  };
  const settings = new ProviderSettingsStore(userData, unavailable, 'win32');
  const secret = 'sk-session-only';
  assert.deepEqual(await settings.setOpenAiKey(secret, true), { persisted: false });
  assert.equal(await settings.getOpenAiKeyForRequest(), secret);
  assert.equal((await settings.getPublicSettings()).openai.hasSavedKey, false);
  assert.equal(await new ProviderSettingsStore(userData, unavailable, 'win32').getOpenAiKeyForRequest(), null);
  await assert.rejects(fs.readFile(settings.encryptedKeyPath), { code: 'ENOENT' });

  const nonWindows = new ProviderSettingsStore(userData, protector(), 'linux');
  assert.deepEqual(await nonWindows.setOpenAiKey(secret, true), { persisted: false });
});

test('secret-storage failures do not log or expose the key in errors', async (t) => {
  const userData = await temporaryUserData(t);
  const secret = 'sk-do-not-log-this-key';
  const logged = [];
  t.mock.method(console, 'log', (...values) => logged.push(values.join(' ')));
  t.mock.method(console, 'warn', (...values) => logged.push(values.join(' ')));
  t.mock.method(console, 'error', (...values) => logged.push(values.join(' ')));
  const broken = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async () => { throw new Error(`Encryption failed for ${secret}`); },
    decryptStringAsync: async () => { throw new Error(`Decryption failed for ${secret}`); }
  };
  const settings = new ProviderSettingsStore(userData, broken, 'win32');
  await assert.rejects(settings.setOpenAiKey(secret, true), (error) => {
    assert.equal(error.message, 'Unable to save the OpenAI key securely.');
    assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(logged.join('\n').includes(secret), false);
});
