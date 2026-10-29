/*
 * Climate Card
 * A compact Lovelace card with one row per place (inside, outside, ...):
 * name and humidity, a sparkline of the temperature over the last hours,
 * and the temperature now with the window's low and high.
 *
 * Scaling: each row scales to its own data, but never to less than
 * `min_span` degrees, so a small indoor wobble stays small and a real drop
 * still fills the row. `scale: shared` gives every row the same degrees per
 * pixel instead.
 *
 * History comes from the recorder once (and again after the card has been
 * away for a while); after that new states are appended live.
 *
 * Tap and hold go through Home Assistant's own action handler (hass-action);
 * the card never hardcodes a service call.
 *
 * https://github.com/BarBaar44/climate-card  (MIT)
 */

// Everything sits in one block so the top-level names cannot clash with the
// sister cards when the files are loaded as classic scripts.
{
const VERSION = "0.2.0";

const CLIMATE_HOLD_MS = 500;
const CLIMATE_MOVE_PX = 10;
const CLIMATE_TICK_MS = 60000; // the window slides without a state change
const CLIMATE_REFETCH_MS = 600000; // away longer than this: fetch the history again
const CLIMATE_BUCKETS = 144; // points drawn per sparkline
const CLIMATE_MAX_ROWS = 3;

/* Default line colour per row position. */
const CLIMATE_ROW_COLORS = [
  "var(--green-color, #4caf50)",
  "var(--orange-color, #ff9800)",
  "var(--blue-color, #2196f3)",
];

const CLIMATE_DEFAULTS = {
  hours: 24,
  min_span: 4,
  scale: "own",
  decimals: 1,
};

const CLIMATE_ROW_KEYS = ["name", "temperature", "humidity", "color"];
const CLIMATE_BAD = ["unknown", "unavailable", "none", ""];
const climateNum = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));
const climateId = (v) => typeof v === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(v);
const climateState = (s) => (!s || CLIMATE_BAD.includes(String(s.state).trim().toLowerCase()) ? null : climateNum(s.state));

/*
 * Rows for a new card, from the sensors this Home Assistant has: an inside and
 * an outside temperature sensor (by name) or else the first two, each with a humidity sensor
 * of the same device when there is one. No temperature sensor: one row to fill in.
 */
const climateStubRows = (hass) => {
  const states = (hass && hass.states) || {};
  const ents = (hass && hass.entities) || {};
  const of = (cls) => Object.keys(states).filter((id) => id.startsWith("sensor.")
    && (states[id].attributes || {}).device_class === cls && climateState(states[id]) !== null).sort();
  const outdoor = (id) => /outdoor|outside|buiten/i.test(`${id} ${(states[id].attributes || {}).friendly_name || ""}`);
  const all = of("temperature");
  const inside = all.filter((id) => !outdoor(id));
  const outside = all.filter(outdoor);
  const temps = [inside[0], outside[0]].filter(Boolean);
  for (const id of all) if (temps.length < 2 && !temps.includes(id)) temps.push(id);
  if (!temps.length) return [{ temperature: "sensor.temperature" }];
  const hums = of("humidity");
  const device = (id) => (ents[id] || {}).device_id || null;
  return temps.map((t) => {
    const row = { temperature: t };
    const h = device(t) && hums.find((x) => device(x) === device(t));
    if (h) row.humidity = h;
    return row;
  });
};

