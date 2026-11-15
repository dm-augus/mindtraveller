# Design

## Context

See proposal.md for motivation and the three delta specs for behavior. The Windows application uses React, a sandboxed Electron renderer, validated preload/IPC operations, and atomic JSON saves. Settings currently caps content at 850px. Preferences store only defaultStoryLanguage. Gender is already sent in character context but accepts arbitrary text; saved-adventure validation currently calls the same validator as creation. Twelve individual male/female portrait PNGs exist under src/assets/faces. The sidebar displays dice artwork. Story operations can commit a scene and subsequently fail during summarization.

## Goals / Non-Goals

**Goals:** independent interface language, maintainable translations, compatible character presentation, and local cancellable narration with no extra model calls.

**Non-Goals:** translating saved/generated prose or Markdown exports, cloud speech, voice downloads, speech recognition, audio export, portrait uploads/generation, avatar-derived classes, or editing existing characters. Native operating-system chrome remains in its OS language; application-supplied dialog titles/buttons use the interface locale.

## Decisions

### 1. Translation catalogs and independent preferences

Use typed English and pt-BR catalogs in src/shared/locales, stable message keys, and a shared interpolation function; React consumes a locale context. English defines the required key/parameter shape, and tests require PT-BR parity. Include rule explanations, check labels, form validation, dialogs, feedback, tooltips, and accessible labels. Render canonical enum identifiers through label maps without changing wire values, model IDs, or user text. Generate localized rule explanations from the shared numeric rules while keeping the English LLM rules reference independent of interface locale.

Extend StoryPreferences with interfaceLanguage: 'en' | 'pt-BR' and autoReadStory: boolean. Defaults are en and true, independently of defaultStoryLanguage. Preserve schemaVersion 1 and normalize only absent legacy fields. Keep existing getStoryPreferences/saveStoryPreferences bridge names, but make saves validated nonempty partial patches, read/merge/write atomically within the preference queue. Update all consumers to patch their own fields; never persist a stale complete snapshot. Invalid explicit values and corrupt files remain visible errors. Settings selectors save immediately; apply locale after successful persistence and show localized error feedback if saving fails. Load preferences once before the main screens render to avoid an English flash on a saved Portuguese profile.

Preserve error identity across Electron IPC with a shared success/error result envelope and a preload unwrapping helper that retains existing successful return types. Use stable application error keys plus interpolation parameters for validation and provider/storage/export failures; localize in the renderer. Unknown errors get a localized generic message. Do not match English error strings or expose raw provider output. Main-owned native export dialog strings use the saved interface locale; exported Markdown retains its existing format and original story content.

### 2. Character creation and compatibility

Introduce NewCharacterGender = 'Male' | 'Female' for new setup validation while retaining Character.gender: string for legacy saves. Separate saved-character validation from creation validation so old values such as male, Woman, or other nonempty text remain unchanged. No gender is initially selected; both a canonical gender and a matching avatar are required for new creation.

Add Character.avatarId: AvatarId | null. A shared catalog defines the twelve stable filename stems, gender, and role label keys; renderer imports map these IDs to bundled image URLs. Never accept arbitrary paths/URLs. On first gender selection choose its warrior portrait; changing gender preserves the selected role by selecting the corresponding portrait of the other gender. All six matching portraits remain available as keyboard-accessible radio cards. Portrait role names are display descriptions only, with no class or attribute effects.

Normalize a missing avatarId to null on active/backup reads and compare-and-save snapshots; reject unknown explicit IDs. Keep the selected portrait fixed for the active adventure. The sidebar replaces the dice image when an avatar exists, keeps the dice for no adventure or legacy null portraits, and puts the saved name directly underneath. Wrap long names and use image containment without distortion; a failed image load uses the dice fallback without rewriting the save.

Both providers already receive gender. Add concise shared prompt guidance to consider it in appropriate descriptions, forms of address, and choices as a secondary detail, without restricting roles or altering odds. Use an explicit narrative-character projection to exclude cosmetic avatar identifiers from opening, continuation, and summary requests; do not imply a profession from a portrait filename.

### 3. Windows speech service

Use System.Speech.Synthesis.SpeechSynthesizer through a fixed bundled Windows PowerShell helper. This avoids relying on Electron Web Speech availability or an online provider. A read-only probe confirmed enabled Microsoft Maria Desktop (pt-BR) and Microsoft Zira Desktop (en-US) on this machine outside the restricted tool sandbox; availability on another installation is not assumed. See Microsoft's [installed voice API](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.getinstalledvoices?view=netframework-4.8.1).

