const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { catalogs, translate, errorText, formatMessage } = require('../dist/shared/i18n.js');
const { AppError, AppTypeError, ipcResult } = require('../dist/shared/app-error.js');
const { ProviderError } = require('../dist/shared/provider-error.js');
const { validateCharacterSetup, validateAttributeAllocation } = require('../dist/shared/character-rules.js');
const { localizedRules } = require('../dist/shared/localized-rules.js');
const { RULES_SECTIONS, GAME_RULES_TEXT } = require('../dist/shared/rules-reference.js');
const { ATTRIBUTE_NAMES, ATTRIBUTE_RANGES, DIFFICULTY_BASE_THRESHOLDS } = require('../dist/shared/rules.js');
const { localizedHistoryDialogOptions } = require('../dist/main/history-export.js');

test('English and PT-BR catalogs have identical keys and named interpolation parameters', () => {
  assert.deepEqual(Object.keys(catalogs.en).sort(), Object.keys(catalogs['pt-BR']).sort());
  const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort();
  for (const [key, english] of Object.entries(catalogs.en)) {
    assert.ok(catalogs['pt-BR'][key].trim(), key);
    assert.deepEqual(placeholders(english), placeholders(catalogs['pt-BR'][key]), key);
  }
  assert.equal(translate('pt-BR', 'story.chapter', { number: 12 }), 'Capítulo 12');
  assert.equal(translate('pt-BR', 'validation.range', { attribute: 'Strength', min: -2, max: 3 }), 'Força deve ser um inteiro de -2 a +3.');
});

test('validation exposes stable identities and parameters without changing canonical character fields', () => {
  const invalid = validateCharacterSetup({});
  assert.equal(invalid.valid, false);
  assert.equal(invalid.issues[0].key, 'validation.theme');
  assert.equal(formatMessage('pt-BR', invalid.issues[0]), 'Selecione Terror, Romance ou Alta fantasia.');
  const allocation = validateAttributeAllocation('Simplified', { Strength: 0, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 });
  assert.match(formatMessage('pt-BR', allocation.issues[0]), /Simplificada.*3.*0/);
});

test('IPC preserves successes and safe application error identities, never raw diagnostics', async () => {
  assert.deepEqual(await ipcResult(() => ({ version: '1' })), { ok: true, value: { version: '1' } });
  const failure = await ipcResult(() => { throw new AppTypeError('error.preferencesInvalid'); });
  assert.equal(failure.error.key, 'error.preferencesInvalid');
  assert.ok(new AppTypeError('error.model') instanceof TypeError);
  assert.equal(errorText('pt-BR', failure.error), 'Selecione preferências válidas para o aplicativo.');
  const diagnostic = 'sk-private-data-secret';
  for (const error of [new Error(diagnostic), new TypeError(diagnostic),
    new ProviderError('openai', 'request-failed', diagnostic)]) {
    const response = await ipcResult(() => { throw error; });
    assert.ok(!JSON.stringify(response).includes(diagnostic));
    assert.ok(!errorText('pt-BR', response.error).includes(diagnostic));
  }
  assert.equal(errorText('pt-BR', new Error(diagnostic)), catalogs['pt-BR']['error.unknown']);
  assert.equal(errorText('pt-BR', new AppError('error.exportProtected')), catalogs['pt-BR']['error.exportProtected']);
});

test('sandboxed preload unwraps successful values and preserves error keys through Error.message', async () => {
  let bridge, next = { ok: true, value: { version: '1' } };
  const calls = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/main/preload.js'), 'utf8'), {
    exports: {}, require: name => {
      assert.equal(name, 'electron', 'sandboxed preload must have no runtime application imports');
      return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return next; } } };
    }
  });
  assert.deepEqual(await bridge.getAppInfo(), { version: '1' });
  next = await ipcResult(() => { throw new AppError('error.preferencesSave'); });
  await assert.rejects(bridge.saveStoryPreferences({ interfaceLanguage: 'pt-BR' }), error => {
    // Electron only retains an Error's message across contextBridge.
    assert.equal(errorText('pt-BR', new Error(error.message)), catalogs['pt-BR']['error.preferencesSave']);
    return true;
  });
  assert.deepEqual(calls[1], ['preferences:save', { interfaceLanguage: 'pt-BR' }]);
  assert.equal(errorText('pt-BR', new Error('__MINDTRAVELLER_ERROR__{"key":"unknown"}')), catalogs['pt-BR']['error.unknown']);
  assert.equal(errorText('pt-BR', new Error('__MINDTRAVELLER_ERROR__invalid')), catalogs['pt-BR']['error.unknown']);
});

test('localized rule display uses shared numeric facts and leaves narrator rules unchanged', () => {
  const narratorRules = GAME_RULES_TEXT;
  assert.deepEqual(localizedRules('en'), RULES_SECTIONS);
  const translated = localizedRules('pt-BR');
  assert.equal(translated.length, RULES_SECTIONS.length);
  assert.equal(translated[0].heading, 'Escolhas da história');
  for (const attribute of ATTRIBUTE_NAMES) {
    const { min, max } = ATTRIBUTE_RANGES[attribute];
    const { label } = require('../dist/shared/i18n.js');
    assert.ok(translated[1].text.includes(`${label('pt-BR', attribute)}: ${min} a +${max}`));
  }
  for (const value of Object.values(DIFFICULTY_BASE_THRESHOLDS)) assert.ok(translated[4].text.includes(`: ${value}.`));
  assert.equal(GAME_RULES_TEXT, narratorRules);
});

test('native export dialog localizes app-owned strings without altering paths or formats', () => {
  const options = { title: 'Export History', defaultPath: 'Mindtraveller-João.md',
    filters: [{ name: 'Markdown history', extensions: ['md'] }], properties: ['createDirectory'] };
  const translated = localizedHistoryDialogOptions(options, 'pt-BR');
  assert.equal(translated.title, 'Exportar histórico');
  assert.equal(translated.filters[0].name, 'Histórico em Markdown');
  assert.equal(translated.defaultPath, options.defaultPath);
  assert.deepEqual(translated.properties, options.properties);
  assert.deepEqual(translated.filters[0].extensions, ['md']);
  assert.equal(options.title, 'Export History');
});
