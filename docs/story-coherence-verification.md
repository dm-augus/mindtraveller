# Story coherence verification

## Aaron regression correction

The reported continuation copied the preceding farmer's explanation and appended `, choices: [{` inside narrative text. All scene response parsers now reject recognizable leaked response syntax, including incomplete fragments. Both adapters provide corrective guidance within the existing three-attempt retry limit. Repetition checks also reject a complete recent scene of at least 30 normalized words occupying at least 80% of the proposed narrative, ignoring punctuation differences. Short quotations and recaps with substantial new consequences are covered by acceptance tests.

After this correction, typecheck, all 269 tests, strict OpenSpec validation, and diff whitespace checks pass. Regression tests exercise both adapters' checked/no-check regeneration and checked-turn exhaustion/manual retry for duplicated and contaminated output. Evidence: `out/coherence-aaron-tests.log`. No player save was modified; no installer was rebuilt. The live observations below predate this correction, which does not claim to detect arbitrary paraphrases or semantic contradictions.

Verified on 2026-11-15 for the `improve-story-coherence` change.

## Automated and running-app checks

The automated suite covers legacy memory normalization in all five phases, backup recovery, malformed memory rejection, atomic continuation/state saves, summaries, restart, provider switching, player-directed abandonment, and save-failure recovery. Both adapters reject Richter's repeated window scene, add corrective guidance, stop within three attempts, and retain the selected action and saved roll through manual retry. Budget tests cover the exact 6,400-token estimated input boundary, prompt overhead, retry guidance overhead, and requests rejected before transport.

Typecheck, all 261 automated tests, and strict OpenSpec validation pass. The Electron shell smoke check passes with both real adapters using stub transports: objective/state persistence, checked/no-check recovery, summary failure and restart, exports, language, navigation, replacement, screenshots, and Quit. Deliberate provider/save failures in its log exercise recovery. Test cleanup retries and screenshot repaint retries handle transient Windows filesystem/compositor failures without skipping assertions or captures.

Evidence: `out/coherence-tests.log`, `out/coherence-shell.log`, and `out/smoke/`.

## Live Llama 3 8B review

`node scripts/live-coherence-review.cjs` creates isolated profiles and captures request payloads, saved scenes, and Markdown transcripts. It neither uses nor rewrites the active player adventure. The model was the existing local Ollama `llama3:latest`, 8.0B Q4_0, with reported context length 8,192. Requests explicitly specify an 8,192-token window and 1,536 output tokens.

The final prompt review produced four scenes in English and four in Brazilian Portuguese, with four requests per language and no exact duplicated complete narrative. Both retained their original objective throughout. All continuations in these samples were classified as no-check actions; stable checked-roll recovery is established by automated tests rather than these live samples.

- English: Richter follows an artifact lead to Professor Elara, receives a book, and studies it. The objective remains connected to the artifact, but accepting a journey produces another preparation scene. Location is eventually returned as unknown despite earlier context, and current focus can remain generic.
- Portuguese: Richter follows a trading-contract lead and learns about the journey to Eldrador. The original merchant objective remains present, but accepting the contract produces a near-repeat of its explanation, with a closing question removed. The exact-match validator deliberately does not reject paraphrases or partially repeated narratives.

The earlier exploratory run also exposed an English passage in a Portuguese adventure. The final run retained Portuguese throughout, but these small samples do not establish reliable language adherence or semantic coherence. The lightweight checks improve supplied memory and reject normalized exact repeats; they do not guarantee action completion or detect every contradiction. No additional semantic review call has been added.

Final evidence: `out/live-coherence-UG6uMD/review.json` and its `en/` and `pt-BR/` transcripts and requests. Earlier exploratory evidence: `out/live-coherence-IY1j4B/`. No installer was built or installed for this change.
