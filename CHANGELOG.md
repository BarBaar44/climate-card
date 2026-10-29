# Changelog

## v0.1.0

First release. Replaces two mini-graph-cards (inside and outside temperature) with one compact card in the style of the other cards.

### Added
* **Rows:** 1 to 3 places, each with name, humidity, a sparkline of the temperature and the value now with the low and high. Defaults are the living room and outdoor sensors.
* **Scaling:** each row scales to its own data but never to less than `min_span` degrees (4), so a small indoor wobble stays small. `scale: shared` gives every row the same degrees per pixel. `min_span: 0` lets every row fill its height.
* **History** from the recorder (`history/history_during_period`, minimal response), fetched once and again after more than 10 minutes away; new states appended live; the window slides every minute. A quiet sensor keeps its value until its next state.
* Exact low and high with their times in the tooltip.
* Numbers in Home Assistant's language and number format.
* Tap opens more-info on the row's temperature sensor, hold does nothing by default; both configurable, through Home Assistant's own action handler.
* **Visual editor:** three row slots and the graph settings, defaults shown, only changes written, unknown options kept.
* 12 columns by 2 rows (120px); 1 row is 56px, 3 rows 184px. Sparklines line up across rows. Short humidity text below 300px card width, no sparkline below 180px.
