# Spec Delta

## Purpose

Resolves uncertain player actions with verifiable D100 rules while letting the LLM judge the fictional situation and narrate the authoritative outcome.

## ADDED Requirements

### Requirement: Check identification
For a selected action, the LLM SHALL identify whether a check is needed; when needed, it SHALL identify one relevant character attribute and one difficulty class. The application SHALL reject an invalid attribute or difficulty before rolling.

#### Scenario: Trivial action
- **WHEN** the LLM identifies an action as requiring no uncertain check
- **THEN** the application continues the story without a D100 roll

#### Scenario: Invalid check classification
- **WHEN** the LLM returns an unknown difficulty class
- **THEN** the application does not roll and treats the classification as a recoverable generation error

### Requirement: Difficulty thresholds
The application SHALL use base success thresholds of 5 for Very Hard, 20 for Hard, 50 for Medium, 80 for Easy, and 90 for Very Easy.

#### Scenario: Hard check
- **WHEN** an action is classified as Hard
- **THEN** its base success threshold is 20 before the attribute modifier

### Requirement: Attribute modification and limits
The application SHALL calculate the success threshold as `max(0, min(98, base threshold + attribute value * 10))`. A D100 result of 99 or 100 SHALL always fail.

#### Scenario: Positive modifier
- **WHEN** a Hard check uses Strength +1
- **THEN** the success threshold is 30

#### Scenario: Upper limit
- **WHEN** an Easy check uses an attribute of +3
- **THEN** the success threshold is 98

#### Scenario: Lower limit
- **WHEN** a Very Hard check uses an attribute of -2
- **THEN** the success threshold is 0 and the check cannot succeed

### Requirement: Application-owned roll
For a valid check, the application SHALL generate one integer from 1 through 100 and SHALL mark success exactly when that integer is less than or equal to the calculated threshold. The LLM SHALL not choose or change the roll or result.

#### Scenario: Inclusive threshold
- **WHEN** a check has threshold 30 and the application rolls 30
- **THEN** the check succeeds

#### Scenario: Above threshold
- **WHEN** a check has threshold 30 and the application rolls 31
- **THEN** the check fails

### Requirement: Visible check result
The player SHALL see the check's difficulty class, attribute and value, D100 roll, final success threshold, and success or failure outcome. Subsequent narration SHALL reflect that outcome.

#### Scenario: Display a resolved check
- **WHEN** a Hard Strength +1 check rolls 25
- **THEN** the player sees Hard, Strength +1, 25, 30, and success with compatible story narration

### Requirement: Stable result on retry
Once a check has been rolled for a selected action, retries and application restoration SHALL reuse that roll and result rather than rolling again.

#### Scenario: Narration request fails after a roll
- **WHEN** the application rolls for an action and the narration request fails
- **THEN** retrying the action reuses the saved roll and result
