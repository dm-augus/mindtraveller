# Spec Delta

## Purpose

Give new characters explicit gender and portrait selections while preserving existing character identities and using gender as secondary context in generated adventures.

## ADDED Requirements

### Requirement: Gender selection for new characters
Character creation SHALL provide exactly Male/Female radio options, localized for display, and require one selection. Canonical values SHALL reach both LLM providers, whose instructions SHALL consider gender in narration and choices without changing check probabilities or constraining available roles.

#### Scenario: Create a female character in Portuguese
- **WHEN** a player selects Feminino in the Portuguese interface and starts an adventure
- **THEN** the saved gender is Female and opening and continuation requests include it as secondary narrative context

### Requirement: Gender-filtered bundled portraits
New character creation SHALL offer the six bundled portraits matching the selected gender, require a valid matching selection, and persist a stable portrait identifier. Changing gender SHALL replace an incompatible selection with a matching portrait. Portrait appearance SHALL NOT assign a character class or change attributes or odds.

#### Scenario: Switch gender after choosing a portrait
- **WHEN** a player changes Male to Female after selecting a male mage portrait
- **THEN** only female portraits are shown and the corresponding female mage portrait is selected

#### Scenario: Invalid portrait input
- **WHEN** a creation request contains an unknown portrait, a file path, or a portrait incompatible with the selected gender
- **THEN** the request is rejected before saving an opening or contacting the LLM

### Requirement: Persistent sidebar character presentation
The active character's selected portrait SHALL replace the sidebar dice artwork, with the character name directly below. Portraits SHALL remain visible after restart, navigation, failed generation, and provider changes, with accessible descriptions and wrapping names at supported window sizes.

#### Scenario: Restore a portrait-equipped character
- **WHEN** an adventure with a selected portrait is restored
- **THEN** its portrait and name appear in the sidebar without another model request

### Requirement: Preserve legacy character identity
Existing saves SHALL retain their original free-text gender, source history, pending state, and rolls. A missing portrait SHALL restore as no selected portrait and use the existing dice artwork as a fallback, with the character name below. Loading alone SHALL NOT rewrite the save or infer a new gender.

#### Scenario: Legacy arbitrary gender text
- **WHEN** an older adventure with a nonempty free-text gender and no portrait is loaded
- **THEN** it remains playable with unchanged gender and history, and displays the fallback artwork and saved name
