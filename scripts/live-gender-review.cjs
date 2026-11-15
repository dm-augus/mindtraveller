const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { formatHistory } = require('../dist/main/history-formatter.js');

// Real model review, isolated from the player's profile. Run after npm run build:main.
void (async () => {
  await fs.mkdir(path.resolve('out'), { recursive: true });
  const output = await fs.mkdtemp(path.resolve('out/live-gender-'));
  console.log(`Evidence: ${output}`);
  const modelId = 'llama3:latest', address = 'http://127.0.0.1:11434';
  const tags = await fetch(`${address}/api/tags`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  const model = tags.models?.find(item => (item.model ?? item.name) === modelId);
  if (!model) throw new Error('The review requires the existing llama3:latest model; no model is downloaded.');
  const review = { model, cases: [] };
  for (const gender of ['Male', 'Female']) {
    const profile = path.join(output, gender);
    await fs.mkdir(profile, { recursive: true });
    const record = { gender, language: 'pt-BR', requests: 0, scenes: [] };
    review.cases.push(record);
    const provider = new OllamaAdapter(address, { timeoutMs: 300000, fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body), payload = JSON.parse(body.messages[1].content);
      const identity = payload.operation === 'opening' ? payload.character : payload.context.character;
      assert.equal(identity.gender, gender);
      assert.doesNotMatch(JSON.stringify(body.messages), /avatarId|set_01_|\.png/);
      await fs.writeFile(path.join(profile, `request-${++record.requests}.json`), JSON.stringify(body, null, 2));
      return fetch(url, options);
    } });
    const controller = new StoryController(new AdventureStore(profile), async () => ({ provider, modelId }));
    const capture = async adventure => {
      record.scenes.push({ narrative: adventure.segments.at(-1).narrative, choices: adventure.segments.at(-1).choices,
        check: adventure.segments.at(-1).check });
      await fs.writeFile(path.join(profile, 'history.md'), formatHistory(adventure));
      await fs.writeFile(path.join(output, 'review.json'), JSON.stringify(review, null, 2));
      console.log(`${gender}: scene ${record.scenes.length} (${record.requests} requests)`);
    };
    try {
      let adventure = await controller.startOpening({ language: 'pt-BR', theme: 'High Fantasy', character: {
        name: 'Alex', gender, avatarId: `set_01_${gender.toLowerCase()}_mage`, nature: 'Good', allocationMethod: 'Simplified',
        attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
      } });
      await capture(adventure);
      const scene = adventure.segments.at(-1), choice = scene.choices[0];
      record.selectedChoice = choice.text;
      adventure = (await controller.submitChoice(scene.id, choice.id)).adventure;
      await capture(adventure);
    } catch (error) {
      record.error = { code: error.code, message: error.message };
      await fs.writeFile(path.join(output, 'review.json'), JSON.stringify(review, null, 2));
      console.log(`${gender}: ${error.message}`);
    }
  }
  if (review.cases.some(item => item.error)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
