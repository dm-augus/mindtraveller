# Spec Delta

## Purpose

Keeps long adventures coherent without sending every past narrative segment and decision in each LLM request.

## ADDED Requirements

### Requirement: Layered adventure memory
The application SHALL maintain recent detailed segments and player decisions, summaries of completed chapters, and a global story summary. These levels SHALL preserve significant choices, check outcomes, characters, relationships, unresolved goals, and world facts.

#### Scenario: Long adventure
- **WHEN** an adventure extends beyond the recent-event window
- **THEN** older important events remain represented in chapter or global summaries

### Requirement: Chapter summarization
The application SHALL divide an adventure into chapters with an internally configurable number of narrative segments per chapter and summarize each chapter when it reaches that limit.

#### Scenario: Chapter reaches its limit
- **WHEN** the configured number of segments has been completed in a chapter
- **THEN** the application creates a chapter summary before discarding those segments from the detailed context window

### Requirement: Global summary updates
The application SHALL update the global summary as chapters or other configured summarization thresholds are reached, retaining major developments and unresolved threads.

#### Scenario: Complete another chapter
- **WHEN** a chapter summary is completed
- **THEN** the global summary incorporates its major developments and unresolved threads

### Requirement: Bounded context construction
Each story request SHALL include the game rules, character details including Nature, theme, global summary, relevant chapter summaries, recent events, and latest decision as applicable, within an internally configurable context budget.

#### Scenario: Request after many chapters
- **WHEN** the application requests the next segment of a long adventure
- **THEN** the request uses bounded summarized context rather than the full transcript

### Requirement: Summary failure protection
Failed summarization SHALL not remove the source events or overwrite a valid prior summary, and the application SHALL permit the operation to be retried.

#### Scenario: Chapter summary request fails
- **WHEN** the provider fails while summarizing a completed chapter
- **THEN** the chapter's source events and the prior global summary remain available for retry
