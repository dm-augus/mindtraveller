const fs = require('node:fs/promises');
const path = require('node:path');
const { AdventureStore } = require('../dist/main/adventure-storage.js');
const { StoryController } = require('../dist/main/story-controller.js');
const { OllamaAdapter } = require('../dist/main/providers/ollama.js');
void (async () => {
  const output = path.resolve('out/live-language-review');
  await fs.mkdir(output, { recursive: true });
  const provider = new OllamaAdapter('http://127.0.0.1:11434', { timeoutMs: 300000 });
  for (const language of ['en', 'pt-BR']) {
    const profile = await fs.mkdtemp(path.join(output, `${language}-`));
    const controller = new StoryController(new AdventureStore(profile), async () => ({ provider, modelId: 'llama3:latest' }));
    const opening = await controller.startOpening({ language, theme: 'High Fantasy', character: {
      name: 'Mira', gender: 'Female', avatarId: 'set_01_female_warrior', nature: 'Good', allocationMethod: 'Simplified',
      attributes: { Strength: 3, Dexterity: 0, Intelligence: 0, Endurance: 0, Charisma: 0, Luck: 0 }
    } });
    await fs.writeFile(path.join(output, `${language}-opening.json`), JSON.stringify(opening, null, 2));
    console.log(`${language}: opening saved`);
    const current = opening.segments.at(-1);
    const result = await controller.submitChoice(current.id, current.choices[0].id);
    await fs.writeFile(path.join(output, `${language}-continued.json`), JSON.stringify(result.adventure, null, 2));
    console.log(`${language}: continuation saved`);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
