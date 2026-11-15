const fs = require('node:fs/promises');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
const { formatHistory } = require('../dist/main/history-formatter.js');

void (async () => {
  await fs.mkdir(path.resolve('out'), { recursive: true });
  const output = await fs.mkdtemp(path.resolve('out/live-coherence-'));
  console.log(`Evidence: ${output}`);
  const modelId = 'llama3:latest', address = 'http://127.0.0.1:11434';
  const summary = { modelId, address, cases: [] };
  const saveSummary = () => fs.writeFile(path.join(output, 'review.json'), JSON.stringify(summary, null, 2));
  const tags = await fetch(`${address}/api/tags`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  summary.model = tags.models?.find(model => (model.model ?? model.name) === modelId);
  if (!summary.model) throw new Error('The review requires the existing llama3:latest model; no model was downloaded.');
  for (const language of ['en', 'pt-BR']) {
    const profile = path.join(output, language), record = { language, scenes: [], requests: 0 };
    summary.cases.push(record);
    const provider = new OllamaAdapter(address, { timeoutMs: 300000, fetchImpl: async (url, options) => {
      record.requests++;
      const request = JSON.parse(options.body);
      await fs.mkdir(profile, { recursive: true });
      await fs.writeFile(path.join(profile, `request-${record.requests}.json`), JSON.stringify(request, null, 2));
      return fetch(url, options);
    } });
    const store = new AdventureStore(profile), controller = new StoryController(store, async () => ({ provider, modelId }));
    const capture = async adventure => {
      await fs.writeFile(path.join(profile, 'adventure.json'), JSON.stringify(adventure, null, 2));
      await fs.writeFile(path.join(profile, 'history.md'), formatHistory(adventure));
      const scene = adventure.segments.at(-1);
      record.scenes.push({ narrative: scene.narrative, check: scene.check, mainObjective: adventure.mainObjective,
        storyState: adventure.storyState });
      await saveSummary();
      console.log(`${language}: scene ${record.scenes.length} saved (${record.requests} requests)`);
    };
    try {
      let adventure = await controller.startOpening({ language, theme: 'High Fantasy', character: {
        name: 'Richter', gender: 'Male', avatarId: 'set_01_male_warrior', nature: 'Neutral', allocationMethod: 'Simplified',
        attributes: { Strength: 0, Dexterity: 3, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
      } });
      await capture(adventure);
      for (let turn = 0; turn < 3; turn++) {
        const current = adventure.segments.at(-1);
        const choice = current.choices[0];
        record.scenes.at(-1).selectedChoice = choice.text;
        adventure = (await controller.submitChoice(current.id, choice.id)).adventure;
        await capture(adventure);
      }
    } catch (error) {
      record.error = { code: error.code, message: error.message };
      record.pending = await controller.restore();
      await saveSummary();
      console.log(`${language}: review stopped: ${error.message}`);
    }
  }
  await saveSummary();
  if (summary.cases.some(record => record.error)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
