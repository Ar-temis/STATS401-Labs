// Wires both views to one state object through a single d3.dispatch.
import { loadData } from "./data.js";
import { yearColor, fmtSigned, MONTHS } from "./shared.js";
import { createTimeline } from "./timeline.js";
import { createSpiral } from "./spiral.js";

const STEP_MS = 100; // playback speed: one year per step

const data = await loadData().catch((err) => {
  d3.select("#viz-status").text(
    "Could not load the HadCRUT5 CSV. Open this page through a web server (e.g. python3 -m http.server), not file://.",
  );
  throw err;
});
d3.select("#viz-status").remove();

const color = yearColor(data.firstYear, data.lastYear);
const dispatch = d3.dispatch("year", "range", "hover");
const state = { year: data.lastYear, range: null, hover: null };

const timeline = createTimeline(document.getElementById("timeline"), data, color, dispatch);
const spiral = createSpiral(document.getElementById("spiral"), data, color, dispatch);
const views = [timeline, spiral];

// ---- Controls ----
const slider = d3.select("#year-slider")
  .attr("min", data.firstYear)
  .attr("max", data.lastYear)
  .property("value", state.year)
  .on("input", function () {
    stop();
    dispatch.call("year", null, +this.value);
  });

const playBtn = d3.select("#play").on("click", () => (timer ? stop() : play()));
d3.select("#reset").on("click", () => {
  stop();
  state.hover = null;
  dispatch.call("range", null, null);
  dispatch.call("year", null, data.lastYear);
});

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  const tag = e.target.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "TEXTAREA" || (tag === "INPUT" && e.target.type !== "range")) return;
  e.preventDefault();
  timer ? stop() : play();
});

let timer = null;
function play() {
  if (state.year >= data.lastYear) dispatch.call("year", null, data.firstYear);
  playBtn.text("❚❚ Pause").attr("aria-pressed", "true");
  timer = d3.interval(() => {
    if (state.year >= data.lastYear) return stop();
    dispatch.call("year", null, state.year + 1);
  }, STEP_MS);
}
function stop() {
  if (timer) timer.stop();
  timer = null;
  playBtn.text("▶ Play").attr("aria-pressed", "false");
}

// ---- Shared state ----
dispatch.on("year", (year) => {
  state.year = year;
  slider.property("value", year);
  refresh();
});
dispatch.on("range", (range) => {
  state.range = range;
  refresh();
});
dispatch.on("hover", (h) => {
  const year = h ? h.year : null;
  if (year !== state.hover) {
    state.hover = year;
    refresh();
  }
  showTooltip(h);
});

function refresh() {
  views.forEach((v) => v.update(state));
  d3.select("#readout").html(`Year <strong>${state.year}</strong>`);
  d3.select("#range-readout").text(
    state.range ? `Selected ${state.range[0]}–${state.range[1]} · mean ${fmtSigned(d3.mean(data.annual.filter((d) => d.year >= state.range[0] && d.year <= state.range[1]), (d) => d.anomaly))}°C` : "",
  );
}

// ---- Tooltip ----
const tooltip = d3.select("#viz-tooltip");
function showTooltip(h) {
  if (!h) return tooltip.attr("hidden", true);
  const d = data.byYear.get(h.year);
  const wm = d.warmestMonth;
  tooltip
    .attr("hidden", null)
    .html(
      `<div class="tt-year"><i style="background:${color(d.year)}"></i>${d.year}${d.complete ? "" : " (partial)"}</div>` +
        `<div>Annual mean <strong>${fmtSigned(d.anomaly)}°C</strong>${d.complete ? "" : ` <span class="muted">${d.n} months</span>`}</div>` +
        `<div>Warmest month ${MONTHS[wm.month - 1]} <strong>${fmtSigned(wm.anomaly)}°C</strong></div>` +
        (d.rm30 !== null ? `<div class="muted">30-yr avg centered here ${fmtSigned(d.rm30)}°C</div>` : ""),
    );
  const box = tooltip.node().getBoundingClientRect();
  const pad = 14;
  let left = h.event.clientX + pad;
  if (left + box.width > window.innerWidth - 8) left = h.event.clientX - box.width - pad;
  let top = h.event.clientY + pad;
  if (top + box.height > window.innerHeight - 8) top = h.event.clientY - box.height - pad;
  tooltip.style("left", `${Math.max(8, left)}px`).style("top", `${top}px`);
}

// ---- Year legend (the same scale both views use) ----
function drawLegend() {
  const host = d3.select("#year-legend");
  host.selectAll("*").remove();
  const w = Math.min(host.node().clientWidth, 360), h = 12, pad = 14;
  const svg = host.append("svg").attr("width", w).attr("height", h + 18);
  const grad = svg.append("defs").append("linearGradient").attr("id", "viridis-grad");
  d3.range(0, 1.001, 0.1).forEach((t) =>
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(data.firstYear + t * (data.lastYear - data.firstYear))),
  );
  svg.append("rect").attr("x", pad).attr("width", w - 2 * pad).attr("height", h).attr("rx", 2).attr("fill", "url(#viridis-grad)");
  const x = d3.scaleLinear().domain([data.firstYear, data.lastYear]).range([pad, w - pad]);
  svg.append("g")
    .attr("class", "legend-axis")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).tickValues([data.firstYear, 1900, 1950, 2000, data.lastYear]).tickFormat(d3.format("d")).tickSize(3));
}

// ---- Numbers quoted in the page text, computed from the data ----
function fillFacts() {
  const above = data.monthsAbove15;
  const set = (id, text) => d3.selectAll(`[data-fact="${id}"]`).text(text);
  set("latest", `${MONTHS[data.latestMonth.month - 1]} ${data.latestMonth.year}`);
  set("n-months", d3.format(",")(data.monthly.length));
  set("n-years", data.annual.length);
  set("offset", data.base.toFixed(3));
  set("warmest-year", data.warmestYear.year);
  set("warmest-value", fmtSigned(data.warmestYear.anomaly));
  set("months-above", above.length);
  set("first-above", `${MONTHS[above[0].month - 1]} ${above[0].year}`);
  set("rm30-year", data.rm30Last.year);
  set("rm30-value", fmtSigned(data.rm30Last.rm30));
}

// ---- Layout ----
function renderAll() {
  views.forEach((v) => v.render());
  drawLegend();
  refresh();
}
fillFacts();
renderAll();

let lastWidth = document.getElementById("viz").clientWidth;
new ResizeObserver(() => {
  const w = document.getElementById("viz").clientWidth;
  if (w === lastWidth) return;
  lastWidth = w;
  renderAll();
}).observe(document.getElementById("viz"));
