# Changelog

## v0.2.0

### Changed
* **`rows` is now required.** The card no longer falls back to built-in sensors that only exist on one Home Assistant. A config without `rows` shows an error card that says so. **Before updating:** if your config is just `type: custom:climate-card`, add your rows first (see the README).
* The card picker starts the card with your own sensors: an inside and an outside temperature sensor (found by name, else the first two), each with the humidity sensor of the same device.
* The visual editor always writes the rows. Removing every row leaves no rows in the YAML, and the card asks for one.
* The "Unknown option" error lists every known option.

### Docs
* README: the "quiet sensor" note says the line is drawn from 10 minute averages, so a jump shows as a short slope; a "Made with AI" note.

## v0.1.0

First release. Replaces two mini-graph-cards (inside and outside temperature) with one compact card in the style of the other cards.

### Added
* **Rows:** 1 to 3 places, each with name, humidity, a sparkline of the temperature and the value now with the low and high. Defaults are the living room and outdoor sensors (no longer from v0.2.0: `rows` is required).
* **Scaling:** each row scales to its own data but never to less than `min_span` degrees (4), so a small indoor wobble stays small. `scale: shared` gives every row the same degrees per pixel. `min_span: 0` lets every row fill its height.
* **History** from the recorder (`history/history_during_period`, minimal response), fetched once and again after more than 10 minutes away; new states appended live; the window slides every minute. A quiet sensor keeps its value until its next state.
* Exact low and high with their times in the tooltip.
* Numbers in Home Assistant's language and number format.
* Tap opens more-info on the row's temperature sensor, hold does nothing by default; both configurable, through Home Assistant's own action handler.
* **Visual editor:** three row slots and the graph settings, defaults shown, only changes written, unknown options kept.
* 12 columns by 2 rows (120px); 1 row is 56px, 3 rows 184px. Sparklines line up across rows. Short humidity text below 300px card width, no sparkline below 180px.
