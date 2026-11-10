# Spec Delta

## Purpose

Runs the single-player adventure loop, turning character setup and player choices into coherent narrative segments and meaningful next actions.

## ADDED Requirements

### Requirement: Story initialization
After valid character creation, the application SHALL request an original premise, opening narrative, and first choices using the selected theme, character details, and game rules.

#### Scenario: Start a new adventure
- **WHEN** the player completes character creation with a usable LLM provider
- **THEN** the application displays an opening narrative and initial choices consistent with the selected theme and character

### Requirement: Narrative segments
The application SHALL request narrative segments of approximately two to three paragraphs by default, with an internal setting for the target paragraph count. Segments SHALL remain consistent with established story facts and relevant character attributes.

#### Scenario: Continue an established story
- **WHEN** the next segment is generated after a player decision
- **THEN** it reflects the decision and does not discard relevant established facts

### Requirement: Player choices
Each generated segment SHALL offer three or four meaningful, situation-appropriate actions by default, with an internal setting for the target choice count. Nature SHALL influence suggestions without removing plausible actions solely because they conflict with Nature.

#### Scenario: Choices for a scene
- **WHEN** a new segment is displayed
- **THEN** the decision area displays the configured number of distinct actions that the player can select

### Requirement: Turn progression
Selecting a choice SHALL record the chosen action and request the next narrative segment and choices, applying action resolution first when a check is needed.

#### Scenario: Choose an action
- **WHEN** the player selects an available choice
- **THEN** the next segment reflects that choice and any authoritative check outcome

### Requirement: Single pending turn
The application SHALL accept no second choice submission while a turn is being resolved and SHALL show that the current operation is pending.

#### Scenario: Repeated selection while waiting
- **WHEN** the player selects a choice and tries to select another before resolution finishes
- **THEN** the application submits only the first choice

### Requirement: Recoverable generation failure
A failed or timed-out story request SHALL leave the last completed story content intact and offer a way to retry the pending operation without adding the same choice twice.

#### Scenario: Provider times out during a turn
- **WHEN** the provider times out after a choice is selected
- **THEN** the player sees an error and can retry from the saved pending turn
