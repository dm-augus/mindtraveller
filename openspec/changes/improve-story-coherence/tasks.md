# Tasks

## 1. Durable story memory

- [x] 1.1 Add objective/state types, save normalization, and validation; verify legacy active/backup saves, malformed fields, read-only restoration, and pending-roll preservation with storage tests.
- [x] 1.2 Extend provider contracts, schemas, prompts, controller commits, and summaries for objective/state; update fixtures and documentation and verify atomic state persistence, language, player focus, summaries, restart, provider changes, and failed saves.

## 2. Fresh continuations

- [x] 2.1 Reject normalized recent narrative duplicates in both adapters with corrective bounded retries and a controller guard; verify Richter regression, changed consequences for repeated actions, exhaustion, unchanged normal call counts, and stable checked rolls through automatic/manual retries.

## 3. Ollama budget

- [x] 3.1 Configure explicit context/output windows, complete-message budget checks, and earlier summary thresholds; document context inspection and verify payload boundaries, retry guidance overhead, and recoverable oversized pending turns.

## 4. Integration verification

- [x] 4.1 Run typecheck, the full automated suite, OpenSpec strict validation, and shell smoke checks; review isolated English/Portuguese multi-turn sequences with the available Llama 3 8B model and record observed continuity and limitations without touching the player profile.

## 5. Aaron continuation regression

- [x] 5.1 Reject response-field syntax leaked into narrative and substantial recent scenes copied with small additions; verify both adapters regenerate within the existing limit, retain saved rolls on exhaustion, accept legitimate new consequences, and pass typecheck and the full suite without touching player saves.

## Workflow follow-up

- Review and archive this change separately after implementation verification.
