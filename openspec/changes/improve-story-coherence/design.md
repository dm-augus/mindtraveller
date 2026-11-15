# Design

## Context

See proposal.md for motivation. Context already contains premise and summaries. Structured output parsers currently validate shape and the outcome enum; adapters retry contract errors at most three times. Save transitions use compare-and-save with a last-known-good backup.

## Goals / Non-Goals

**Goals:** explicit durable memory, atomic accepted state, inexpensive repeated-scene detection, and bounded provider inputs.

**Non-Goals:** semantic model review on every turn, an objective editor, a settings redesign, or an installer release.

## Decisions

- Add nullable `mainObjective` and `storyState` to schema version 1. A scene state has nullable `location` and `currentFocus`, plus nonempty `situation`. Opening responses require both fields; continuations require state only. The application preserves the opening objective. This avoids letting summaries or continuations quietly rewrite the original goal.
- Normalize only missing save fields during document parsing, using the premise (or first narrative) and latest narrative. Pending openings retain null memory. Explicit invalid fields remain errors. Normal reads never rewrite files.
- Include memory early in every context. Send parsed context in message JSON instead of a nested escaped string. Prompts distinguish original objective, player-selected focus, and established state, and require the selected action's consequences before new choices.
- Reject normalized exact matches against the latest six scenes inside each adapter's existing retry loop, with a specific duplicate error and fixed corrective guidance. Carry local recent-narrative validation metadata independently of the configurable context selection, without duplicating it in provider messages. Keep controller validation as a final guard for custom providers. Atomic turn commits accept state together with the scene. No heuristic similarity threshold or per-turn judge is used.
- Request Ollama `num_ctx=8192`, `num_predict=1536`; estimate complete serialized messages with the existing conservative UTF-8 byte heuristic and reserve 256 tokens. A source-context cap of 5000 and summary thresholds of 3000/4000 provide prompt headroom. Check again after adding retry guidance. Oversized mandatory context fails visibly instead of being truncated.

## Risks / Trade-offs

- State and prose can still contradict each other -> prompts, strict structure, deterministic duplicate checks, and recorded live-model review; do not claim semantic guarantees.
- Extra state increases generated tokens -> compact fields and no additional normal-path calls.
- Token estimates are approximate and hardware/model context support varies -> safety margin, explicit request options, and document inspection with `ollama ps`.
- Legacy objective fallback can be verbose -> preserve source text instead of inventing facts or invoking generation during restoration.

## Migration Plan

The Aaron regression adds narrative-field syntax validation to all scene response parsers, with a fixed corrective retry message. In addition to normalized exact matching, the repeat guard compares punctuation-insensitive text: a complete recent scene of at least 30 words occupying at least 80% of the new text is rejected. This narrowly catches copies padded with small additions while allowing short quotations and substantial new consequences; it does not attempt semantic similarity detection. Current player saves are not rewritten or repaired by this correction.

Normalize old documents in memory and persist new fields on the next ordinary save, including backups and compare-and-save snapshots. Keep pending turn identities and rolls unchanged. Older application builds may reject documents containing new fields; retain normal backup protection and avoid modifying the active player profile during verification.