const CLIMATE_STYLE = `
  :host { --cc-divider: var(--divider-color, rgba(127, 127, 127, .2)); }
  ha-card {
    height: 100%; box-sizing: border-box; overflow: hidden;
    container-type: inline-size;
  }
  /* One grid for all rows (subgrid), so every sparkline starts and ends at the same x. */
  .rows {
    height: 100%; display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; grid-auto-rows: minmax(0, 1fr); column-gap: 12px;
  }
  .row {
    grid-column: 1 / -1; min-height: 0; position: relative;
    display: grid; grid-template-columns: subgrid; align-items: center;
    padding: 0 14px; color: var(--c);
    cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; touch-action: manipulation;
  }
  .row + .row { border-top: 1px solid var(--cc-divider); }
  .row.pressed { opacity: .7; }
  .row:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color); }

  .lbl { min-width: 0; }
  .name { font-size: 14px; font-weight: 500; line-height: 18px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub:empty { display: none; }

  .spark { position: relative; height: 36px; max-height: calc(100% - 16px); min-width: 0; }
  .spark svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; display: block; }
  .line { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .area { fill: currentColor; fill-opacity: .14; stroke: none; }
  .dot { position: absolute; left: 100%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: currentColor; display: none; }
  .has-data .dot { display: block; }

  .val { text-align: right; min-width: 56px; }
  .now { font-size: 20px; font-weight: 500; line-height: 24px; white-space: nowrap; }
  .mm { font-size: 11px; line-height: 14px; color: var(--secondary-text-color); white-space: nowrap; }
  .mm:empty { display: none; }
  .unavailable .now { color: var(--disabled-color, #9e9e9e); }

  /* Narrow cards (6 columns, or a phone): short words, a smaller label column. */
  .long { display: none; }
  @container (min-width: 300px) {
    .short { display: none; }
    .long { display: inline; }
  }
  @container (max-width: 299px) {
    .rows { grid-template-columns: 64px minmax(0, 1fr) auto; column-gap: 8px; }
    .row { padding: 0 10px; }
    .val { min-width: 48px; }
  }
  @container (max-width: 179px) {
    .rows { grid-template-columns: minmax(0, 1fr) auto; }
    .spark { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .row { transition: none !important; }
  }
`;

class ClimateCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._seen = Object.create(null);
    this._ids = [];
    this._pts = Object.create(null); // temperature entity -> [[ms, value], ...], oldest first
    this._tick = null;
    this._fetchNo = 0;
    this._fetchedAt = 0;
  }

  static getConfigElement() {
    return document.createElement("climate-card-editor");
  }

  static getStubConfig(hass) {
    return { rows: climateStubRows(hass) };
  }

  setConfig(config) {
    const c = config || {};
    const known = ["type", "rows", "hours", "min_span", "scale", "decimals", "tap_action", "hold_action",
      "grid_options", "layout_options", "view_layout", "visibility", "card_mod"];
    for (const k of Object.keys(c)) {
      if (!known.includes(k)) throw new Error(`Unknown option '${k}'. Known: ${known.slice(1).join(", ")}`);
    }
    const rows = c.rows;
    if (rows == null) throw new Error(`rows is required: 1 to ${CLIMATE_MAX_ROWS} rows, each with a temperature sensor`);
    if (!Array.isArray(rows) || !rows.length || rows.length > CLIMATE_MAX_ROWS) {
      throw new Error(`rows must be a list of 1 to ${CLIMATE_MAX_ROWS} rows, each with a temperature sensor`);
    }
    const norm = rows.map((r, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error(`rows[${i}] must be a map, e.g. temperature: sensor.x`);
      for (const k of Object.keys(r)) {
        if (!CLIMATE_ROW_KEYS.includes(k)) throw new Error(`rows[${i}]: unknown key '${k}'. Known: ${CLIMATE_ROW_KEYS.join(", ")}`);
      }
      if (!climateId(r.temperature)) throw new Error(`rows[${i}].temperature: '${r.temperature}' is not an entity id`);
      if (r.humidity != null && !climateId(r.humidity)) throw new Error(`rows[${i}].humidity: '${r.humidity}' is not an entity id (null switches it off)`);
      if (r.color != null && (typeof r.color !== "string" || !r.color.trim())) throw new Error(`rows[${i}].color must be a CSS colour`);
      return {
        name: r.name == null ? null : String(r.name),
        temperature: r.temperature,
        humidity: r.humidity || null,
        color: r.color ? r.color.trim() : CLIMATE_ROW_COLORS[i],
      };
    });
    const hours = c.hours == null ? CLIMATE_DEFAULTS.hours : climateNum(c.hours);
    if (hours === null || hours <= 0 || hours > 168) throw new Error("hours must be a number from 1 to 168");
    const minSpan = c.min_span == null ? CLIMATE_DEFAULTS.min_span : climateNum(c.min_span);
    if (minSpan === null || minSpan < 0) throw new Error("min_span must be a number of degrees (0 switches it off)");
    const scale = c.scale == null ? CLIMATE_DEFAULTS.scale : c.scale;
    if (scale !== "own" && scale !== "shared") throw new Error("scale must be 'own' or 'shared'");
    const decimals = c.decimals == null ? CLIMATE_DEFAULTS.decimals : climateNum(c.decimals);
    if (decimals === null || decimals < 0 || decimals > 3 || !Number.isInteger(decimals)) throw new Error("decimals must be 0, 1, 2 or 3");

    const oldTemps = this._config ? this._config.rows.map((r) => r.temperature).join() : null;
    const oldHours = this._config ? this._config.hours : null;
    this._config = {
      rows: norm,
      hours,
      min_span: minSpan,
      scale,
      decimals,
      tap_action: c.tap_action || { action: "more-info" },
      hold_action: c.hold_action || { action: "none" },
    };
    this._ids = [...new Set(norm.flatMap((r) => [r.temperature, r.humidity]).filter(Boolean))];
    this._seen = Object.create(null);
    if (oldTemps !== norm.map((r) => r.temperature).join() || oldHours !== hours) {
      this._pts = Object.create(null);
      this._fetchedAt = 0;
    }
    this._build();
    if (this._hass) {
      this._ingest(this._hass);
      this._update();
      if (!this._fetchedAt) this._fetch();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    const changed = this._ingest(hass);
    if (changed || first) this._update();
    if (!this._fetchedAt) this._fetch();
  }

  get hass() {
    return this._hass;
  }

  /* Notes new states of the card's own entities; appends temperatures to the live series. */
  _ingest(hass) {
    let changed = false;
    const temps = new Set(this._config.rows.map((r) => r.temperature));
    for (const id of this._ids) {
      const s = hass.states[id];
      if (s === this._seen[id]) continue;
      this._seen[id] = s;
      changed = true;
      if (!temps.has(id)) continue;
      const v = climateState(s);
      if (v === null) continue;
      let t = Date.parse(s.last_updated || s.last_changed);
      if (isNaN(t)) t = Date.now();
      const pts = this._pts[id] || (this._pts[id] = []);
      const last = pts[pts.length - 1];
      if (!last || t > last[0]) pts.push([t, v]);
      else if (t === last[0]) last[1] = v;
    }
    return changed;
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._update(), CLIMATE_TICK_MS);
    // A wall display or a background tab: catch up on what happened while away.
    if (this._hass && this._config && this._fetchedAt && Date.now() - this._fetchedAt > CLIMATE_REFETCH_MS) this._fetch();
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._tick = null;
  }

  getCardSize() {
    return this._config ? Math.ceil(this._config.rows.length * 1.2) : 3;
  }

  getGridOptions() {
    const n = this._config ? this._config.rows.length : 2;
    return { columns: 12, rows: n, min_columns: 6, min_rows: n };
  }

  /* ---- history -------------------------------------------------------------- */

  async _fetch() {
    const hass = this._hass;
    if (!hass || typeof hass.callWS !== "function") return;
    const no = ++this._fetchNo;
    const ids = [...new Set(this._config.rows.map((r) => r.temperature))];
    const now = Date.now();
    this._fetchedAt = now;
    let res;
    try {
      res = await hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(now - this._config.hours * 3600000).toISOString(),
        entity_ids: ids,
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      });
    } catch (err) {
      console.warn("climate-card: could not load history", err);
      return;
    }
    if (no !== this._fetchNo || !this._config) return; // a newer fetch or config took over
    for (const id of ids) {
      const pts = [];
      for (const x of (res && res[id]) || []) {
        const v = climateState({ state: x.s !== undefined ? x.s : x.state });
        const raw = x.lu !== undefined ? x.lu : x.lc;
        const t = raw !== undefined ? raw * 1000 : Date.parse(x.last_updated || x.last_changed);
        if (v === null || isNaN(t)) continue;
        if (pts.length && t <= pts[pts.length - 1][0]) continue;
        pts.push([t, v]);
      }
      // Keep live states that arrived after the history ends.
      const end = pts.length ? pts[pts.length - 1][0] : -Infinity;
      this._pts[id] = pts.concat((this._pts[id] || []).filter((p) => p[0] > end));
    }
    this._update();
  }

  /*
   * The series for one temperature entity in the window ending at `now`:
   * `line` (bucket averages, a bucket without a state carries the last value;
   * ends at the current state), plus the exact low and high with their times.
   */
  _series(id, now) {
    const span = this._config.hours * 3600000;
    const start = now - span;
    const pts = this._pts[id] || [];
    // Drop what fell out of the window, keeping the last state before it (it was still valid at the start).
    let cut = 0;
    while (cut + 1 < pts.length && pts[cut + 1][0] <= start) cut++;
    if (cut) pts.splice(0, cut);

    const step = span / CLIMATE_BUCKETS;
    const line = [];
    let carry = null;
    let low = null;
    let high = null;
    const see = (t, v) => {
      if (!low || v < low[1]) low = [t, v];
      if (!high || v > high[1]) high = [t, v];
    };
    let j = 0;
    while (j < pts.length && pts[j][0] <= start) {
      carry = pts[j][1];
      j++;
    }
    if (carry !== null) {
      line.push([start, carry]);
      see(start, carry);
    }
    for (let b = 0; b < CLIMATE_BUCKETS; b++) {
      const end = start + (b + 1) * step;
      let sum = 0;
      let n = 0;
      while (j < pts.length && pts[j][0] <= end) {
        sum += pts[j][1];
        see(pts[j][0], pts[j][1]);
        carry = pts[j][1];
        n++;
        j++;
      }
      const v = n ? sum / n : carry;
      if (v !== null) line.push([start + (b + 0.5) * step, v]);
    }
    const cur = climateState(this._s(id));
    if (cur !== null) {
      line.push([now, cur]);
      see(now, cur);
    }
    return { line, low, high, cur, start, span };
  }

  /* Value range per row: own (with min_span) or shared (same degrees per pixel). */
  _ranges(series) {
    const ms = this._config.min_span;
    const spans = series.map((s) => {
      if (!s.line.length) return null;
      const vs = s.line.map((p) => p[1]);
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      return { mid: (lo + hi) / 2, span: Math.max(hi - lo, ms) };
    });
    const shared = this._config.scale === "shared"
      ? Math.max(0, ...spans.filter(Boolean).map((r) => r.span)) : null;
    return spans.map((r) => {
      if (!r) return null;
      let span = shared !== null ? shared : r.span;
      if (span <= 0) span = 1; // a flat line sits in the middle
      return { lo: r.mid - span / 2, hi: r.mid + span / 2 };
    });
  }

  /* ---- DOM, built once per config ---------------------------------------------- */

  _build() {
    const rows = this._config.rows.map((_, i) => `
      <div class="row" role="button" tabindex="0" data-i="${i}">
        <div class="lbl"><div class="name"></div><div class="sub"></div></div>
        <div class="spark"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path class="area"/><path class="line"/></svg><span class="dot"></span></div>
        <div class="val"><div class="now"></div><div class="mm"></div></div>
      </div>`).join("");
    this.shadowRoot.innerHTML = `<style>${CLIMATE_STYLE}</style><ha-card><div class="rows">${rows}</div></ha-card>`;
    this._rows = [...this.shadowRoot.querySelectorAll(".row")].map((el, i) => {
      const $ = (s) => el.querySelector(s);
      el.style.setProperty("--c", this._config.rows[i].color);
      this._bindPress(el, i);
      return { el, name: $(".name"), sub: $(".sub"), area: $(".area"), line: $(".line"), dot: $(".dot"), now: $(".now"), mm: $(".mm") };
    });
  }

  /* ---- actions -------------------------------------------------------------------- */

  _bindPress(el, i) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      start = null;
      el.classList.remove("pressed");
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      el.classList.add("pressed");
      timer = setTimeout(() => {
        timer = null;
        held = true;
        el.classList.remove("pressed");
        this._run(this._config.hold_action, "hold", i);
      }, CLIMATE_HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLIMATE_MOVE_PX) cancel();
    });
    el.addEventListener("pointerup", () => {
      if (!start) return;
      const wasHeld = held;
      cancel();
      if (!wasHeld) this._run(this._config.tap_action, "tap", i);
    });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", (e) => {
      if (this._config.hold_action.action !== "none") e.preventDefault();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      this._run(this._config.tap_action, "tap", i);
    });
  }

  /* Hands an action to Home Assistant's own handler; the entity is the row's temperature sensor. */
  _run(conf, kind, i) {
    if (!conf || conf.action === "none") return;
    window.dispatchEvent(new CustomEvent("haptic", { detail: kind === "hold" ? "medium" : "light" }));
    const config = { entity: this._config.rows[i].temperature };
    config[kind === "hold" ? "hold_action" : "tap_action"] = conf;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true, detail: { config, action: kind },
    }));
  }

  /* ---- formatting in HA's language and number format --------------------------------- */

  _locale() {
    const h = this._hass || {};
    const lang = (h.locale && h.locale.language) || h.language || "en";
    switch (h.locale && h.locale.number_format) {
      case "comma_decimal": return ["en-US", lang];
      case "decimal_comma": return ["de", lang];
      case "space_comma": return ["fr", lang];
      case "system": return [undefined, lang];
      default: return [lang, lang];
    }
  }

  _num(v, d) {
    const [loc] = this._locale();
    const opts = { minimumFractionDigits: d, maximumFractionDigits: d };
    try {
      return new Intl.NumberFormat(loc, opts).format(v);
    } catch (_) {
      return new Intl.NumberFormat("en", opts).format(v);
    }
  }

  _clock(ms) {
    const [, lang] = this._locale();
    const tz = this._hass && this._hass.config && this._hass.config.time_zone;
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
    try {
      return new Intl.DateTimeFormat(lang, tz ? { ...opts, timeZone: tz } : opts).format(new Date(ms));
    } catch (_) {
      return new Intl.DateTimeFormat("en-GB", opts).format(new Date(ms));
    }
  }

  _s(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _name(r) {
    if (r.name != null) return r.name;
    const s = this._s(r.temperature);
    return (s && s.attributes && s.attributes.friendly_name) || r.temperature;
  }

  /* Plain text, or a short and a long version; CSS shows the one that fits. */
  _text(el, short, long) {
    const key = long && long !== short ? `${short}\u0000${long}` : short;
    if (el._shown === key) return;
    el._shown = key;
    if (long && long !== short) {
      el.innerHTML = '<span class="short"></span><span class="long"></span>';
      el.firstChild.textContent = short;
      el.lastChild.textContent = long;
    } else {
      el.textContent = short;
    }
  }

  /* ---- update ------------------------------------------------------------------------ */

  _update() {
    if (!this._hass || !this._rows) return;
    const now = Date.now();
    const cfg = this._config;
    const series = cfg.rows.map((r) => this._series(r.temperature, now));
    const ranges = this._ranges(series);
    const d = cfg.decimals;

    cfg.rows.forEach((r, i) => {
      const e = this._rows[i];
      const s = series[i];
      const rg = ranges[i];
      const name = this._name(r);
      this._text(e.name, name);

      const hum = r.humidity ? climateState(this._s(r.humidity)) : null;
      const unavailable = s.cur === null;
      e.el.classList.toggle("unavailable", unavailable);
      if (unavailable) this._text(e.sub, "Unavailable");
      else if (hum !== null) this._text(e.sub, `${Math.round(hum)}%`, `${Math.round(hum)}% humidity`);
      else this._text(e.sub, "");

      this._text(e.now, unavailable ? "" : `${this._num(s.cur, d)}°`);
      this._text(e.mm, s.low && s.high ? `↓${this._num(s.low[1], d)} ↑${this._num(s.high[1], d)}` : "");

      // Sparkline: x by time across the window, y by the row's range, 8..92 of 100.
      const drawn = s.line.length > 1 && rg;
      e.el.classList.toggle("has-data", !!drawn && !unavailable);
      if (drawn) {
        const X = (t) => ((t - s.start) / s.span) * 1000;
        const Y = (v) => 8 + 84 * (1 - (v - rg.lo) / (rg.hi - rg.lo));
        const p = s.line.map(([t, v], k) => `${k ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(2)}`).join("");
        e.line.setAttribute("d", p);
        e.area.setAttribute("d", `${p}L${X(s.line[s.line.length - 1][0]).toFixed(1)} 100L${X(s.line[0][0]).toFixed(1)} 100Z`);
        e.dot.style.top = `${Y(s.line[s.line.length - 1][1]).toFixed(2)}%`;
      } else {
        e.line.removeAttribute("d");
        e.area.removeAttribute("d");
      }

      // Tooltip and label: now, low and high with their times, humidity.
      const unit = ((this._s(r.temperature) || {}).attributes || {}).unit_of_measurement || "°";
      const parts = [unavailable ? `${name}: unavailable` : `${name}: ${this._num(s.cur, d)} ${unit}`];
      if (s.low && s.high) {
        parts.push(`low ${this._num(s.low[1], d)} at ${this._clock(s.low[0])}, high ${this._num(s.high[1], d)} at ${this._clock(s.high[0])} (last ${cfg.hours} h)`);
      }
      if (hum !== null) parts.push(`${Math.round(hum)}% humidity`);
      const title = parts.join(", ");
      e.el.title = title;
      e.el.setAttribute("aria-label", title);
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Visual editor                                                            */
/* ------------------------------------------------------------------------ */

/*
 * Built on HA's own <ha-form>. Three row slots; a slot without a temperature
 * sensor is no row (the rows after it move up). Every field shows the value
 * in use, defaults included; the rows and the values that differ from the
 * defaults are written to the YAML. No row left: no rows in the YAML, so the
 * card asks for one. Options the editor does not show (grid_options, ...) are kept.
 */

const CLIMATE_ROW_SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "temperature", selector: { entity: { filter: { domain: ["sensor", "input_number"] } } } },
  { name: "humidity", selector: { entity: { filter: { domain: ["sensor", "input_number"] } } } },
  { name: "color", selector: { text: {} } },
];

const CLIMATE_EDITOR_SCHEMA = [
  ...[0, 1, 2].map((i) => ({
    type: "expandable",
    name: `row${i + 1}`,
    title: `Row ${i + 1}`,
    icon: "mdi:thermometer",
    expanded: i < 2,
    schema: CLIMATE_ROW_SCHEMA,
  })),
  {
    type: "expandable",
    name: "",
    title: "Graph",
    icon: "mdi:chart-bell-curve-cumulative",
    expanded: true,
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "hours", selector: { number: { min: 1, max: 168, step: 1, mode: "box", unit_of_measurement: "h" } } },
          { name: "min_span", selector: { number: { min: 0, max: 50, step: 0.5, mode: "box", unit_of_measurement: "°" } } },
          { name: "decimals", selector: { number: { min: 0, max: 3, step: 1, mode: "box" } } },
        ],
      },
      {
        name: "scale",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "own", label: "Each row on its own, at least the minimum span" },
              { value: "shared", label: "Same degrees per pixel for all rows" },
            ],
          },
        },
      },
    ],
  },
  {
    type: "expandable",
    name: "",
    title: "Actions",
    icon: "mdi:gesture-tap",
    schema: [
      { name: "tap_action", selector: { ui_action: { default_action: "more-info" } } },
      { name: "hold_action", selector: { ui_action: { default_action: "none" } } },
    ],
  },
];

