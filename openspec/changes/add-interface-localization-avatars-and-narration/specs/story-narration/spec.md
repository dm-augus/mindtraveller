# Spec Delta

## Purpose

Read saved story narrative through installed Windows voices and let players replay individual segments without exposing game controls or check results to narration.

## ADDED Requirements

### Requirement: Automatically read newly saved narrative
Automatic narration SHALL be enabled by default and configurable in Settings. Each newly committed opening or continuation SHALL be read once when enabled, including a committed segment followed by a summary failure. Only the segment's narrative SHALL be spoken; premise, choices, checks, dice results, status messages, and summaries SHALL be excluded.

#### Scenario: Continuation saved before a summary error
- **WHEN** a continuation is saved but its subsequent memory update fails
- **THEN** its narrative is eligible for one automatic reading and retrying only the summary does not read it again

#### Scenario: Restore or rejected generation
- **WHEN** an adventure is loaded, the interface rerenders, or a proposed scene is rejected before saving
- **THEN** no automatic narration is triggered for that content

### Requirement: Per-segment playback controls
Each saved narrative segment SHALL have a keyboard-accessible sound-icon control directly below its narrative to play it again, with a localized label. The currently playing segment SHALL offer Stop. Playback SHALL NOT generate story content, roll dice, or mutate the adventure.

#### Scenario: Replay a previous scene
- **WHEN** the player activates an older segment's sound button
- **THEN** only that saved narrative is spoken from its beginning and the saved story remains unchanged

### Requirement: Local voices follow adventure language
Speech SHALL use installed Windows voices without an online speech service, preferring US English for English adventures and requiring a Brazilian Portuguese voice for pt-BR adventures. Interface language and character gender SHALL NOT determine voice language. Missing voices or unavailable synthesis SHALL produce localized nonblocking feedback without falling back to a different language.

#### Scenario: English interface and Portuguese adventure
- **WHEN** a Portuguese adventure is played in an English interface
- **THEN** its narrative is spoken with an available pt-BR voice

#### Scenario: Matching voice is missing
- **WHEN** no compatible installed voice exists for the adventure language
- **THEN** playback is unavailable with an explanation, while story generation and manual reading remain usable

### Requirement: Exclusive and cancellable playback
Only one segment SHALL play at a time. A new playback request SHALL replace the previous one. Playback SHALL stop when a player submits a new story action, leaves the story view, disables automatic narration, replaces the adventure, reloads the renderer, or quits. Late completion events SHALL NOT stop or change a newer playback.

#### Scenario: Replay during existing speech
- **WHEN** another segment is selected for replay while one is speaking
- **THEN** the first is stopped and the selected segment starts from the beginning

#### Scenario: Quit while speaking
- **WHEN** the player quits during narration
- **THEN** speech and its helper process stop without changing story progress or leaving audio running
