# Climate Card: notes for working on this repo

HACS dashboard card (Lovelace) with one row per place (inside, outside, optionally a third): name, humidity, a temperature sparkline, the value now with low and high. Repo `BarBaar44/climate-card`, card file `climate-card.js`, element `custom:climate-card`. Owner: BarBaar44 (Bb). Sister repos with the same conventions: [cat-feeder](https://github.com/BarBaar44/cat-feeder), [espresso-card](https://github.com/BarBaar44/espresso-card), [appliance-card](https://github.com/BarBaar44/appliance-card), [vacuum-card](https://github.com/BarBaar44/vacuum-card), [room-card](https://github.com/BarBaar44/room-card), [tesla-model3-card](https://github.com/BarBaar44/tesla-model3-card).

## Files

| File | Purpose |
|---|---|
| `climate-card.js` | The whole card: plain custom element, no build step, no dependencies. `CLIMATE_DEFAULTS` holds the graph defaults (no rows: `rows` is required), `climateStubRows` picks the card picker's rows from the user's sensors, `CLIMATE_ROW_COLORS` the default colour per row position. |
| `tests/climate-card.test.js` | jsdom tests with a fixed clock and a fake `callWS`: values, low and high, the history request, min_span and shared scaling (measured on the drawn path), flat lines, carried values, the state before the window, live appends, states during the fetch, a failing fetch, unavailable, number format, custom rows, tooltip, actions, re-render rules, refetching, config errors, editor round trips. `npm test`. |
| `hacs.json` | HACS manifest (HA 2024.11+). |
| `README.md` | User docs, also the HACS info page. Keep the option, row and state tables in sync with the code. |
| `CHANGELOG.md` | One `## vX.Y.Z` section per release; the Release workflow uses it as the release notes. |
| `shot.png` | README image, linked by absolute raw URL so it renders in HACS. |
| `climate-card.yaml` | Minimal, full and three-row example configs. |

## The owner's setup

* Inside: `sensor.temperature_living_room_temperature`, `sensor.temperature_living_room_humidity`.
* Outside: `sensor.outdoor_temperature`, `sensor.outdoor_humidity`.
* Dashboard "Home Dashboard" (`/house`), view "Home", sections view, `max_columns: 4`. Seen on desktop, phone and a wall display, light and dark themes. The card replaces two mini-graph-cards (orange `#FFA500` outside, green `#008000` inside).

## Rules to keep

* Scaling (the reason the card exists, Bb chose option C2): each row's range is its drawn data's range, at least `min_span`, centred on the data. `scale: shared` uses the largest such range for every row. Never let a small indoor range fill the row by default.
* Humidity is a number in the row, never a second line in the graph.
* Low and high come from the states (exact), the line from 144 bucket averages; an empty bucket carries the last value (step data). The state before the window counts at the window start.
* History: one `history/history_during_period` call per config (temperature sensors only, minimal response, no attributes), again after more than 10 minutes disconnected, or when the temperature sensors or `hours` change. Live states that arrive during the fetch are kept. A failing fetch never breaks the card.
* Number format from `hass.locale` (`number_format`), times in HA's time zone.
* The rows share one grid (`.rows` with `subgrid` rows), so every sparkline has the same x range. Container queries sit on `ha-card` and change `.rows`: below 300px the short humidity text and a 64px label column, below 180px no sparkline.
* Height: n rows = n grid rows (56px each plus 8px gaps): 56, 120, 184px. Measure in a real browser (Playwright, `ha-card` stub without an inline `display`, 12-column 56px-row grid, 360 and 520px) after any layout change.
* Visual editor (`ClimateCardEditor`, on `ha-form`): three row slots; a slot without a temperature sensor is skipped and the rows after it move up; no rows left means no `rows` in the YAML (the card then shows its "rows is required" error). Rows always written; row colour only when it differs from the default for its position; other options only when not default; unknown keys kept.
* The card never hardcodes service calls: tap and hold go through `hass-action` with the row's temperature sensor.
* Re-render only when one of the card's own entities changes, plus the 1 minute tick. DOM built once per config, updated in place.
* The whole file sits in one block scope so its top-level names cannot clash with sister cards loaded as classic scripts; `const VERSION` stays on its own line for the Release workflow.

## Releasing

1. Changes go through a PR (branch plus PR via `gh api`), never straight to `main`. Bb merges.
2. Bump `VERSION`, add the CHANGELOG section (check `git ls-remote --tags` first; never add to a tagged section), check Validate is green.
3. Bb pushes the `vX.Y.Z` tag. **Never tag or release without the owner's explicit go.** Claude sessions here cannot push tags or create releases anyway.
