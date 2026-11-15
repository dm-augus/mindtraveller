# Design

## Context

See [proposal.md](proposal.md) for motivation. The complete transcript stays in `Adventure.segments`; the renderer displays choices from its latest segment. Export can use this source history without model calls. Filesystem access already belongs to main, exposed through named preload APIs.

Version-one adventure validation rejects unknown keys. Language must therefore be added to shared types, creation validation, storage validation, and compare-and-save behavior together. Both providers use shared prompt builders, while story context and summary contexts are constructed separately. Provider configuration is separate from adventures and must remain compatible.

The shell currently reserves 44 pixels plus spacing for an in-app title strip and uses large sidebar artwork. Existing smoke scripts cover 1200x800, 760x520, assets, pending turns, and installed restoration. Main specs are empty because the completed baseline is unarchived: sync/archive `build-mindtraveller-v01` before syncing this delta; do not reopen its completed tasks.

## Goals / Non-Goals

**Goals:** Deterministic offline export, immutable adventure language with safe legacy loading, and measurable reading-space gains within the existing Electron boundary.

**Non-Goals:** Translating existing adventures or all UI labels, automatic language detection, replacing native window controls, or adding export dependencies.

## Decisions

### Export saved source history as Markdown

Add a pure formatter using an immutable saved adventure snapshot. Include character identity, all attributes and Nature, genre, premise, chronological chapter/scene headings, every offered option, selected markers, and readable check details. Append a clearly separated pending-state section when necessary; do not duplicate a pending selection or roll. Preserve original generated text and accents; structural headings remain English. Do not substitute memory summaries or include provider configuration.

Use a named `exportHistory()` bridge operation with sender and argument-count validation. Main loads and clones a valid adventure, opens a native save dialog with a sanitized character/date `.md` suggestion, and writes UTF-8 only after confirmation. Return saved/cancelled outcomes and separate write failures. Rely on the native dialog for overwrite confirmation. Reject application save, backup, preference, and credential files as export destinations. Disable export during active generation, replacement, and export; enforce main-side guards too. Freeze the snapshot before the dialog so the document cannot mix turns. A stable recoverable pending state remains exportable.

Markdown is readable without a viewer and needs no rendering library. PDF and HTML would add layout/dependency work beyond the requested transcript.

### Separate next-story preference from saved adventure language

Define `StoryLanguage = 'en' | 'pt-BR'`, validate it in creation input, and save `Adventure.language` before the opening request. Never derive an existing adventure's language from a global preference. Add a small separate versioned `preferences.json` holding `defaultStoryLanguage`, with queued temporary writes. Missing preferences default to English; invalid data and persistence errors are visible.

New Story uses an English / Português two-button radio group with keyboard support and explicit selected state. Settings exposes the same preference as "Language for new stories", allowing changes without replacing the current adventure. Successful selection persists the default; starting snapshots the displayed language and disables changes while submitting. Active story language appears as read-only metadata. This follows the user's decision that language changes affect only new adventures.

### Compatible storage normalization

Keep schema version one and extend the accepted adventure shape with language. Normalize a missing legacy field to `en` at the storage boundary before validation; reject unsupported explicit values. Use normalization consistently in active/backup loading, serialization, and optimistic compare-and-save operations. Loading or exporting does not rewrite old files; the next successful ordinary save writes the explicit field. Test all pending phases and backup recovery to prevent accidental rerolls or false concurrency failures.

### Explicit language through all model requests

Carry adventure language in opening, action assessment/no-check continuation, checked narration, chapter summary, and global summary requests and context. Shared prompt builders instruct English or Brazilian Portuguese for prose, choice text, key facts, and unresolved threads. JSON keys, choice IDs, difficulty, attribute, and outcome identifiers retain their established machine-readable form. Account for language context in budget estimates. Retain the existing instruction to resolve the current action and generate new choices.

Provider switching changes provider/model only. Retry and restore always use the saved adventure language and check. Tests prove propagation and contract stability; a live-model review assesses language quality because schema validation cannot prove prose language.

### Recover space without shrinking reading text

Remove `.titlebar` and its grid row; retain native Windows chrome. Keep a compact sidebar wordmark and smaller dice image, tighter navigation spacing, and responsive sidebar width. Combine story heading, genre, chapter, language, and export action in a wrapping header. At smaller sizes put secondary metadata on a compact second line.

Reduce excess panel padding while keeping current body font sizes, retro assets, and focus outlines. Cap decisions at approximately 35% of workspace height with independent scrolling; keep pending hints, roll summary, and Retry reachable. Record baseline viewport heights before edits and compare the same short-choice fixture afterwards at both supported sizes. Do not gain story space by hiding decisions.

## Risks / Trade-offs

- Models ignore language or repeat choices → explicit shared prompts, adapter payload tests, immediate-choice-update UI checks, and a live English/Portuguese review.
- Normalization breaks optimistic writes → active/backup and pending-state tests that retain source events and rolls.
- Dialog races with progress changes → immutable snapshots, renderer busy state, and main-side operation guards.
- Portuguese choices require more space → wrapping, independent scrolling, and small-window checks with long labels.
- Native dialogs cannot be fully exercised through DOM automation → injected dialog/file tests plus real installed save/cancel checks.

## Migration Plan

1. Retain original save fixtures and capture baseline viewport measurements. Sync/archive the completed baseline before syncing these deltas.
2. Implement compatible language/preferences storage and propagation, then export and compact layout.
3. Run typecheck, focused/full tests, and shell checks for both languages, retries, export, and restoration.
4. Rebuild the installer and verify real export/save/cancel, accented Markdown, legacy restoration, bundled assets, and Quit with isolated profiles. Record live-model review separately from stub results.
5. Retain pre-update saves for rollback: older binaries reject new fields, so restore prior save copies alongside an older binary rather than silently deleting language or progress.
