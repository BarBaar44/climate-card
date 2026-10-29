# Climate Card

![Climate Card](https://raw.githubusercontent.com/BarBaar44/climate-card/main/shot.png)

A compact Lovelace card with one row per place: inside, outside, and optionally a third. Each row shows the name and humidity, a sparkline of the temperature over the last 24 hours, and the temperature now with the low and high. One JavaScript file, no build step, no dependencies, no card_mod, no Jinja.

* **Honest scaling:** each row scales to its own data, but never to less than `min_span` degrees (4 by default). A 1° indoor wobble stays a small wobble; a real drop, such as a window left open, still fills the row. Set `scale: shared` to give every row the same degrees per pixel.
* **History from the recorder**, fetched once when the card loads (and again when the card comes back after more than 10 minutes away, for wall displays and background tabs). After that, new states are appended live, and the window slides every minute.
* **Step data drawn as steps:** a sensor that only reports on change keeps its value until the next state, instead of being drawn as a slope.
* Low and high are exact (from the states, not the drawn line); the tooltip has their times.
* Number format and decimal comma follow your Home Assistant profile.
* 2 rows fit the 120px height of two grid rows (56px each plus the 8px gap); 1 row is 56px, 3 rows 184px. The rows share one grid, so the sparklines line up.
* Below 300px card width, humidity shows as just "55%". Below 180px (6 columns on a phone) the sparkline is left out.

## Install

HACS > three dots > Custom repositories > add `https://github.com/BarBaar44/climate-card`, type **Dashboard**. Install, then reload the browser.

Needs HA 2024.11 or newer.

## Use

```yaml
type: custom:climate-card
grid_options:
  columns: 12
  rows: 2
```

More in [climate-card.yaml](climate-card.yaml).

Or use the card editor: three row slots (name, temperature sensor, humidity sensor, colour) and the graph settings, all with the values in use, defaults included, plus tap and hold actions. A slot without a temperature sensor is no row; the rows after it move up. Only values that differ from the defaults are written to the YAML, and options the editor does not show, such as `grid_options`, are kept.

### Options

| Option        | Default                    |                                             |
| ------------- | -------------------------- | ------------------------------------------- |
| `rows`        | Inside and Outside, see below | 1 to 3 rows                              |
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

The default rows:

```yaml
rows:
  - name: Inside
    temperature: sensor.temperature_living_room_temperature
    humidity: sensor.temperature_living_room_humidity
  - name: Outside
    temperature: sensor.outdoor_temperature
    humidity: sensor.outdoor_humidity
```

When you give `rows`, you give the whole list; it replaces the defaults.

### States

| When                         | Shows                                                    |
| ---------------------------- | -------------------------------------------------------- |
| Temperature known            | value in the row colour, low and high, sparkline with a dot at now |
| Temperature `unknown` or `unavailable` | grey, "Unavailable", the history still drawn, no dot |
| History not allowed or failing | only what arrives live from then on; a warning in the browser console |

## Known limits

* The sparkline averages the states in each of 144 slots (10 minutes in a 24 hour window), so a spike shorter than that is softened in the line. The low and high below the value are exact.
* History comes from the recorder: a sensor excluded from the recorder shows only what arrived since the card loaded.
* Orange text on a white card has low contrast in the light theme. Set `color` to a darker orange if that bothers you.

## Licence

MIT
