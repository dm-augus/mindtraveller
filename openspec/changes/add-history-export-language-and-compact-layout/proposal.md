# Proposal

## Why

Players need a readable copy of their adventure and the ability to start stories in Portuguese or English. The current desktop layout spends substantial space on repeated branding and chrome, leaving less room for narrative and decisions.

## What Changes

- Add an Export History button that saves the complete active adventure as readable UTF-8 Markdown through a native save dialog, without an LLM request.
- Add an English / Português selector for new adventures. Persist the default locally and fix each adventure's language at creation; changing the default never translates or changes an existing adventure.
- Apply the adventure language to premise, narrative, choices, and memory summaries for both providers, including retries and restoration. Existing saves default to English.
- Remove the in-app blue Mindtraveller title strip, retain the native Windows title bar, move genre into the story heading beside chapter information, and keep compact branding in the sidebar.
- Reduce decorative sidebar space and excess padding; bound the decision panel so longer Portuguese choices remain readable without crowding out the story.
- Add focused automated and running-app verification, then rebuild and check the Windows installer.

## Capabilities

### New Capabilities

- `history-export`: Complete, readable local adventure export, cancellation, and failure feedback.
- `story-language`: New-adventure language selection, persistence, legacy compatibility, and consistent generation in both providers.

### Modified Capabilities

- `desktop-experience`: A compact layout with relocated genre, accessible story tools, and more narrative space at supported window sizes.

The main spec inventory is currently empty. `desktop-experience` is already defined in the completed, unarchived `build-mindtraveller-v01` change; reuse that exact capability path. Sync or archive its baseline before syncing this change. This proposal does not recreate the original capability or reopen completed release tasks.

## Impact

- Shared adventure/setup/provider contracts and validation; local default-language preferences; main-process orchestration, prompts, summaries, and compatibility loading.
- A pure transcript formatter plus native dialog/file-writing orchestration, named preload API, validated IPC, and export feedback.
- React shell/setup, CSS, renderer bridge typings, domain/provider tests, shell smoke checks, and installed-app checks.
- No cloud storage, translation of existing history, UI-wide localization, PDF generation, or multiple save slots. Markdown is the proposed initial export format; Portuguese means Brazilian Portuguese (`pt-BR`), with English (`en`) as the initial default.
