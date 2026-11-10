# Spec Delta

## Purpose

Guides players through a valid medieval story setup and creates the character details that shape the adventure and its action checks.

## ADDED Requirements

### Requirement: Theme selection
The player SHALL select Horror, Romance, or High Fantasy before starting a new adventure, and the selected theme SHALL guide story generation.

#### Scenario: Select a theme
- **WHEN** the player selects Horror during story setup
- **THEN** the new adventure records Horror as its theme and uses it when requesting story content

### Requirement: Attribute ranges
Characters SHALL have integer Strength, Dexterity, Intelligence, and Endurance attributes from -2 through +3, and Charisma and Luck attributes from -1 through +1. All attributes SHALL start at 0 during allocation.

#### Scenario: Reject an out-of-range value
- **WHEN** an allocation would set Charisma to +2
- **THEN** the application rejects the value and does not advance setup

### Requirement: Balanced allocation
The Balanced method SHALL require exactly five positive points and exactly two negative points across the final attribute values while respecting every attribute range.

#### Scenario: Valid balanced character
- **WHEN** the final attributes contain five points above zero and two points below zero within their ranges
- **THEN** the application accepts the Balanced allocation

#### Scenario: Incomplete balanced character
- **WHEN** the final attributes contain five positive points and only one negative point
- **THEN** the application prevents the player from continuing

### Requirement: Simplified allocation
The Simplified method SHALL require exactly three positive points and no negative attribute values while respecting every attribute range.

#### Scenario: Valid simplified character
- **WHEN** the final attributes contain exactly three points above zero, no negative values, and no out-of-range value
- **THEN** the application accepts the Simplified allocation

### Requirement: Character identity and Nature
The player SHALL provide a non-empty name, a gender, and one Nature value: Good, Neutral, or Bad. Nature SHALL influence suggested actions without forbidding actions of another moral alignment or changing D100 odds.

#### Scenario: Finish character creation
- **WHEN** the player provides valid attributes, name, gender, and Nature
- **THEN** the adventure records those details and can request its opening story

#### Scenario: Nature does not restrict action
- **WHEN** a Good character is offered a selfish but plausible action
- **THEN** the player can select that action