const CLIMATE_EDITOR_LABELS = {
  name: "Name (empty: the sensor's name)",
  temperature: "Temperature sensor (empty: no row)",
  humidity: "Humidity sensor (optional)",
  color: "Colour",
  hours: "Hours shown",
  min_span: "Minimum span",
  decimals: "Decimals",
  scale: "Scale",
  tap_action: "Tap action (on a row)",
  hold_action: "Hold action (on a row)",
};

/* A row as the editor writes it: name, temperature, humidity, colour; only what is set or not default. */
const climateRowOut = (d, i) => {
  const row = {};
  if (typeof d.name === "string" && d.name.trim()) row.name = d.name;
  row.temperature = d.temperature;
  if (climateId(d.humidity)) row.humidity = d.humidity;
  const color = typeof d.color === "string" ? d.color.trim() : "";
  if (color && color !== CLIMATE_ROW_COLORS[i]) row.color = color;
  return row;
};

class ClimateCardEditor extends HTMLElement {
  /* config -> form data: defaults filled in, three slots. */
  static toData(config) {
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const data = {};
    for (let i = 0; i < CLIMATE_MAX_ROWS; i++) {
      const r = rows[i] || {};
      data[`row${i + 1}`] = {
        name: r.name == null ? "" : String(r.name),
        temperature: r.temperature || "",
        humidity: r.humidity || "",
        color: r.color || CLIMATE_ROW_COLORS[i],
      };
    }
    const n = (k) => {
      const v = climateNum(config[k]);
      return v == null ? CLIMATE_DEFAULTS[k] : v;
    };
    return {
      ...data,
      hours: n("hours"),
      min_span: n("min_span"),
      decimals: n("decimals"),
      scale: config.scale === "shared" ? "shared" : "own",
      tap_action: config.tap_action,
      hold_action: config.hold_action,
    };
  }

