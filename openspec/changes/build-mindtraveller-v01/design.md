# Design

## Context

See [proposal.md](proposal.md) for the product motivation. This is a greenfield repository: it contains OpenSpec configuration, the initial requirements draft, the Portuguese rules source, and a visual prototype, but no application code or existing save format. The delta specs define the behavior of the first Windows release.

## Goals / Non-Goals

**Goals:**

- Keep story UI, authoritative game logic, persistence, secrets, and provider communication in clear boundaries.
- Make a selected action and its D100 result recoverable across errors and restarts.
- Support both LLM providers through the same story contracts and context builder.
- Produce a usable Windows desktop package without tying game logic to Windows UI code.

**Non-Goals:**

- Deterministic prose from an LLM or a guarantee that every model will follow instructions perfectly.
- A general plugin system for providers or rules.
- Cloud saves, accounts, multiple save slots, auto-updates, or a public distribution pipeline.

## Decisions

### 1. Electron application boundary

Use TypeScript in an Electron main process, a sandboxed renderer, and a narrow preload bridge. The main process owns file access, provider requests, secrets, and D100 generation. The renderer owns screens and presentation state, receiving only validated data and invoking named operations through the bridge. Keep context isolation enabled, Node integration disabled in the renderer, a restrictive content security policy, and no remote content in the game window. Validate IPC inputs and sender identity. This follows [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [context isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation).

For the renderer, use React with TypeScript and CSS to manage the multi-screen story, settings, rules, and creation flows. Use the reference PNG for layout and visual direction; recreate controls as real UI elements rather than displaying the mockup as a bitmap. Alternative: plain DOM code would reduce dependencies but make the screen and pending-turn state harder to maintain.

The supplied asset pack is stored in `src/assets/`: `branding/` contains the logo and dice artwork, `icons/` contains menu and status icons, `ui/` contains extracted controls and reusable textures, and `reference/` contains the original screen and a style guide. Bundle suitable images with the renderer and use the reference images only as visual guidance. Some extracted images contain fixed sample text or drawn window controls, and the transparent icon variants have approximate background removal. Keep interactive controls, story text, choices, status, and version as live UI so they remain accurate and readable. The pack does not supply font files.

### 2. Domain modules and provider contract

Keep character validation, action resolution, turn orchestration, context construction, summarization, persistence, and provider adapters separate from Electron UI components. Provider adapters expose a common set of operations: discover models where supported, generate an opening, assess/continue an action, narrate a resolved check, and summarize memory. Responses use validated structured data for check classification and choices. Invalid or incomplete output is retried a bounded number of times, then surfaced as a recoverable error.

Alternative: provider-specific story flows would simplify the first adapter but make Ollama and OpenAI behavior drift. A shared contract keeps gameplay consistent while allowing transport differences.

### 3. Turn and roll lifecycle

Persist the selected choice before contacting the LLM. Ask the LLM whether the action needs a check. For no-check actions, the response can include the next narrative and choices in the same call. For a check, accept only a known difficulty and attribute, calculate the threshold in application code, generate one D100 value using the runtime's secure random source, and persist the roll and outcome before requesting narration. Pass the authoritative result to the narration request. The model never supplies a die value. Commit the new segment and choices together after validation. Display a check record alongside that segment.

Represent progress with explicit states such as `ready`, `pending-assessment`, `pending-narration`, and `pending-summary`. Each pending state has a stable turn identifier. Retry starts from the saved state: assessment can repeat before a roll, but narration always reuses an existing roll. If narration contradicts the authoritative result, reject it and retry or surface an error rather than silently changing the result. Alternative: one call that asks the LLM to roll would be simpler but could not reliably enforce the probability rules or stable retries.

### 4. Character and rules representation

Store attributes as named integers and validate final allocations from zero: Balanced requires the sum of positive final values to be 5 and the absolute sum of negative final values to be 2; Simplified requires 3 positive points and no negative values. Keep difficulty base thresholds and attribute ranges in one domain rules module used by both validation and the Rules screen. Use English UI labels, including Good, Neutral, and Bad; translate the Portuguese rule source into those labels. Nature is prompt context for suggestions and narrative reaction, never a numeric modifier or a choice lock.

The source rules specify an upper threshold of 98 but no lower bound. Clamp at 0 as well so very hard checks with a negative modifier are explicit automatic failures, rather than comparing a die to a negative number.

### 5. Adventure and settings storage

Store one versioned adventure document under an application-specific directory within Electron's `userData` path, with a last-known-good backup. Write a temporary document and replace the active document only after serialization succeeds; recover from the backup if the active document is corrupt. The saved document contains character, theme, narrative segments and choices, check records, summaries, and pending-turn state. It never contains the OpenAI key. Surface save failures immediately. See [Electron's userData path guidance](https://www.electronjs.org/docs/latest/api/app).

Store provider and model settings separately. Protect a saved OpenAI key using Electron's asynchronous `safeStorage` API on Windows; keep only encrypted bytes at rest and do not send the saved key back to the renderer. If secure storage is unavailable, decline to persist the key and ask the player to enter it for the session. The [Electron safeStorage documentation](https://www.electronjs.org/docs/latest/api/safe-storage) describes the Windows user-bound protection and current asynchronous API. Alternative: placing the key in the adventure JSON would be simpler but would expose it through ordinary save inspection and copies.

### 6. Context and summarization

Build each request from stable rules, theme and character, the global summary, relevant chapter summaries, a configurable recent-event window, and the latest decision or check result. Estimate request size conservatively when a provider does not report tokens. Truncate lower-priority old detail before core rules, active objectives, or recent events. Make paragraph target, choice target, chapter length, recent-event count, context budget, and summary thresholds internal configuration values.

At a chapter boundary, preserve source events until a chapter summary and updated global summary are both committed. Summarization uses the selected provider/model through the same adapter. A failed summary keeps its source and prior summaries and blocks unsafe pruning; the player can retry. Alternative: sending the full transcript on every turn would be simpler but conflicts with long-adventure context limits.

### 7. Windows packaging and verification

Use Electron Forge to package a Windows installer and test the installed build as well as the development build. [Electron's packaging guide](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging) uses Forge for distributables. Keep game and provider modules platform neutral so later packaging for macOS or Linux does not require a gameplay rewrite. Use focused domain tests for allocation, threshold boundaries, state transitions, context trimming, and save recovery; use adapter tests with stubbed provider responses; exercise the main setup and play flow in the packaged Windows app.

## Risks / Trade-offs

- **LLM output violates the requested schema or narrates the wrong outcome** -> validate structured output, retry a limited number of times, and keep the pending turn recoverable.
- **Two LLM calls for checked actions add latency, especially with local models** -> combine no-check assessment and continuation in one response; show progress while a check is narrated.
- **A crash occurs during a save** -> keep a backup, write a temporary document, and restore the last valid state. Never reroll a persisted check.
- **Chapter summarization omits important facts** -> retain recent detail, explicitly request unresolved objectives and consequences, and keep source events until summary commit.
- **The player's chosen model has a smaller context window or weak structured output support** -> use configurable budgets, conservative sizing, validation, and actionable errors.
- **Unsigned Windows installers can trigger operating system trust warnings** -> support local v0.1 packaging first; public distribution and signing credentials require a later release decision.

## Migration Plan

There is no existing application data to migrate. Start with a versioned v0.1 save format and reject or recover invalid saves without silently overwriting them. Create and smoke-test a Windows package after the main flows pass. Rollback is removal of the new application; local save data remains in the user's application data directory unless the player explicitly replaces the adventure.
