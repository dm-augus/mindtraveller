# Spec Delta

## Purpose

Preserves one active adventure across application sessions and protects it from accidental replacement or repeated action rolls.

## ADDED Requirements

### Requirement: Single local active adventure
The application SHALL keep at most one active adventure in local storage and SHALL not require an account or cloud service to save or resume it.

#### Scenario: Resume offline
- **WHEN** the player launches the application without internet access after an adventure was saved
- **THEN** the saved adventure can be viewed without logging in

### Requirement: Automatic saving
The application SHALL automatically save committed story progress, character details, theme, memory summaries, and any pending action or resolved check needed to resume safely.

#### Scenario: Completed turn
- **WHEN** a new narrative segment and choices are committed
- **THEN** they are saved for the next launch without a manual Save action

#### Scenario: Rolled action awaiting narration
- **WHEN** a check has been rolled but narration has not completed
- **THEN** the pending action and authoritative roll are saved before the application can lose them on exit

### Requirement: Restore on launch
On launch, the application SHALL restore the saved adventure to its last committed state and SHALL make a pending operation recoverable without duplicating a decision or rerolling a check.

#### Scenario: Reopen after a completed turn
- **WHEN** the player closes and reopens the application after a completed turn
- **THEN** the latest narrative, choices, character, and summaries are restored

#### Scenario: Reopen after interrupted generation
- **WHEN** the application reopens with a saved pending action
- **THEN** the player can retry that action from the saved state

### Requirement: Confirm replacement
Selecting New Story while an adventure is active SHALL present Yes and No choices and SHALL leave the adventure unchanged unless the player confirms replacement.

#### Scenario: Decline replacement
- **WHEN** the player selects No in the New Story confirmation
- **THEN** the modal closes and the active adventure remains unchanged

#### Scenario: Confirm replacement
- **WHEN** the player selects Yes in the New Story confirmation
- **THEN** the current adventure is discarded and the story creation flow begins for a new one

### Requirement: Save failure visibility
The application SHALL tell the player if local progress cannot be saved and SHALL not claim that unsaved progress is safely stored.

#### Scenario: Storage write fails
- **WHEN** an automatic save fails
- **THEN** the player sees a save error and the application does not report that the latest progress was saved
