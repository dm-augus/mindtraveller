# Spec Delta

## Purpose

Provides the Windows desktop shell through which players navigate the adventure, read the story, make choices, and exit the application.

## ADDED Requirements

### Requirement: Windows desktop launch
The application SHALL run as a Windows desktop application and open its main game window on launch.

#### Scenario: Launch on Windows
- **WHEN** the player launches the installed application on Windows
- **THEN** the main game window opens without requiring a browser or separately hosted web server

### Requirement: Retro game layout
The main window SHALL present a sidebar, scrollable story area, decision area, and bottom status bar in a retro desktop style informed by `temp/reference_prototype_1.png`.

#### Scenario: Active adventure view
- **WHEN** an adventure has a current narrative segment and available choices
- **THEN** the story area shows the narrative, the decision area shows the choices, and the sidebar and status bar remain available

### Requirement: Primary navigation
The sidebar SHALL provide New Story, Rules, Settings, and Quit actions, and the player SHALL be able to return to the active story from Rules or Settings.

#### Scenario: View settings and return
- **WHEN** the player opens Settings and then returns to the story
- **THEN** the current story and its available choices remain intact

### Requirement: Application status
The status bar SHALL show the application version and a concise state for the current adventure or LLM operation.

#### Scenario: Waiting for generation
- **WHEN** a story operation is awaiting an LLM response
- **THEN** the status bar indicates that the application is working

### Requirement: Quit behavior
Selecting Quit SHALL close the application after protecting already committed adventure state and ending outstanding work without starting another story turn.

#### Scenario: Quit during a request
- **WHEN** the player selects Quit while an LLM request is in progress
- **THEN** the application closes and the last committed adventure state remains available for restoration
