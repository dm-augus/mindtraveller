# Proposal

## Why

Short adventures can repeat a scene and lose the connection between the current action and the original objective despite receiving the premise. Persistent explicit state and inexpensive validation should improve continuity with small local models.

## What Changes

- Persist the original objective and current scene state from the opening onward, independently of summaries.
- Require state updates with completed scenes and commit them atomically with narrative.
- Strengthen action-resolution prompts, send structured context, and reject duplicate recent narratives within bounded retries.
- Configure Ollama's context/output windows and validate the complete input budget.
- Preserve old saves, player-directed detours, pending turns, and saved rolls.

## Capabilities

### New Capabilities

- `story-coherence`: Objective/state continuity, scene progression checks, recovery, and provider context budgeting.

### Modified Capabilities

None. The main specification inventory is currently empty.

## Impact

Adventure persistence and validation, shared provider contracts, story orchestration, summaries, both provider adapters, tests, smoke fixtures, and user documentation. No additional per-turn model review, objective editor, installer release, or changes to the active player save.
