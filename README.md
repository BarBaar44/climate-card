# Climate Card

![Climate Card](https://raw.githubusercontent.com/BarBaar44/climate-card/main/shot.png)

A compact Lovelace card with one row per place: inside, outside, and optionally a third. Each row shows the name and humidity, a sparkline of the temperature over the last 24 hours, and the temperature now with the low and high. One JavaScript file, no build step, no dependencies, no card_mod, no Jinja.

* **Tall layout:** at its default size (one grid row more than there are rows: 184px for two) each sparkline gets more height, a time axis (00:00, 06:00, 12:00, 18:00) with faint lines through every row, open circles where the low and the high happened, and the trend over the last 3 hours under the value, such as "−2,5° in 3 h". The card measures its own height, so resizing it in the dashboard switches between tall and compact.
* **Honest scaling:** each row scales to its own data, but never to less than `min_span` degrees (4 by default). A 1° indoor wobble stays a small wobble; a real drop, such as a window left open, still fills the row. Set `scale: shared` to give every row the same degrees per pixel.
* **History from the recorder**, fetched once when the card loads (and again when the card comes back after more than 10 minutes away, for wall displays and background tabs). After that, new states are appended live, and the window slides every minute.
* **A quiet sensor keeps its value:** a sensor that only reports on change keeps its value until its next state, instead of being drawn as a slope across the gap. The line is drawn from 10 minute averages (at 24 hours), so a sudden jump shows as a short slope over one slot.
* Low and high are exact (from the states, not the drawn line); the tooltip has their times.
* Number format and decimal comma follow your Home Assistant profile.
* **Sizes** (grid rows are 56px plus an 8px gap): by default 2 rows take 3 grid rows (184px), 3 rows take 4 (248px), 1 row takes 2 (120px), all in the tall layout. Make the card one grid row smaller for the compact layout: 2 rows in 120px, 3 rows in 184px, 1 row in 56px. The rows share one grid, so the sparklines line up.
* Below 300px card width, humidity shows as just "55%" and the time axis labels only 00:00 and 12:00. Below 180px (6 columns on a phone) the sparkline is left out.

## Install

HACS > three dots > Custom repositories > add `https://github.com/BarBaar44/climate-card`, type **Dashboard**. Install, then reload the browser.

Needs HA 2024.11 or newer.

## Use

```yaml
type: custom:climate-card
rows:
  - name: Inside
    temperature: sensor.living_room_temperature
    humidity: sensor.living_room_humidity
  - name: Outside
    temperature: sensor.outdoor_temperature
    humidity: sensor.outdoor_humidity
grid_options:
  columns: 12
  rows: 3
```

More in [climate-card.yaml](climate-card.yaml).

Or add it from the card picker: it starts with an inside and an outside temperature sensor of your own (found by name, with the humidity sensor of the same device), which you can change in the card editor. The editor has three row slots (name, temperature sensor, humidity sensor, colour) and the graph settings, all with the values in use, defaults included, plus tap and hold actions. A slot without a temperature sensor is no row; the rows after it move up. The rows and the values that differ from the defaults are written to the YAML, and options the editor does not show, such as `grid_options`, are kept.

### Options

| Option        | Default                    |                                             |
| ------------- | -------------------------- | ------------------------------------------- |
| `rows`        | required                   | 1 to 3 rows, see below                      |
| `hours`       | `24`                       | hours shown, 1 to 168                       |
| `min_span`    | `4`                        | smallest range a row is scaled to, in the sensor's degrees. `0`: every row fills its height |
| `scale`       | `own`                      | `own`: each row its own range (at least `min_span`). `shared`: the same range for all rows, the largest one |
| `decimals`    | `1`                        | 0 to 3                                      |
| `tap_action`  | `more-info`                | on the row's temperature sensor             |
| `hold_action` | `none`                     | on the row's temperature sensor             |

A misspelled option or row key shows an error card instead of being ignored.

### Rows

| Key           |                                                              |
| ------------- | ------------------------------------------------------------ |
| `temperature` | required: a sensor with a numeric state                      |
| `name`        | shown name. Left out: the sensor's friendly name             |
| `humidity`    | optional: shown as "55% humidity". Left out or `null`: no humidity line |
| `color`       | line, fill and value colour, any CSS colour or theme variable. Default by position: green, orange, blue (`--green-color`, `--orange-color`, `--blue-color`) |


### Layouts

| Height per row (next to an 18px time axis) | Layout |
| ------------------------------------------ | ------ |
| 66px or more (2 rows at 184px, 3 at 248px, 1 at 120px) | **tall:** taller sparkline, time axis, low and high marked on the line, 3 hour trend, 24px value |
| less (2 rows at 120px, 3 at 184px, 1 at 56px) | **compact:** 36px sparkline, value with low and high |

The time axis ticks follow `hours`: every hour up to 6, every 3 hours up to 12, every 6 hours up to 36, else midnights with the weekday. The trend compares the temperature now with the last state 3 hours ago, at the card's `decimals`; it is left out until the history reaches back that far.

### States

| When                         | Shows                                                    |
| ---------------------------- | -------------------------------------------------------- |
| Temperature known            | value in the row colour, low and high, sparkline with a dot at now (tall: also the trend and the low and high marked on the line) |
| Temperature `unknown` or `unavailable` | grey, "Unavailable", the history still drawn, no dot |
| History not allowed or failing | only what arrives live from then on; a warning in the browser console |

## Known limits

* The sparkline averages the states in each of 144 slots (10 minutes in a 24 hour window), so a spike shorter than that is softened in the line. The low and high below the value are exact.
* History comes from the recorder: a sensor excluded from the recorder shows only what arrived since the card loaded.
* Orange text on a white card has low contrast in the light theme. Set `color` to a darker orange if that bothers you.

## Made with AI

This card was written with the help of Claude, Anthropic's AI assistant, and is in daily use on my own dashboard. Issues and pull requests are welcome.

## Licence

MIT
