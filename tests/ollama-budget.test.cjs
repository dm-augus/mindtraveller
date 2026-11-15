const test = require('node:test');
const assert = require('node:assert/strict');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { OLLAMA_GENERATION_OPTIONS, OLLAMA_INPUT_BUDGET, requireOllamaMessageBudget } = require('../dist/main/providers/ollama-budget.js');
const { checkedNarrationMessages, summaryMessages } = require('../dist/main/providers/story-prompts.js');
const { StoryContextBudgetError, estimateContextTokens } = require('../dist/main/story-context.js');
const { DEFAULT_STORY_CONFIGURATION } = require('../dist/main/story-config.js');

test('Ollama reserves output/safety headroom and enforces the exact estimated input boundary', () => {
  assert.deepEqual(OLLAMA_GENERATION_OPTIONS, { num_ctx: 8192, num_predict: 1536 });
  assert.equal(OLLAMA_INPUT_BUDGET, 6400);
  const messages = [{ role: 'user', content: '' }];
  const overhead = Buffer.byteLength(JSON.stringify(messages));
  messages[0].content = 'x'.repeat(6400 * 3 - overhead);
  assert.equal(estimateContextTokens(JSON.stringify(messages)), 6400);
  assert.doesNotThrow(() => requireOllamaMessageBudget(messages));
  messages[0].content += 'x';
  assert.throws(() => requireOllamaMessageBudget(messages), error => error instanceof StoryContextBudgetError
    && error.estimatedTokens === 6401 && error.budgetTokens === 6400);
  assert.equal(DEFAULT_STORY_CONFIGURATION.contextBudgetTokens, 5000);
  assert.equal(DEFAULT_STORY_CONFIGURATION.chapterSummaryThresholdTokens, 3000);
  assert.equal(DEFAULT_STORY_CONFIGURATION.globalSummaryThresholdTokens, 4000);
});

const choices = [{ id: 'enter', text: 'Enter.' }, { id: 'wait', text: 'Wait.' }, { id: 'ask', text: 'Ask.' }];
const check = { difficulty: 'Medium', attribute: 'Dexterity', attributeValue: 3,
  baseThreshold: 50, threshold: 80, roll: 40, outcome: 'success' };

test('complete narration prompt budget includes correction before a retry is sent', async () => {
  const context = { mainObjective: 'Find a cure.', storyState: { location: 'Thoric’s house',
    situation: 'Richter is at the window.', currentFocus: 'Find Thoric.' },
    recentEvents: [{ narrative: 'Richter is at the window.' }], padding: '' };
  const request = { modelId: 'test', language: 'en', paragraphTarget: 3, choiceTarget: 3, check,
    choice: { choiceId: 'enter', choiceText: 'Enter.', turnId: 'turn' }, context: JSON.stringify(context) };
  const overhead = Buffer.byteLength(JSON.stringify(checkedNarrationMessages(request)));
  context.padding = 'x'.repeat(6400 * 3 - overhead);
  request.context = JSON.stringify(context);
  assert.equal(estimateContextTokens(JSON.stringify(checkedNarrationMessages(request))), 6400);
  let calls = 0;
  const adapter = new OllamaAdapter('http://localhost:11434', { fetchImpl: async (_url, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body).options, OLLAMA_GENERATION_OPTIONS);
    return Response.json({ done: true, message: { role: 'assistant', content: JSON.stringify({ outcome: 'success',
      narrative: 'Richter is at the window.', choices, storyState: context.storyState }) } });
  } });
  await assert.rejects(adapter.narrateCheck(request), StoryContextBudgetError);
  assert.equal(calls, 1, 'the oversized correction must not reach Ollama');
  context.padding += 'x';
  await assert.rejects(adapter.narrateCheck({ ...request, context: JSON.stringify(context) }), StoryContextBudgetError);
  assert.equal(calls, 1, 'an oversized initial request must not reach Ollama');
});

test('summary messages count structured context and instruction overhead', async () => {
  let calls = 0;
  const adapter = new OllamaAdapter('http://localhost:11434', { fetchImpl: async () => { calls++; throw new Error('unexpected request'); } });
  const request = { modelId: 'test', language: 'pt-BR', kind: 'global', context: JSON.stringify({ sourceEvents: 'á'.repeat(12000) }) };
  assert.ok(estimateContextTokens(JSON.stringify(summaryMessages(request))) > 6400);
  await assert.rejects(adapter.summarize(request), StoryContextBudgetError);
  assert.equal(calls, 0);
});
