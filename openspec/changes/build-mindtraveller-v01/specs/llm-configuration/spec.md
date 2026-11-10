# Spec Delta

## Purpose

Lets the player choose and configure a local or external LLM while keeping provider failures recoverable and API credentials private.

## ADDED Requirements

### Requirement: Ollama configuration
Settings SHALL allow the player to enter an Ollama server address and select a model available from that server for story and summary operations.

#### Scenario: Select a local model
- **WHEN** the player connects to a reachable Ollama server with available models
- **THEN** Settings presents those models and records the selected one

### Requirement: OpenAI configuration
Settings SHALL allow the player to enter an OpenAI API key and select a supported model for story and summary operations.

#### Scenario: Configure OpenAI
- **WHEN** the player saves a valid key and model selection
- **THEN** subsequent OpenAI operations use that configured model

### Requirement: Active provider selection
Settings SHALL allow the player to select Ollama or OpenAI as the active provider. Story generation, action assessment, and summarization SHALL use the active provider and its selected model for operations started after the selection.

#### Scenario: Switch providers
- **WHEN** the player changes the active provider from Ollama to OpenAI
- **THEN** the next LLM operation uses the configured OpenAI model

### Requirement: Credential privacy
The application SHALL protect a saved OpenAI API key using Windows user-bound secret storage and SHALL never place the key in adventure saves, story prompts, story content, or logs. Settings SHALL not reveal the full saved key.

#### Scenario: View settings after saving a key
- **WHEN** the player reopens Settings after saving an OpenAI key
- **THEN** the full key is not displayed

#### Scenario: Inspect an adventure save
- **WHEN** an adventure is saved while OpenAI is active
- **THEN** the save does not contain the API key

### Requirement: Provider failure feedback
The application SHALL distinguish unavailable provider, authentication failure, inaccessible model, and failed or timed-out request with actionable messages, while preserving recoverable adventure state.

#### Scenario: Ollama is offline
- **WHEN** the selected Ollama server is unavailable for a story request
- **THEN** the player sees an unavailable-provider message and can retry after the server is available

#### Scenario: OpenAI key is rejected
- **WHEN** OpenAI rejects the configured key
- **THEN** the player sees an authentication message without the key being exposed
