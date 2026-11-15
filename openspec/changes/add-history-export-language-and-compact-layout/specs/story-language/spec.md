# Spec Delta

## Purpose

Lets players begin adventures in English or Brazilian Portuguese and keeps generated story content in the chosen language throughout each adventure.

## ADDED Requirements

### Requirement: New adventure language selector
New Story setup SHALL provide a keyboard-accessible English / Português selector with an explicitly indicated selection. English SHALL be the initial default. The last successfully selected default SHALL persist locally for future setup sessions; preference write failures SHALL be visible.

#### Scenario: Choose Portuguese for a new adventure
- **WHEN** the player selects Português and starts a valid new adventure
- **THEN** the adventure records Brazilian Portuguese and subsequent New Story setup defaults to Português, including after relaunch

### Requirement: Adventure language is fixed at creation
Changing the new-adventure default SHALL NOT alter an active adventure's language, text, choices, checks, summaries, or pending operation. The active story SHALL display its language as read-only information.

#### Scenario: Change default while an English adventure exists
- **WHEN** the player selects Portuguese as the default for the next story
- **THEN** the active English adventure and its retries continue in English, and replacement still requires the existing New Story confirmation

### Requirement: Consistent generated language
For both Ollama and OpenAI, the application SHALL explicitly instruct opening, no-check continuation, checked narration, chapter summary, and global summary generation to use the adventure's language for prose and choice text. Structured field names and game-rule enum values SHALL retain their existing machine-readable forms.

#### Scenario: Portuguese checked turn and memory
- **WHEN** a Portuguese adventure resolves a check and reaches a summary boundary
- **THEN** narration, next choices, and chapter/global memory are requested in Portuguese while difficulty, attribute, and outcome identifiers remain valid under the existing contracts

#### Scenario: Restore, retry, or switch providers
- **WHEN** the player restores or retries a pending Portuguese adventure, or switches providers before its next operation
- **THEN** generation uses that adventure's saved language regardless of the current new-story default and reuses any saved roll

### Requirement: Legacy save compatibility
Existing adventures without a language SHALL load as English without loss of progress or invalidation of backups and pending turns. Unsupported explicit language values SHALL be rejected rather than silently changing language. Existing provider configuration SHALL remain readable.

#### Scenario: Load an original save
- **WHEN** an original version-one adventure without a language is restored from active storage or backup
- **THEN** it remains available with English as its effective language and unchanged story history and pending roll
