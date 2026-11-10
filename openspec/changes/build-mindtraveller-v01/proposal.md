# Proposal

## Why

Mindtraveller has an initial product draft and game rules but no executable application or durable behavior specification. This change defines the first playable Windows desktop release so the story loop, dice rules, LLM integration, and long-running adventure behavior can be implemented consistently.

## What Changes

- Create a Windows-first Electron desktop application with a retro RPG interface based on `temp/reference_prototype_1.png`.
- Add medieval Horror, Romance, and High Fantasy story setup with validated character attributes and player-selected Good, Neutral, or Bad Nature.
- Generate narrative segments and meaningful player choices through either a configured local Ollama model or an OpenAI model.
- Have the LLM identify uncertain actions, then have the application validate and perform D100 checks. Show the difficulty, attribute, roll, threshold, and result to the player.
- Keep one active adventure, autosave it locally, restore it on launch, and require confirmation before New Story replaces it.
- Use recent events, chapter summaries, and a global summary to keep long stories coherent within a configurable context budget.
- Provide rules and character information, provider settings, useful failure states, and application exit behavior.

## Capabilities

### New Capabilities

- `desktop-experience`: Retro desktop shell, navigation, layout, status, and exit behavior.
- `character-creation`: Theme, identity, Nature, attribute allocation, and validation.
- `story-play`: Story initialization, narrative and choice generation, and turn progression.
- `action-resolution`: Application-controlled D100 checks and visible outcomes.
- `story-context`: Chapter and global summarization and bounded context construction.
- `adventure-persistence`: Local autosave, restoration, and replacement confirmation for one active adventure.
- `llm-configuration`: Ollama and OpenAI selection, model configuration, credential handling, and provider failures.
- `rules-reference`: Readable game rules and active character information.

### Modified Capabilities

None. The project has no existing capability specs.

## Impact

- Introduces an Electron application, renderer, local data storage, LLM provider adapters, and Windows packaging.
- Uses `temp/systemInitialRequirements.md`, `temp/probabilitySystem.md`, and `temp/reference_prototype_1.png` as source material; the OpenSpec specs establish the implementation contract where the drafts differ from the decisions above.
- OpenAI requests use the player's API key; Ollama requests target a player-configured local server. No accounts, cloud sync, multiplayer, or multiple saved adventures are included.