  /* form data -> config: the rows, and only what differs from the defaults. */
  static toConfig(data, previous) {
    const config = { type: "custom:climate-card" };
    const handled = ["type", "rows", "hours", "min_span", "scale", "decimals", "tap_action", "hold_action"];
    for (const [k, v] of Object.entries(previous || {})) {
      if (!handled.includes(k)) config[k] = v;
    }
    const rows = [];
    for (let i = 0; i < CLIMATE_MAX_ROWS; i++) {
      const d = data[`row${i + 1}`];
      if (d && climateId(d.temperature)) rows.push(climateRowOut(d, rows.length));
    }
    if (rows.length) config.rows = rows;
    const hours = climateNum(data.hours);
    if (hours != null && hours > 0 && hours <= 168 && hours !== CLIMATE_DEFAULTS.hours) config.hours = hours;
    const span = climateNum(data.min_span);
    if (span != null && span >= 0 && span !== CLIMATE_DEFAULTS.min_span) config.min_span = span;
    const dec = climateNum(data.decimals);
    if (dec != null && Number.isInteger(dec) && dec >= 0 && dec <= 3 && dec !== CLIMATE_DEFAULTS.decimals) config.decimals = dec;
    if (data.scale === "shared") config.scale = "shared";
    if (data.tap_action && Object.keys(data.tap_action).length) config.tap_action = data.tap_action;
    if (data.hold_action && Object.keys(data.hold_action).length) config.hold_action = data.hold_action;
    return config;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    this._loadForm().then(() => this._render());
  }

