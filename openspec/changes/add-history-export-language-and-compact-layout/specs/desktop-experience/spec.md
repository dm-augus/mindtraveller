# Spec Delta

## ADDED Requirements

### Requirement: Compact story chrome
The application SHALL remove the duplicate in-app Mindtraveller title strip, retain native window controls, and show genre, chapter, and read-only adventure language within the story heading. Compact sidebar branding SHALL retain access to New Story, Rules, Settings, Quit, character information, status, and version.

#### Scenario: View an active adventure
- **WHEN** a saved adventure is opened
- **THEN** genre, chapter, and language are visible without a separate application-title strip and existing navigation remains accessible

### Requirement: Efficient readable layout
At 1200x800 and 760x520, the application SHALL avoid horizontal overflow, keep a narrative viewport at least 100 CSS pixels high, and expose all decisions using wrapping and independent decision-area scrolling when needed. Retry and saved-roll information SHALL remain reachable. Body text SHALL NOT be shrunk to recover space.

#### Scenario: Long Portuguese choices
- **WHEN** long Portuguese choices and a pending checked turn are displayed at 760x520
- **THEN** labels wrap within buttons, decisions can scroll, the story remains readable, and retry and saved-roll information are reachable

### Requirement: Measurable story space improvement
For the same short-choice ready-state fixture, the revised layout SHALL provide a larger narrative viewport than the current layout at both supported sizes. Export History SHALL be reachable from the story view and language selection SHALL clearly identify that it applies to new stories.

#### Scenario: Compare layouts
- **WHEN** the same adventure is measured before and after the layout update
- **THEN** narrative viewport height increases at both sizes without hiding primary controls or keyboard focus indicators
