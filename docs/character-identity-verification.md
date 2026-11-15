# Character gender and portrait verification

Scope: tasks 2.1–2.3 of `add-interface-localization-avatars-and-narration`, verified on Windows on 2026-11-15. Speech and the broader Settings redesign remain pending.

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: 303 passed, no failures or skipped tests.
- `npm run security:smoke`: passed for the renderer sandbox, preload bridge, trusted IPC, and CSP.
- `npm run ui:smoke`: passed using isolated profiles and both provider stubs. Screenshots are generated under `out/smoke/`.
- `openspec validate add-interface-localization-avatars-and-narration --strict`: passed.

Identity tests cover the twelve catalog entries, creation rejection before generation/writes, paths/unknown IDs/mismatched gender, and legacy identity preservation through all five saved phases, active/backup reads, and compare-and-save. Missing legacy avatar fields normalize to null in memory; loading alone leaves file bytes unchanged. Existing free-text gender, history, and saved rolls remain intact.

The Electron check exercises native radio keyboard behavior, initial Warrior selection, role-preserving gender changes, all twelve bundled portrait images, failed-image fallback without save writes, portrait recovery after renderer reload, and the selected identity through navigation, provider changes, generation failure/retry, summary failure/retry, and restoration. A 160-character name wraps in a scrollable area below the portrait; navigation and footer remain within the sidebar at 760×520. The name can receive keyboard focus for scrolling and exposes its full text as a tooltip. English/PT-BR catalog parity and the existing locale/story-language smoke matrix also pass.

Follow-up presentation checks cover Settings, Rules, and New Story at 760×520, 1200×800, and 1920×1080 in both locales. Each screen fills the available content width without horizontal overflow. Settings stacks preferences and provider controls below 900px of content width and places them side by side above it; Save remains reachable by scrolling. The portrait picker retains localized accessible radio labels while displaying images without class captions, using six columns on wide screens. Screenshots are saved as `out/smoke/full-width-*.png`.

Provider payload tests cover both Ollama and OpenAI, both canonical genders, and English/PT-BR for opening, checked/no-check continuation, chapter/global summary, automatic malformed-output retries, and controller recovery after restart/provider changes. They assert gender is retained and avatar IDs/filenames are absent. All six roles produce identical narrative requests for a given identity, with unchanged attributes and saved source documents. Checked narration retains the authoritative check and roll. The shared prompt treats gender as secondary wording context and explicitly excludes gender-based abilities, role restrictions, or odds changes.

## Live model review (separate from payload assertions)

Run `npm run build:main` followed by `node scripts/live-gender-review.cjs` with the existing local `llama3:latest` model available. This creates an isolated directory under `out/live-gender-*`, capturing model metadata, outgoing requests, saved histories, and `review.json`. It does not download a model or touch the active player profile.

Reviewed run: `out/live-gender-U8ks4p/`, Ollama `llama3:latest`, 8.0B Q4_0, digest `365c0bd3c000a25d28ddbf732fe1c6add414de7275464c4e4d1c3b5fcb5d8ad1`. Both cases used the same name (Alex), attributes, nature, theme, and Portuguese story language. Each generated an opening and one continuation in two requests, without a check or retry.

| Saved gender | Observed wording | Continuation observation |
| --- | --- | --- |
| Male | Opening: “um jovem cavaleiro”, “sentado”; continuation: “decidido”, “recebido” | Reached the selected village and received a farmer's response. |
| Female | Opening: “rodeada”; continuation used neutral “você” | Refused the messenger as selected, but also opened/retained the package and offered delivery again. This is a narrative consistency limitation. |

All four captured requests retained the selected gender and omitted portrait data. These examples demonstrate gender-aware wording in this run; they do not establish a semantic guarantee or a controlled comparison of plot choices. Automated checks cover the contract and authoritative mechanics; this live run covers only one model and Portuguese wording. No installer or actual speech verification was performed for these tasks.