  /* ha-form is lazy loaded by HA; load it through a built-in card's editor. */
  async _loadForm() {
    if (customElements.get("ha-form")) return;
    try {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      if (card.constructor.getConfigElement) await card.constructor.getConfigElement();
    } catch (_) {
      /* rendered as soon as HA has loaded it */
    }
    await customElements.whenDefined("ha-form");
  }

  _render() {
    if (!this._config || !customElements.get("ha-form")) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.schema = CLIMATE_EDITOR_SCHEMA;
      this._form.computeLabel = (s) => CLIMATE_EDITOR_LABELS[s.name] || s.name.replace(/_/g, " ");
      this._form.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const config = ClimateCardEditor.toConfig(e.detail.value, this._config);
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = ClimateCardEditor.toData(this._config);
  }
}

if (!customElements.get("climate-card")) {
  customElements.define("climate-card", ClimateCard);
}
if (!customElements.get("climate-card-editor")) {
  customElements.define("climate-card-editor", ClimateCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "climate-card")) {
  window.customCards.push({
    type: "climate-card",
    name: "Climate Card",
    description: "Inside and outside temperature in one compact card: sparklines with honest scaling, low and high, humidity.",
    preview: true,
    documentationURL: "https://github.com/BarBaar44/climate-card",
  });
}

console.info(`%c CLIMATE-CARD %c ${VERSION} `, "background:#ff9800;color:#fff", "");
}
