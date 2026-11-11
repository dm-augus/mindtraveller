# Tasks

## 1. Application foundation

- [x] 1.1 Scaffold Electron Forge, TypeScript, React renderer, and Windows build scripts; verify the app opens in development and `typecheck` completes.
- [x] 1.2 Add a sandboxed window, restrictive content security policy, and named preload APIs with validated IPC inputs and sender; verify renderer code cannot access Node or unrestricted IPC.
- [x] 1.3 Define shared adventure, character, choice, check, provider, and pending-turn data types; verify typecheck accepts representative valid states and rejects invalid fixtures.

## 2. Character and D100 rules

- [x] 2.1 Implement theme, identity, Nature, attribute range, and Balanced/Simplified allocation validation; verify focused tests cover both valid methods and invalid budgets or ranges.
- [x] 2.2 Implement difficulty mapping, threshold clamping, application-owned D100 generation, and result records; verify tests cover 0 and 98 limits, inclusive success, and 99/100 failure.
- [x] 2.3 Define the rule text used by prompts and the Rules screen from the agreed English terminology; verify it matches the validated ranges and thresholds in tests or reviewable rule fixtures.

## 3. Durable local state

- [x] 3.1 Implement versioned single-adventure storage with a temporary write and last-known-good recovery; verify tests cover normal save/load, corrupted active data, and failed writes.
- [x] 3.2 Persist completed turns and pending states, including selected action and a completed roll; verify restart tests recover each state without duplicating a choice or rerolling.
- [x] 3.3 Store provider/model settings apart from adventures and protect the OpenAI key with Windows user-bound storage; verify tests confirm adventure files and logs contain no key and Settings cannot read back the full key.
- [x] 3.4 Implement confirmed New Story replacement and cancellation against the saved adventure; verify both confirmation paths preserve or replace the correct state.

## 4. Provider communication

- [x] 4.1 Define provider-independent request/response contracts for opening, action assessment, checked narration, summaries, and model selection; verify schema tests reject malformed choices and check classifications.
- [x] 4.2 Implement Ollama address handling, model discovery, requests, timeout, and failure mapping; verify adapter tests with a local stub cover success, unavailable server, bad model, and timeout.
- [x] 4.3 Implement OpenAI model/key configuration, requests, timeout, and failure mapping; verify adapter tests with a stub cover success, authentication error, inaccessible model, and redacted errors.
- [x] 4.4 Add bounded retries for invalid LLM responses and map exhausted retries to a recoverable application error; verify malformed-response tests leave adventure state intact.

## 5. Story memory

- [x] 5.1 Implement configurable paragraph/choice targets, chapter length, recent-event window, context budget, and summary thresholds; verify the context builder includes the required rules, character, theme, summaries, recent events, and latest decision.
- [ ] 5.2 Implement chapter and global summary updates while retaining source events until commit; verify tests cover chapter boundaries, preservation of key facts, and failure without data loss.
- [ ] 5.3 Implement bounded context selection for long adventures; verify tests show old detail is summarized or omitted while core rules, objectives, and recent events remain.

## 6. Turn orchestration

- [ ] 6.1 Implement opening-story generation and persistence; verify a provider stub yields a premise, narrative, and valid first choices from the selected theme and character.
- [ ] 6.2 Implement choice submission and the no-check continuation path with one pending turn at a time; verify tests cover duplicate clicks, successful commit, and retry after timeout.
- [ ] 6.3 Implement checked turns from validated assessment through saved D100 result to compatible narration; verify tests prove a narration failure or restart reuses the same roll.
- [ ] 6.4 Connect chapter summarization to completed turns and restoreable pending states; verify tests cover summary failure and retry without losing the completed segment.

## 7. Desktop screens

- [ ] 7.1 Build the retro shell, sidebar, story scroll area, decision panel, status bar, and Quit action using the prototype and `src/assets/reference/` as visual references and suitable graphics from `src/assets/branding/`, `src/assets/icons/`, and `src/assets/ui/`; keep labels and controls live, and verify the screens and bundled images render in the Windows app at normal and smaller window sizes.
- [ ] 7.2 Build New Story setup for theme, allocation method and values, name, gender, and Good/Neutral/Bad Nature; verify invalid allocations cannot advance and a valid setup starts generation.
- [ ] 7.3 Build story and choice interaction with pending, retry, and visible difficulty/attribute/roll/threshold/outcome states; verify the checked and no-check flows with a stub provider.
- [ ] 7.4 Build Rules and Settings views, including character details, model selection, protected key entry, and provider errors; verify navigation preserves the active story and no full saved key is displayed.
- [ ] 7.5 Build restore and New Story confirmation UI; verify reopening restores the last adventure and selecting No leaves it unchanged.

## 8. Integrated Windows release check

- [ ] 8.1 Run typecheck and automated tests, then exercise character creation, both provider adapters with stubs, a checked turn, retry, summary, save/restore, and replacement in the running app; verify all paths complete without duplicate decisions or rolls.
- [ ] 8.2 Create a Windows installer with Electron Forge and smoke-test the installed app's launch, bundled UI assets, local save location, restoration, and Quit behavior; verify the package is usable without a separately hosted server.
