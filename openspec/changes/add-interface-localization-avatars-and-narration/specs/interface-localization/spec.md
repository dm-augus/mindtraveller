# Spec Delta

## Purpose

Let players use the application in English or Brazilian Portuguese independently of their adventures' language, with maintainable translations and usable settings at supported window sizes.

## ADDED Requirements

### Requirement: Independent persisted interface language
Settings SHALL offer English and Português (Brasil) for the interface, apply a successfully saved selection immediately across screens, and restore it on restart. Changing interface language SHALL NOT change adventure language, the default language for new stories, source story text, or LLM language instructions.

#### Scenario: Portuguese interface with an English adventure
- **WHEN** a player switches the interface to Brazilian Portuguese while playing an English adventure
- **THEN** application controls become Portuguese while the adventure remains English and its saved content and rolls remain unchanged

#### Scenario: Legacy preferences and failed updates
- **WHEN** preferences without an interface language are loaded
- **THEN** the interface defaults to English and preserves the saved default story language
- **AND** a failed setting update leaves the previous persisted and displayed selection active with localized failure feedback

### Requirement: Editable and complete application translations
Application-owned navigation, headings, forms, rule explanations, validation, statuses, errors, dialogs, tooltips, and accessibility labels SHALL use centralized editable English/PT-BR catalogs. Machine identifiers, provider/model names, player text, generated story text, and existing Markdown export contents SHALL remain intact.

#### Scenario: Display rules and check metadata
- **WHEN** a Portuguese-interface player opens Rules or views a check result
- **THEN** display labels and explanations are Portuguese while underlying attributes, difficulty identifiers, and odds retain their canonical values

#### Scenario: Error from the main process
- **WHEN** an application operation fails while the interface is Portuguese
- **THEN** its user-facing error is rendered in Portuguese without exposing raw provider output, credentials, or untranslated internal diagnostics

### Requirement: Preferences remain independent during updates
Saving one application preference SHALL preserve unrelated preferences, including concurrent updates to interface language, default story language, and automatic narration. Preference loading and updates SHALL NOT overwrite an adventure or provider credentials.

#### Scenario: Concurrent preference selections
- **WHEN** interface language and default story language are changed close together
- **THEN** both successful updates persist and neither restores an outdated value for the other

### Requirement: Responsive localized Settings
Settings SHALL use available space in larger windows and remain usable at 760x520. Translated text and controls SHALL wrap without horizontal overflow, preserve visible keyboard focus, and remain reachable by scrolling.

#### Scenario: Resize the settings window
- **WHEN** Settings is viewed at 760x520, 1200x800, or 1920x1080 in either interface language
- **THEN** all preference, provider, model, and save controls remain reachable with no clipping or overlapping fields
