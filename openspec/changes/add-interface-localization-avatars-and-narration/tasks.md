# Tasks

## 1. Independent preferences and interface translation

- [x] 1.1 Extend application preference types, normalization, and queued partial-update persistence for interfaceLanguage and autoReadStory; update existing story-language consumers and verify defaults, legacy documents, concurrent updates, invalid fields, failed writes, restart, and unchanged adventure/provider data with preference tests.
- [x] 1.2 Add typed editable English/PT-BR catalogs, interpolation, and locale context; introduce stable application error identities and a main/preload result envelope without changing successful API return types; verify catalog/parameter parity, localized validation and IPC errors, unknown-error fallback, and secret-safe diagnostics.
- [x] 1.3 Localize all screens, rule explanations, check display, status/feedback, confirmations, accessibility labels, and app-owned native dialog strings; add interface-language Settings controls, document catalog editing and independent language settings, and verify immediate persisted switching, failed-selection recovery, both UI/story-language combinations, unchanged prompts, and unchanged Markdown export contents.

## 2. Character gender and portraits

- [x] 2.1 Add the twelve-entry avatar catalog, canonical new-character gender validation, and nullable saved avatar IDs; separate legacy-save identity validation from creation rules and verify unknown/path/mismatched avatar rejection, arbitrary legacy gender preservation, active/backup reads, compare-and-save, and all pending phases without changed history or rolls.
- [x] 2.2 Replace gender text entry with localized radio buttons, add the matching six-portrait picker and role-preserving gender changes, and show the selected portrait/name in the sidebar; document legacy fallback and cosmetic-only roles and verify keyboard use, default warrior selection, long names, failed-image fallback, restart/navigation/retry persistence, and bundled asset loading.
- [x] 2.3 Add secondary gender guidance to shared LLM prompts and project cosmetic avatar fields out of narrative character context; verify both adapters carry canonical gender for opening/continuation and retries without changing odds or sending avatar filenames, and record a focused live-model review of gender-aware wording separately from automated payload checks.

## 3. Local Windows speech

- [ ] 3.1 Implement the fixed Windows speech helper and main-owned voice/playback service, with hidden shell-free process launch and JSON stdin, deterministic language-matched voices, cancellation, process cleanup, watchdog, and generic error codes; document voice availability and verify plain-text handling of quotes/metacharacters/accents, missing voices, helper failures, replacement races, unsupported platforms, and stale completions using injected process tests.
- [ ] 3.2 Add validated availability/start/stop/state-event preload contracts keyed by saved adventure/segment IDs; verify trusted sender checks, arbitrary text/path rejection, narrative-only source selection, listener disposal, no story writes or provider calls, renderer reload/destruction, and cancellation on application exit with bridge/security tests.
- [ ] 3.3 Add auto-read Settings controls and per-segment sound-icon Play/Stop buttons, with operation-scoped new-segment eligibility; document playback behavior and verify opening/checked/no-check narration, committed scenes followed by summary failure, no speech on restore/rejected output/summary-only retry, no double playback on rerender, disabled auto-read with manual replay, missing-voice feedback, navigation/choice/replacement cancellation, and language independent of interface locale.

## 4. Responsive presentation

- [ ] 4.1 Rework Settings into preference and provider groups with a 1200px cap and two columns above 900px content width; verify screenshots and keyboard/scroll assertions at 760x520, 1200x800, and 1920x1080 in both locales, including long Portuguese labels, avatar/name presentation, sound controls, and existing narrative/decision viewport regressions; document the layout behavior.

## 5. Integration and packaged verification

- [ ] 5.1 Run typecheck, the complete automated suite, security smoke, UI smoke, and strict OpenSpec validation; exercise the locale/story-language matrix with both provider stubs across restart, generation failures, summaries, export, and replacement, and record that portraits/preferences/audio never change decisions, source text, or saved rolls.
- [ ] 5.2 Bundle the native speech helper outside app.asar through Forge extraResource, build the Windows installer, and verify the installed app with isolated legacy/new profiles: language persistence, matching portraits/name, actual en-US/pt-BR playback, replay/Stop/Quit, helper cleanup, native export, and missing-voice handling; retain evidence and document observed voice/model limitations without changing the active player profile.

## Workflow follow-up

- Review and archive this change only after implementation and verification are complete.
- Reconcile the completed baseline, language/layout, and coherence changes before syncing overlapping specs; keep their completed task histories unchanged.
