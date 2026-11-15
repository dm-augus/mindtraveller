# Release verification

## Automated and running-app checks

Typecheck and the full automated suite pass (235 tests). The shell smoke check covers Portuguese creation, English creation through the running app bridge, both stubbed providers, default changes, fresh decision labels, checked/no-check turns, retries, summaries, export, restoration, replacement, compact layout, and Quit. Stub errors are intentional recovery checks. Evidence: `out/release-tests.log`, `out/release-shell.log`, and `out/smoke/`.

## Live model review

Reviewed on 2026-11-14 using local Ollama `llama3:latest` (8B Q4_0), separately from stubs. `node scripts/live-language-review.cjs` uses isolated adventures without modifying the active player save.

- English: premise, opening, and options were English. Selecting the forest trail advanced from the village to a clearing with an ancient whispering tree; the next options concerned touching the tree, listening, and checking for danger.
- Brazilian Portuguese: premise, opening, and options were Portuguese, with accents preserved. Selecting investigation at court produced information about the missing king and sacred lake; the next options concerned the lake, further investigation, and preparing at the village.
- Both continuations retained application-owned checks and produced different options. The model delivered single paragraphs despite a multi-paragraph target and chose debatable check classifications for investigative/travel actions. This sample verifies observed language and advancement, not universal adherence or long-term narrative quality.

Evidence: the opening and continuation JSON files under `out/live-language-review/`.

## Installed Windows package

`npm run make` produced `out/make/squirrel.windows/x64/Mindtraveller-0.1.0 Setup.exe`. Silent installation succeeded, and the installed `app.asar` SHA-256 matched the packaged archive: `42106FF15EB9656847FBCA6BBE352BB736F33BB3F1E32C06E81E40EDF762F31F`.

`scripts/installed-smoke.cjs` verified four launches across isolated legacy English and Portuguese profiles. It checked bundled images/backgrounds, restoration, persisted Portuguese default independent of an English adventure, unchanged save bytes, compact chrome, and Quit. Real Windows Save and Cancel actions were driven through the identified native controls; exported Portuguese preserved accents. This test uses unique suggested filenames in the native dialog's current folder; confirmed export locations are recorded in `out/installed-smoke/result.json`, and copies are retained as `native-en.md` and `native-pt-BR.md` in that directory. No hosted UI server was used.

Evidence includes `out/release-make.log`, `out/installed-smoke/result.json`, and language-specific launch screenshots. Live-model behavior is reviewed separately above; installed export/restoration checks do not depend on a model.
