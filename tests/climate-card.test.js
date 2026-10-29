// Tests for climate-card.js in a simulated browser. Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
const src = fs.readFileSync(path.join(__dirname, "..", "climate-card.js"), "utf8");
w.eval(src);
w.eval(src); // loading twice as a classic script must not throw (no top-level name clashes)
const Card = w.customElements.get("climate-card");
assert(Card, "registered");

// A fixed clock: Thursday 29 Oct 2026, 12:00 UTC.
let NOW = Date.UTC(2026, 9, 29, 12, 0);
w.Date.now = () => NOW;
const H = 3600000;
const iso = (ms) => new Date(ms).toISOString();

const IN_T = "sensor.temperature_living_room_temperature";
const IN_H = "sensor.temperature_living_room_humidity";
const OUT_T = "sensor.outdoor_temperature";
const OUT_H = "sensor.outdoor_humidity";
const st = (state, t = NOW - 60000, attributes = {}) => ({ state: String(state), attributes, last_changed: iso(t), last_updated: iso(t) });
const states = (o = {}) => ({
  [IN_T]: st(o.in ?? 21.2, NOW - 60000, { unit_of_measurement: "°C", friendly_name: "Living room" }),
  [IN_H]: st(o.inH ?? 55),
  [OUT_T]: st(o.out ?? 7.2, NOW - 60000, { unit_of_measurement: "°C" }),
  [OUT_H]: st(o.outH ?? 87),
});

/* History as HA's minimal response gives it: { id: [{ s, lu }, ...] }, lu in seconds. */
const hist = (fn, from = NOW - 24 * H, every = 10 * 60000) => {
  const out = [];
  for (let t = from; t < NOW - 60000; t += every) out.push({ s: String(fn(t)), lu: t / 1000 });
  return out;
};
const DEFAULT_HISTORY = {
  [IN_T]: hist((t) => (((t - (NOW - 24 * H)) / H) < 12 ? 19.5 : 21.0)), // a 1.5° step
  [OUT_T]: hist((t) => +(7 + 4 * Math.sin(((t - NOW) / (24 * H)) * 2 * Math.PI)).toFixed(1)), // 3..11
};