The main process owns voice enumeration and exactly one active speech child process. Launch the fixed executable/script with shell execution disabled, windowsHide enabled, no interactive profile/window, and UTF-8 JSON over stdin. Treat all story text as data and use plain-text Speak, never executable command interpolation or SSML. Enumerate enabled voices; select en-US first, then another en culture, or an exact pt-BR voice. Use a deterministic voice-name order if several qualify, default rate/volume, and no voice picker in this version. Missing compatible voices produce a localized nonblocking error, never a different-language fallback. On unsupported platforms expose unavailable playback while preserving the rest of the app.

Expose named getSpeechAvailability, speakSegment({adventureId, segmentId}), stopSpeech(playbackId), and subscribe-to-speech-state operations. Validate IPC sender and payload; main loads the current adventure and derives text/language from the saved segment. The renderer cannot submit arbitrary text, scripts, voice names, or file paths. Start returns a playback ID; trusted state events report speaking/completed/stopped/error for that ID. Subscription returns an unsubscribe function. Serialize replacements, stop the tracked child before a new one starts, and ignore stale completion events. Handle process startup/exit errors and a 10-minute playback watchdog without affecting story state. Cancel on renderer navigation/destruction and application exit as well as explicit Stop; never leave a speech helper running after Quit.

Package the fixed helper via Electron Forge extraResource, outside app.asar, resolving it from process.resourcesPath in packaged builds and a fixed project path in development. Keep its source under src/main/native and test that the installer includes it. Do not silently bypass host execution policies; report helper startup failure as unavailable speech.

### 4. Automatic narration and replay lifecycle

The renderer owns automatic eligibility. Before a generation operation, capture the existing adventure/segment IDs; compare with the resulting saved adventure, including restoration after a summary failure. Only a newly persisted segment from that operation is eligible. Initial restore, UI rerenders, rejected responses, and summary-only retries do not qualify. Track automatically handled (adventureId, segmentId) pairs in memory to prevent replay on rerender. Failed speech does not cause an automatic retry loop; the sound button allows explicit retry. A new app session does not auto-read restored history.

Automatic narration starts only in the story view when enabled. An eligible opening recovered after a summary failure still returns the UI to the story view. Each saved segment has a localized sound-icon Play/Stop button immediately below its narrative and before check metadata. Pass segment IDs, never DOM textContent, so choices/results cannot leak into speech. Disable only controls whose speech language/service is unavailable; story generation remains independent of audio. New playback replaces current playback; submitting a choice, leaving Story, replacement, disabling auto-read, or Quit cancels it. Changing interface locale only relabels controls and does not restart audio. No persistent audio cache or speech data is added to the adventure.

### 5. Responsive Settings

Group interface/story/audio preferences separately from storyteller connection/model controls. Increase the content cap to 1200px and use a two-column layout when the Settings content container is at least 900px wide; otherwise stack groups. Keep provider save behavior separate from immediate application preferences. Verify 760x520, 1200x800, and 1920x1080 in both locales, including long labels, radio-card portraits, long names, visible focus, scroll reachability, and existing story/decision viewport checks.

## Risks / Trade-offs

- Installed voice quality/languages vary -> show availability and missing-voice guidance; document installing a Windows voice rather than downloading one automatically.
- One helper process per playback adds startup overhead -> keep the first version simple and cancellable; voice discovery is cached until Settings refresh or a speech retry.
- Main errors currently travel as English strings -> use typed localized error identities and regression-test bridge callers; preserve secret-safe diagnostics.
- Strict new creation could invalidate old saves -> use separate read/new-creation validators and test all pending phases and backups.
- Model gender adherence is probabilistic -> verify payload/prompt coverage for both adapters and review live examples without claiming semantic guarantees.

## Migration Plan

Normalize old preferences and missing avatar fields in memory; persist additions only on ordinary successful writes. Leave story language, arbitrary saved genders, history, pending turn IDs, summaries, and rolls unchanged. New documents remain schema version 1 with additive fields, following the project's existing normalization approach; older builds may reject the added fields, so use isolated profiles for installer verification. Run the complete automated/typecheck/security/UI suite and isolated installed-app checks, including real English/PT-BR playback and cancellation, before marking implementation complete. Do not alter the active player profile during verification.
