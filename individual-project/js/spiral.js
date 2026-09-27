// Companion view: the repaired spiral. Angle = month (January at top, clockwise),
// radius = anomaly, one loop per year drawn up to the slider year.
import { Y_DOMAIN, SPIRAL_CENTER, THRESHOLDS, MONTHS, fmtSigned } from "./shared.js";
import { activeYears } from "./timeline.js";

const RINGS = [0, 0.5, 1.0, 1.5, 2.0];
const LABEL_ANGLE = -Math.PI / 12; // halfway between Dec and Jan, clear of the month labels

export function createSpiral(container, data, color, dispatch) {
  const root = d3.select(container);
  let g, r, loops, hits, centerYear, centerValue;

  const angle = (month) => ((month - 1) / 12) * 2 * Math.PI;
  // Screen position for an angle measured clockwise from 12 o'clock.
  const polar = (a, radius) => [Math.sin(a) * radius, -Math.cos(a) * radius];

  function render() {
    root.selectAll("*").remove();
    const size = Math.min(container.clientWidth, 520);
    const outer = size / 2 - 22; // room for month labels
    r = d3.scaleLinear().domain([SPIRAL_CENTER, Y_DOMAIN[1]]).range([0, outer]);

    const svg = root
      .append("svg")
      .attr("width", size)
      .attr("height", size)
      .attr("role", "img")
      .attr("aria-label", "Climate spiral: monthly anomalies by year, January at top");
    g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

    // Upright month labels.
    const monthLabels = g.append("g").attr("class", "month-labels");
    MONTHS.forEach((m, i) => {
      const [lx, ly] = polar(angle(i + 1), outer + 12);
      monthLabels.append("text")
        .attr("class", "month-label")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(m);
    });

    // Rings: 0 °C styled like the timeline's zero line, thresholds in the reserved hue.
    for (const v of RINGS) {
      const cls = v === 0 ? "zero-line" : THRESHOLDS.some((t) => t.value === v) ? "threshold" : "grid ring";
      g.append("circle").attr("class", cls).attr("r", r(v)).attr("fill", "none");
    }

    loops = g.append("g").attr("class", "loops");
    hits = g.append("g").attr("class", "loop-hits");

    // Ring labels go on top of the loops, with a halo.
    for (const v of RINGS) {
      const [lx, ly] = polar(LABEL_ANGLE, r(v));
      const isThreshold = THRESHOLDS.some((t) => t.value === v);
      g.append("text")
        .attr("class", `${isThreshold ? "threshold-label" : v === 0 ? "ref-label" : "ring-label"} halo`)
        .attr("x", lx).attr("y", ly - 3)
        .attr("text-anchor", "middle")
        .text(v === 0 ? "0°C (1850–1900 avg)" : `${fmtSigned(v, 1)}°C`);
    }

    centerYear = g.append("text").attr("class", "center-year halo").attr("text-anchor", "middle").attr("y", 4);
    centerValue = g.append("text").attr("class", "center-value halo").attr("text-anchor", "middle").attr("y", 22);
  }

  // One path per year; it reaches next January when that year is also drawn.
  const line = d3.lineRadial().angle((d) => angle(d.month) + (d.wrap ? 2 * Math.PI : 0)).radius((d) => r(d.anomaly)).curve(d3.curveCatmullRom.alpha(0.5));
  function loopPath(yearRow, connect) {
    const pts = yearRow.months.slice();
    const next = data.byYear.get(yearRow.year + 1);
    if (connect && next) pts.push({ ...next.months[0], wrap: true });
    return line(pts);
  }

  function update(state) {
    const shown = data.annual.filter((d) => d.year <= state.year);
    const active = activeYears(state);

    loops
      .selectAll("path")
      .data(shown, (d) => d.year)
      .join("path")
      .order() // restore year order before raising the focused loops
      .attr("d", (d) => loopPath(d, d.year < state.year))
      .attr("stroke", (d) => color(d.year))
      .attr("stroke-width", (d) => (d.year === state.year || d.year === state.hover ? 2.6 : 1.2))
      .attr("stroke-opacity", (d) => {
        if (active) return active(d.year) ? 1 : 0.15;
        return d.year === state.year ? 1 : 0.8;
      });

    // Keep the focused year on top without reordering the data join.
    loops.selectAll("path").filter((d) => d.year === state.year || (active && active(d.year))).raise();

    hits
      .selectAll("path")
      .data(shown, (d) => d.year)
      .join("path")
      .attr("d", (d) => loopPath(d, false))
      .on("pointermove", (event, d) => dispatch.call("hover", null, { year: d.year, event }))
      .on("pointerleave", () => dispatch.call("hover", null, null));

    const row = data.byYear.get(state.year);
    centerYear.text(state.year);
    centerValue.text(`${fmtSigned(row.anomaly)}°C`);
  }

  return { render, update };
}
