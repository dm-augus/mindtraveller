# Tasks

## 1. Adventure language and compatible persistence

- [x] 1.1 Add validated `en` / `pt-BR` language to shared adventure and creation contracts; implement legacy missing-language normalization for active/backup reads and compare-and-save; verify storage tests cover old saves, invalid explicit values, ordinary saves, backup recovery, and every pending phase without changed rolls or lost history.
- [x] 1.2 Implement versioned local default-language preferences with named, validated preload/IPC operations and queued temporary writes; verify tests cover English defaults, persistence across restart, invalid input, write failures, and independence from adventure/provider data.
- [x] 1.3 Add the English / Português button selector to New Story and the shared next-story preference to Settings; snapshot language before opening generation and display it read-only in active story metadata; verify keyboard selection, saved defaults, failure feedback, and that changing the default never mutates the current adventure or bypasses replacement confirmation.

## 2. Language-aware generation

- [x] 2.1 Propagate saved adventure language through opening, assessment, checked narration, chapter/global summary contracts, context builders, and shared prompts; verify both adapter payload tests cover both languages, unchanged JSON/enums, context budget accounting, and the existing instruction to produce new choices after resolving the selected action.
- [x] 2.2 Cover controller restore/retry and provider-switch flows with language fixtures; verify pending opening, assessment, narration, and summary use saved adventure language despite default changes, with stable decisions and rolls; document language behavior and legacy English defaults in a short user guide.

## 3. Complete history export

- [ ] 3.1 Add a pure Markdown transcript formatter for full saved history, character, premise, chapters, all choices with selection markers, checks, and a distinct pending-state section; verify long English/Portuguese fixtures preserve accents and all source scenes without duplicate pending selections/rolls, provider data, or summary substitution.
- [ ] 3.2 Add validated main/preload export orchestration with an immutable snapshot, native save dialog, sanitized `.md` suggestion, protected application-data destinations, busy guards, UTF-8 writing, and saved/cancelled results; verify injected dialog/file tests cover success, cancellation, write failure, no history, active operations, and unchanged adventure/settings bytes.
- [ ] 3.3 Add Export History to the story header with disabled explanations, export busy state, success/error feedback, and safe navigation/replacement behavior while exporting; verify running-app checks cover ready and recoverable pending exports and no extra provider request or reroll; document export content and how to read Markdown as text in the user guide.

## 4. Compact desktop layout

- [ ] 4.1 Capture current narrative viewport heights for the same short-choice fixture at 1200x800 and 760x520; remove the in-app title strip, relocate genre/chapter/language/export into a wrapping story header, and compact sidebar branding/navigation; verify larger narrative viewports at both sizes with native window controls, bundled assets, navigation, status, and version preserved.
- [ ] 4.2 Tune story padding and independently scrollable decision height without shrinking body text; verify screenshots and layout assertions at both supported sizes cover long Portuguese choices, no horizontal overflow, narrative height of at least 100 CSS pixels, reachable pending hints/roll/retry, and visible keyboard focus indicators.

## 5. Integrated and installed release verification

- [ ] 5.1 Run typecheck and the complete automated suite, then extend shell smoke coverage across English/Portuguese creation, both provider stubs, default changes, immediate new-option display, checked/no-check turns, retry, summaries, export, restoration, and replacement; verify no lost history, changed adventure language, duplicate choices, or rerolls and record results.
- [ ] 5.2 Review one English and one Portuguese story with an available live model through opening and a continuation; record prose/option language and scene advancement separately from stub results, including the provider/model used and any observed limitations.
- [ ] 5.3 Rebuild the Windows installer and test the installed app with isolated legacy and Portuguese profiles; verify launch, real native export save/cancel, readable accented Markdown, default persistence, immutable restored language, compact assets/layout, and Quit without a hosted UI server; retain screenshots and verification results.

## Workflow follow-up

- Sync or archive the completed `build-mindtraveller-v01` baseline before syncing this change's deltas; keep its completed implementation tasks unchanged.
- Review and archive this change after its implementation and verification are complete.
