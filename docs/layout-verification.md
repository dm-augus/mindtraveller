# Compact layout verification

The shell smoke test captured the same three-choice opening before and after the layout changes, using an isolated profile and native Windows frames. Window dimensions below include native chrome; measurements use the renderer's narrative viewport in CSS pixels.

| Window | Before | After | Story font | Choice font |
| --- | ---: | ---: | ---: | ---: |
| 1200 × 800 | 200 | 457 | 17px | 16px |
| 760 × 520 | 186 | 204 | 16px | 14px |

The narrative scroller now fills the available story panel. The duplicated in-app title strip is removed, the sidebar is narrower with smaller artwork, and genre, chapter, language, and export share a wrapping heading. Native window controls remain unchanged.

The long Portuguese fixture exercises four multiline choices in both ready and pending-narration states. Narrative heights are 392px and 194px at the respective sizes, above the 100px minimum. Assertions check independent vertical decision scrolling, no horizontal overflow, complete labels inside buttons, visible keyboard focus, reachable pending hints/roll/retry, and a visible story heading. Existing checks still cover navigation, assets, restoration, export, and Quit.

Run `npm run ui:smoke` to reproduce. The baseline is stored in `docs/layout-baseline.json`. Generated evidence appears under `out/smoke/`:

- `layout-after.json` and `layout-long-choices.json`
- `layout-short-choices-1200.png` and `layout-short-choices-760.png`
- `layout-portuguese-ready-1200.png` and `layout-portuguese-ready-760.png`
- `layout-portuguese-pending-narration-1200.png` and `layout-portuguese-pending-narration-760.png`

Before screenshots from this implementation session are retained as `layout-before-1200.png` and `layout-before-760.png`. Measurements can vary with display scaling; compare runs on the same Windows display configuration.
