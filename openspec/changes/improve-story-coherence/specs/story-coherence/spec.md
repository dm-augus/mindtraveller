# Spec Delta

## Purpose

Maintain an adventure's original objective and current situation across generated scenes, summaries, retries, and application restarts.

## ADDED Requirements

### Requirement: Persistent objective and scene state
The system SHALL persist an original objective and current scene state from the opening onward, include them in generation and summary requests, and commit scene updates atomically with narrative. Summaries SHALL NOT replace these fields. Player-directed detours SHALL remain possible.

#### Scenario: Continue after a summary or restart
- **WHEN** an adventure continues after summarization or restart
- **THEN** generation receives the original objective and latest accepted scene state

#### Scenario: Reject or fail to save a continuation
- **WHEN** a continuation is rejected or cannot be saved
- **THEN** its proposed state and narrative are not committed and the existing pending turn and roll remain recoverable

### Requirement: Compatible restoration
The system SHALL restore legacy saves without a model call using the premise and latest narrative as fallback memory, preserve their source history and pending rolls, and reject explicitly malformed objective or state fields.

#### Scenario: Restore a legacy checked turn
- **WHEN** an older save with a pending narration is opened
- **THEN** fallback memory is supplied without changing the check or requiring generation during restoration

### Requirement: Resolve actions and reject repeated scenes
Generation instructions SHALL require resolution of the selected action and choices for the resulting situation. The system SHALL reject a narrative matching any of the six most recent narratives after Unicode, whitespace, and case normalization, retry with corrective guidance within three total attempts, and retain the pending turn on exhaustion.

#### Scenario: Richter repeats the window scene
- **WHEN** a continuation repeats Richter preparing to climb through the same window
- **THEN** the repeated scene is rejected and retry uses the same selected action and any saved roll

#### Scenario: A failed action is attempted again
- **WHEN** the player retries an action and receives a new narrative describing its consequences
- **THEN** similar choice wording alone does not cause rejection

### Requirement: Reject contaminated or padded continuations
The system SHALL reject response-field syntax embedded in generated narrative and substantial recent scenes copied with small additions, using bounded regeneration and preserving the pending action and saved roll on exhaustion.

#### Scenario: Aaron's repeated explanation contains response syntax
- **WHEN** the model copies the farmer's explanation and appends `, choices: [{` inside the narrative
- **THEN** the continuation is rejected before committing either its narrative or scene state

#### Scenario: A copied scene has a small prose addition
- **WHEN** a recent scene of at least 30 normalized words is contained in a continuation and constitutes at least 80 percent of its normalized text
- **THEN** the continuation is rejected as repetition

### Requirement: Bounded Ollama requests
Ollama story requests SHALL explicitly allocate an 8192-token context and 1536 output tokens, reserve 256 safety tokens, and reject complete message payloads estimated above the remaining input budget before sending. Required memory SHALL NOT be silently dropped to fit.

#### Scenario: Input budget exceeded
- **WHEN** mandatory memory and prompt instructions exceed the input allowance
- **THEN** a recoverable context error is returned without sending the request or changing the saved turn

### Requirement: Lightweight operation
Normal turns SHALL NOT require an additional model review call. Both providers SHALL receive structured story context and instructions to avoid checks for trivial travel, select relevant attributes, and honor application-resolved outcomes.

#### Scenario: Ordinary no-check continuation
- **WHEN** an ordinary action is resolved with a valid fresh narrative
- **THEN** one assessment/continuation request suffices and the resulting state is saved with the narrative