const calls = [];
const hass = (s, history = DEFAULT_HISTORY, extra = {}) => ({
  states: s, language: "en", locale: { language: "en", number_format: "language" }, config: { time_zone: "UTC" },
  callWS: async (msg) => {
    calls.push(msg);
    if (history instanceof Error) throw history;
    return history;
  },
  ...extra,
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const cards = [];
async function render(config = {}, s = states(), history) {
  const c = new Card();
  w.document.body.appendChild(c);
  cards.push(c);
  c.setConfig(config);
  c.hass = hass(s, history);
  await flush();
  return c;
}
const row = (c, i) => {
  const e = c._rows[i];
  const long = (el) => (el.querySelector(".long") ? el.querySelector(".long").textContent : el.textContent);
  const short = (el) => (el.querySelector(".short") ? el.querySelector(".short").textContent : el.textContent);
  return {
    name: e.name.textContent, sub: long(e.sub), subShort: short(e.sub), now: e.now.textContent, mm: e.mm.textContent,
    line: e.line.getAttribute("d"), dotTop: e.dot.style.top, title: e.el.title,
    hasData: e.el.classList.contains("has-data"), unavailable: e.el.classList.contains("unavailable"),
    color: e.el.style.getPropertyValue("--c"),
  };
};
/* The y values (0..100) of a drawn line. */
const ys = (d) => d.split(/[ML]/).filter(Boolean).map((p) => +p.split(" ")[1]);

const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); // objects from the jsdom realm

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("defaults: two rows, names, humidity, values, low and high", async () => {
  const c = await render();
  assert.strictEqual(c._rows.length, 2);
  const a = row(c, 0);
  const b = row(c, 1);
  assert.strictEqual(a.name, "Inside");
  assert.strictEqual(b.name, "Outside");
  assert.strictEqual(a.sub, "55% humidity");
  assert.strictEqual(a.subShort, "55%");
  assert.strictEqual(a.now, "21.2°");
  assert.strictEqual(b.now, "7.2°");
  assert.strictEqual(a.mm, "\u219319.5 \u219121.2");
  assert.strictEqual(b.mm, "\u21933.0 \u219111.0");
  assert(a.hasData && b.hasData);
  assert.strictEqual(a.color, "var(--green-color, #4caf50)");
  assert.strictEqual(b.color, "var(--orange-color, #ff9800)");
  same(c.getGridOptions(), { columns: 12, rows: 2, min_columns: 6, min_rows: 2 });
});

test("history request: one call, the window, both temperature sensors, minimal", async () => {
  calls.length = 0;
  await render();
  assert.strictEqual(calls.length, 1);
  const m = calls[0];
  assert.strictEqual(m.type, "history/history_during_period");
  assert.strictEqual(m.start_time, iso(NOW - 24 * H));
  same(m.entity_ids, [IN_T, OUT_T]);
  assert.strictEqual(m.minimal_response, true);
  assert.strictEqual(m.no_attributes, true);
  assert.strictEqual(m.significant_changes_only, false);
});

test("min_span 4: a 1.7° indoor range uses under half the height, outdoor uses all of it", async () => {
  const c = await render();
  const yin = ys(row(c, 0).line);
  const yout = ys(row(c, 1).line);
  const usedIn = Math.max(...yin) - Math.min(...yin);
  const usedOut = Math.max(...yout) - Math.min(...yout);
  // Inside 19.5..21.2 = 1.7° of a 4° span: 84 * 1.7 / 4 = 35.7
  assert(Math.abs(usedIn - 35.7) < 0.5, `inside uses ${usedIn}`);
  assert(Math.abs(usedOut - 84) < 0.5, `outside uses ${usedOut}`);
  // centred on its own data
  assert(Math.abs((Math.max(...yin) + Math.min(...yin)) / 2 - 50) < 0.5);
});

test("min_span 0 is the old behaviour: every row fills the height", async () => {
  const c = await render({ min_span: 0 });
  const yin = ys(row(c, 0).line);
  assert(Math.abs(Math.max(...yin) - Math.min(...yin) - 84) < 0.5);
});

test("scale shared: same degrees per pixel in every row", async () => {
  const c = await render({ scale: "shared" });
  const [ri, ro] = c._ranges(c._config.rows.map((r) => c._series(r.temperature, NOW)));
  assert(Math.abs((ri.hi - ri.lo) - (ro.hi - ro.lo)) < 1e-9);
  assert(Math.abs((ro.hi - ro.lo) - 8) < 0.05, `span ${ro.hi - ro.lo}`); // outside 3..11
  const yin = ys(row(c, 0).line);
  assert(Math.abs(Math.max(...yin) - Math.min(...yin) - (84 * 1.7) / 8) < 0.5);
});

test("a flat line sits in the middle, no division by zero", async () => {
  const flat = { [IN_T]: hist(() => 20), [OUT_T]: hist(() => 20) };
  const c = await render({ min_span: 0 }, states({ in: 20, out: 20 }), flat);
  for (const y of ys(row(c, 0).line)) assert(Math.abs(y - 50) < 1e-6, String(y));
  assert.strictEqual(parseFloat(row(c, 0).dotTop), 50);
});

test("a quiet sensor carries its value forward (step data, not a slope)", async () => {
  // One state 20 h ago at 18, then 22 since 2 h ago.
  const h = { [IN_T]: [{ s: "18", lu: (NOW - 20 * H) / 1000 }, { s: "22", lu: (NOW - 2 * H) / 1000 }], [OUT_T]: [] };
  const c = await render({ min_span: 0 }, states({ in: 22 }), h);
  const s = c._series(IN_T, NOW);
  const mid = s.line.find((p) => p[0] > NOW - 10 * H && p[0] < NOW - 9 * H);
  assert.strictEqual(mid[1], 18);
  assert.strictEqual(s.low[1], 18);
  assert.strictEqual(s.high[1], 22);
  // No history before 20 h ago: the line starts there, not at the left edge.
  assert(s.line[0][0] > NOW - 20.2 * H);
});

test("the state before the window counts at its start", async () => {
  const h = { [IN_T]: [{ s: "17", lu: (NOW - 30 * H) / 1000 }, { s: "21", lu: (NOW - 6 * H) / 1000 }], [OUT_T]: [] };
  const c = await render({}, states({ in: 21 }), h);
  const s = c._series(IN_T, NOW);
  assert.strictEqual(s.line[0][0], NOW - 24 * H);
  assert.strictEqual(s.line[0][1], 17);
});

test("live states are appended and the low and high follow", async () => {
  const c = await render();
  NOW += 5 * 60000;
  c.hass = hass({ ...c.hass.states, [IN_T]: st(23.4, NOW - 1000, { unit_of_measurement: "°C" }) });
  const a = row(c, 0);
  assert.strictEqual(a.now, "23.4°");
  assert.strictEqual(a.mm, "\u219319.5 \u219123.4");
  assert.strictEqual(c._pts[IN_T][c._pts[IN_T].length - 1][1], 23.4);
  NOW -= 5 * 60000;
});

test("live states that arrive while the history loads are kept", async () => {
  let release;
  const slow = { states: states(), language: "en", locale: { language: "en" }, config: { time_zone: "UTC" },
    callWS: () => new Promise((r) => { release = () => r(DEFAULT_HISTORY); }) };
  const c = new Card();
  w.document.body.appendChild(c);
  cards.push(c);
  c.setConfig({});
  c.hass = slow;
  c.hass = { ...slow, states: { ...slow.states, [IN_T]: st(24, NOW - 500) } };
  release();
  await flush();
  const pts = c._pts[IN_T];
  assert.strictEqual(pts[pts.length - 1][1], 24);
  assert(pts.length > 100);
});

test("history failing: only the live value, no crash", async () => {
  const c = await render({}, states(), new Error("not allowed"));
  const a = row(c, 0);
  assert.strictEqual(a.now, "21.2°");
  assert.strictEqual(a.hasData, true); // the current state from a minute ago up to now
});

test("unavailable temperature: grey, 'Unavailable', history still drawn", async () => {
  const c = await render({}, { ...states(), [IN_T]: st("unavailable") });
  const a = row(c, 0);
  assert(a.unavailable);
  assert.strictEqual(a.sub, "Unavailable");
  assert.strictEqual(a.now, "");
  assert(a.line, "history line drawn");
  assert(!a.hasData, "no dot");
  assert(/unavailable/.test(a.title));
});

test("number format: comma decimals for Dutch", async () => {
  const c = new Card();
  w.document.body.appendChild(c);
  cards.push(c);
  c.setConfig({});
  c.hass = { ...hass(states()), language: "nl", locale: { language: "nl", number_format: "language" } };
  await flush();
  assert.strictEqual(row(c, 0).now, "21,2°");
  c.hass = { ...hass(states()), locale: { language: "nl", number_format: "comma_decimal" } };
  c._update();
  assert.strictEqual(row(c, 0).now, "21.2°");
});

test("decimals, hours, custom rows, a row without humidity, name from the sensor", async () => {
  calls.length = 0;
  const c = await render({
    hours: 6, decimals: 0,
    rows: [{ temperature: IN_T, color: "teal" }, { name: "Out", temperature: OUT_T, humidity: OUT_H }, { name: "Again", temperature: OUT_T }],
  });
  assert.strictEqual(calls[0].start_time, iso(NOW - 6 * H));
  same(calls[0].entity_ids, [IN_T, OUT_T]);
  assert.strictEqual(c._rows.length, 3);
  assert.strictEqual(row(c, 0).name, "Living room");
  assert.strictEqual(row(c, 0).sub, "");
  assert.strictEqual(row(c, 0).now, "21°");
  assert.strictEqual(row(c, 0).color, "teal");
  assert.strictEqual(row(c, 2).color, "var(--blue-color, #2196f3)");
  same(c.getGridOptions(), { columns: 12, rows: 3, min_columns: 6, min_rows: 3 });
});

test("tooltip has low and high with times", async () => {
  const c = await render();
  const t = row(c, 0).title;
  assert(/^Inside: 21\.2 °C, low 19\.5 at \d\d:\d\d, high 21\.2 at \d\d:\d\d \(last 24 h\), 55% humidity$/.test(t), t);
});

test("tap opens more-info on the row's sensor; hold does nothing by default", async () => {
  const c = await render({ hold_action: { action: "navigate", navigation_path: "/house/climate" } });
  const got = [];
  c.addEventListener("hass-action", (e) => got.push(JSON.parse(JSON.stringify(e.detail))));
  c._run(c._config.tap_action, "tap", 1);
  c._run(c._config.hold_action, "hold", 0);
  assert.deepStrictEqual(got, [
    { config: { entity: OUT_T, tap_action: { action: "more-info" } }, action: "tap" },
    { config: { entity: IN_T, hold_action: { action: "navigate", navigation_path: "/house/climate" } }, action: "hold" },
  ]);
  const d = await render();
  const none = [];
  d.addEventListener("hass-action", (e) => none.push(e));
  d._run(d._config.hold_action, "hold", 0);
  assert.strictEqual(none.length, 0);
});

test("re-renders only for its own entities; one history fetch", async () => {
  calls.length = 0;
  const c = await render();
  let n = 0;
  const orig = c._update.bind(c);
  c._update = () => { n++; orig(); };
  c.hass = hass({ ...c.hass.states, "light.other": st("on") });
  assert.strictEqual(n, 0);
  c.hass = hass({ ...c.hass.states, [OUT_H]: st(90) });
  assert.strictEqual(n, 1);
  await flush();
  assert.strictEqual(calls.length, 1);
});

test("fetches again after being away, and on a new set of sensors", async () => {
  calls.length = 0;
  const c = await render();
  c.remove();
  NOW += 11 * 60000;
  w.document.body.appendChild(c);
  await flush();
  assert.strictEqual(calls.length, 2);
  c.setConfig({ hours: 24, decimals: 2 }); // same sensors, same window: no fetch
  await flush();
  assert.strictEqual(calls.length, 2);
  c.setConfig({ rows: [{ temperature: OUT_T }] });
  await flush();
  assert.strictEqual(calls.length, 3);
  NOW -= 11 * 60000;
});

test("config errors", () => {
  const bad = [
    [{ row: [] }, /Unknown option 'row'/],
    [{ rows: [] }, /1 to 3 rows/],
    [{ rows: [{ temperature: IN_T }, { temperature: IN_T }, { temperature: IN_T }, { temperature: IN_T }] }, /1 to 3 rows/],
    [{ rows: [{ temp: IN_T }] }, /unknown key 'temp'/],
    [{ rows: [{ name: "x" }] }, /not an entity id/],
    [{ rows: [{ temperature: IN_T, humidity: "nope" }] }, /humidity/],
    [{ rows: ["sensor.x"] }, /must be a map/],
    [{ hours: 0 }, /hours/],
    [{ hours: 200 }, /hours/],
    [{ min_span: -1 }, /min_span/],
    [{ scale: "log" }, /scale/],
    [{ decimals: 1.5 }, /decimals/],
  ];
  for (const [cfg, re] of bad) assert.throws(() => new Card().setConfig(cfg), re, JSON.stringify(cfg));
  new Card().setConfig({ rows: [{ temperature: IN_T, humidity: null }] }); // null switches humidity off
});

test("editor: defaults shown, only changes written, round trip", async () => {
  const Editor = w.customElements.get("climate-card-editor");
  assert(Editor, "editor registered");
  assert.equal(Card.getConfigElement().tagName.toLowerCase(), "climate-card-editor");

  const minimal = { type: "custom:climate-card", grid_options: { columns: 12, rows: 2 } };
  const d0 = Editor.toData(minimal);
  assert.deepEqual(d0.row1, { name: "Inside", temperature: IN_T, humidity: IN_H, color: "var(--green-color, #4caf50)" });
  assert.deepEqual(d0.row2, { name: "Outside", temperature: OUT_T, humidity: OUT_H, color: "var(--orange-color, #ff9800)" });
  assert.deepEqual(d0.row3, { name: "", temperature: "", humidity: "", color: "var(--blue-color, #2196f3)" });
  assert.equal(d0.hours, 24);
  assert.equal(d0.min_span, 4);
  assert.equal(d0.decimals, 1);
  assert.equal(d0.scale, "own");
  assert.deepEqual(Editor.toConfig(d0, minimal), minimal, "unchanged writes nothing new");

  // A colour on row 1 writes the rows; a cleared humidity is left out.
  const d1 = Editor.toData(minimal);
  d1.row1.color = "#008000";
  d1.row2.humidity = "";
  d1.min_span = 3;
  d1.scale = "shared";
  const c1 = Editor.toConfig(d1, minimal);
  assert.deepEqual(c1.rows, [
    { name: "Inside", temperature: IN_T, humidity: IN_H, color: "#008000" },
    { name: "Outside", temperature: OUT_T },
  ]);
  assert.equal(c1.min_span, 3);
  assert.equal(c1.scale, "shared");
  assert.deepEqual(c1.grid_options, minimal.grid_options, "unknown keys kept");
  assert.deepEqual(Editor.toConfig(Editor.toData(c1), c1), c1, "round trip");

  // A third row; clearing row 1's sensor moves the others up (and their default colours with them).
  const d2 = Editor.toData(c1);
  d2.row3 = { name: "Bedroom", temperature: "sensor.bedroom_temperature", humidity: "", color: "var(--blue-color, #2196f3)" };
  const c2 = Editor.toConfig(d2, c1);
  assert.equal(c2.rows.length, 3);
  assert.deepEqual(c2.rows[2], { name: "Bedroom", temperature: "sensor.bedroom_temperature" });
  const d3 = Editor.toData(c2);
  d3.row1.temperature = "";
  const c3 = Editor.toConfig(d3, c2);
  assert.deepEqual(c3.rows.map((r) => r.name), ["Outside", "Bedroom"]);

  // No row left: back to the defaults. Zero min_span is written.
  const d4 = Editor.toData(c1);
  d4.row1.temperature = "";
  d4.row2.temperature = "";
  d4.min_span = 0;
  const c4 = Editor.toConfig(d4, c1);
  assert.equal("rows" in c4, false);
  assert.equal(c4.min_span, 0);

  // hours, decimals, actions, empty name
  const full = {
    type: "custom:climate-card", hours: 12, decimals: 0, tap_action: { action: "none" },
    hold_action: { action: "more-info" }, rows: [{ temperature: IN_T, humidity: IN_H }],
  };
  assert.deepEqual(Editor.toConfig(Editor.toData(full), full), full);

  // every config the editor writes is accepted by the card
  for (const c of [c1, c2, c3, c4, full]) new Card().setConfig(c);

  // with a stub ha-form: renders and passes changes on
  if (!w.customElements.get("ha-form")) w.customElements.define("ha-form", class extends w.HTMLElement {});
  const ed = new Editor();
  const got = [];
  ed.addEventListener("config-changed", (e) => got.push(e.detail.config));
  ed.setConfig(minimal);
  w.document.body.appendChild(ed);
  await flush();
  const form = ed.querySelector("ha-form");
  assert(form, "ha-form rendered");
  assert.equal(form.data.row1.temperature, IN_T);
  assert.equal(form.computeLabel({ name: "min_span" }), "Minimum span");
  form.dispatchEvent(new w.CustomEvent("value-changed", { detail: { value: { ...form.data, hours: 48 } } }));
  assert.deepEqual(got[0], { ...minimal, hours: 48 });
  ed.remove();
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${name}\n     ${err.message}`);
    }
  }
  cards.forEach((c) => c.remove());
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
