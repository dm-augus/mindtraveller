# Spec Delta

## Purpose

Gives players an in-app explanation of the game mechanics and a reliable view of the active character's details.

## ADDED Requirements

### Requirement: Readable game rules
The Rules screen SHALL explain the story choice loop, attribute effects and ranges, when D100 checks occur, difficulty classes, threshold calculation, and Nature's influence on suggested choices.

#### Scenario: Inspect action rules
- **WHEN** the player opens Rules
- **THEN** the player can read the five difficulty classes, their base thresholds, the attribute modifier, and the rule that 99 and 100 always fail

### Requirement: Active character information
The Rules screen SHALL display the active character's name, gender, Nature, and current values for all six attributes.

#### Scenario: Inspect an active character
- **WHEN** the player opens Rules during an adventure
- **THEN** the screen shows the details recorded for that adventure's character

#### Scenario: No active character
- **WHEN** the player opens Rules before any adventure exists
- **THEN** the game rules remain readable and the character area clearly indicates that no character is active
