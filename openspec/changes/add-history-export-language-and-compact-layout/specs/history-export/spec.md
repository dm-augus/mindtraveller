# Spec Delta

## Purpose

Lets players keep and share a complete readable transcript of their active adventure without depending on a model or network connection.

## ADDED Requirements

### Requirement: Complete readable transcript
The application SHALL export the active adventure as UTF-8 Markdown containing character details, genre, premise, all saved narrative segments in chronological chapter order, every offered choice, the selected choice, and each recorded check. Export SHALL preserve original story text and accents and SHALL use full history rather than memory summaries.

#### Scenario: Export a long Portuguese adventure
- **WHEN** the player exports an adventure longer than the model's recent-event window
- **THEN** the document contains all saved scenes and choices, Portuguese accents, and check difficulty, attribute/value, roll, threshold, and outcome, with readable headings and spacing

### Requirement: Local export action
An Export History button SHALL open a native save dialog with a suggested `.md` filename. Export SHALL work offline, report success only after writing, and leave adventure and provider settings unchanged. No API credential or provider configuration SHALL be included.

#### Scenario: Save an export offline
- **WHEN** the player confirms a destination while providers are unavailable
- **THEN** the transcript is written locally and the player receives success feedback without any provider request or adventure mutation

#### Scenario: Cancel or fail an export
- **WHEN** the player cancels the dialog or the destination cannot be written
- **THEN** cancellation creates no file and no error, while a write failure shows an actionable error without reporting success or changing progress

### Requirement: Export availability and snapshot
Export SHALL be disabled without saved narrative and during active generation, replacement, or export. A recoverable pending adventure with saved scenes SHALL remain exportable when idle; the transcript SHALL identify its pending action and saved roll or memory-update state without inventing a completed scene.

#### Scenario: Export an interrupted checked turn
- **WHEN** narration failed after a saved roll and the player exports the idle adventure
- **THEN** completed history, the pending selected action, and the saved roll are represented once and no continuation or reroll is triggered

#### Scenario: No story or active operation
- **WHEN** there are no saved scenes or an operation is actively changing progress
- **THEN** Export History is disabled with an understandable reason
