# Proposal

## Why

Players can generate Portuguese adventures but the application interface remains English, character presentation lacks portraits, and stories have no audio playback. Independent interface localization, clearer character creation, and local narration will make the Windows application more accessible and personal.

## What Changes

- Add a persisted English/Brazilian Portuguese interface setting, independent of adventure language and the default language for new stories. Centralize editable translation catalogs for application-owned labels, rules display, feedback, and accessibility text.
- Replace free-text gender entry for new characters with Male/Female radio buttons. Both LLM adapters will consider gender as secondary narrative context, without changing attributes or check odds.
- Add a gender-filtered portrait picker using the twelve existing images in `src/assets/faces`. Save a stable portrait identifier and show the portrait in the sidebar's current dice position, with the character name directly below.
- Add local narration using installed Windows voices: automatically read newly committed narrative segments and provide replay/stop controls below each segment. Exclude choices, checks, dice results, premise, and summaries. Add an automatic-reading preference, enabled by default.
- Adapt Settings to use larger windows while remaining usable at the current minimum size.
- Preserve legacy preferences, arbitrary saved gender text, pending turns, story language, source history, and saved rolls.

## Capabilities

### New Capabilities

- `interface-localization`: Independent interface-language preferences, editable translations, localized feedback, and responsive Settings presentation.
- `character-identity`: Validated gender selection, gender-aware story prompts, filtered portrait selection, and persistent character presentation.
- `story-narration`: Local Windows speech for newly committed narrative segments and manual replay with cancellation and graceful failure handling.

### Modified Capabilities

None. The main spec inventory is empty; the prior language/layout and coherence changes remain completed implementation dependencies and are not rewritten.

## Impact

Renderer screens and styles, shared validation/types and translation catalogs, application preferences, save normalization, provider prompts, preload/IPC contracts, and Windows packaging for a fixed speech helper. Existing portraits are reused. No online speech service, downloaded model, uploaded audio, portrait generation, or active player-save repair is included. Implementation will include tests, documentation, and isolated packaged-app verification.
