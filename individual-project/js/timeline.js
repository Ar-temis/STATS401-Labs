// Primary view: year on x, anomaly on y (position on a common scale).
import { THEME, Y_DOMAIN, THRESHOLDS, fmtSigned } from "./shared.js";

// Events from Hawkins' FAQ. Periods get a bracket; single years get a leader line.
const PERIODS = [
  { from: 1883, to: 1910, lane: 1.15, label: "Volcanic cooling, 1880s–1910", short: "Volcanic cooling" },
  { from: 1910, to: 1945, lane: 0.98, label: "Warming, 1910–1940s", short: "Warming" },
  { from: 1950, to: 1979, lane: 0.85, label: "Flat, 1950s–1970s (aerosols)", short: "Flat (aerosols)" },
];
const POINTS = [
  { year: 1878, labelY: 0.78, anchor: "middle", label: "1877–78 El Niño", short: "1877–78 El Niño" },
  { year: 1998, labelY: 0.12, anchor: "end", label: "1998 El Niño", short: "1998 El Niño" },
  { year: 2016, labelY: 0.35, anchor: "end", label: "2016 El Niño", short: "2016 El Niño" },
];

export function createTimeline(container, data, color, dispatch) {
  const root = d3.select(container);
  let svg, x, y, g, brush, brushG, width, height, narrow;
  const margin = { top: 14, right: 14, bottom: 30, left: 50 };

  function render() {
    root.selectAll("*").remove();
    const outer = container.clientWidth;
    narrow = outer < 560;
    width = outer - margin.left - margin.right;
    height = Math.max(300, Math.min(460, outer * 0.62)) - margin.top - margin.bottom;

    svg = root
      .append("svg")
      .attr("width", outer)
      .attr("height", height + margin.top + margin.bottom)
      .attr("role", "img")
      .attr("aria-label", "Line chart of global temperature anomaly by year, 1850 to latest");
    g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    x = d3.scaleLinear().domain([data.firstYear, data.lastYear + 1]).range([0, width]);
    y = d3.scaleLinear().domain(Y_DOMAIN).range([height, 0]);

    // Gridlines and axes stay recessive.
    const yTicks = d3.range(-0.5, 2.01, 0.5);
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(yTicks.filter((v) => v !== 0 && !THRESHOLDS.some((t) => t.value === v)))
      .join("line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", y).attr("y2", y);

    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(narrow ? 5 : 9).tickFormat(d3.format("d")).tickSizeOuter(0));
    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).tickValues(yTicks).tickFormat((d) => fmtSigned(d, 1) + "°C").tickSizeOuter(0));

    // 0 °C reference: the 1850–1900 average.
    g.append("line")
      .attr("class", "zero-line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", y(0)).attr("y2", y(0));
    g.append("text")
      .attr("class", "ref-label halo")
      .attr("x", width - 4).attr("y", y(0) + 14)
      .attr("text-anchor", "end")
      .text("0°C = 1850–1900 average");

    // Thresholds, in the one hue reserved for them.
    for (const t of THRESHOLDS) {
      g.append("line")
        .attr("class", "threshold")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", y(t.value)).attr("y2", y(t.value));
      g.append("text")
        .attr("class", "threshold-label halo")
        .attr("x", 4).attr("y", y(t.value) - 5)
        .text(narrow ? t.short : t.label);
    }

    // Annual means joined by a thin neutral line.
    g.append("path")
      .datum(data.annual)
      .attr("class", "annual-line")
      .attr("d", d3.line().x((d) => x(d.year + 0.5)).y((d) => y(d.anomaly)));

    // 30-year running mean.
    g.append("path")
      .datum(data.rm30)
      .attr("class", "rm30-line")
      .attr("d", d3.line().x((d) => x(d.year + 0.5)).y((d) => y(d.rm30)));
    // Direct label sits in the empty band above the line's end; the legend covers narrow screens.
    if (!narrow) {
      const end = data.rm30Last;
      const ex = x(end.year + 0.5), ey = y(end.rm30);
      g.append("line")
        .attr("class", "event-leader")
        .attr("x1", ex).attr("x2", ex)
        .attr("y1", ey - 5).attr("y2", y(end.rm30 + 0.3) + 3);
      g.append("text")
        .attr("class", "rm30-label halo")
        .attr("x", ex + 3).attr("y", y(end.rm30 + 0.3))
        .attr("text-anchor", "end")
        .text(`30-year average (ends ${end.year})`);
    }

    drawEvents();

    // Year cursor.
    g.append("line").attr("class", "cursor").attr("y1", 0).attr("y2", height);

    // Annual dots, colored with the shared year scale.
    g.append("g")
      .attr("class", "annual-dots")
      .selectAll("circle")
      .data(data.annual, (d) => d.year)
      .join("circle")
      .attr("cx", (d) => x(d.year + 0.5))
      .attr("cy", (d) => y(d.anomaly))
      .attr("r", narrow ? 2.6 : 3.4)
      .attr("fill", (d) => (d.complete ? color(d.year) : THEME.panel))
      .attr("stroke", (d) => (d.complete ? THEME.panel : color(d.year)))
      .attr("stroke-width", (d) => (d.complete ? 0.8 : 1.6));

    // Brush on top; it also carries hover.
    brush = d3
      .brushX()
      .extent([[0, 0], [width, height]])
      .on("brush end", (event) => {
        if (!event.sourceEvent) return; // ignore programmatic moves
        dispatch.call("range", null, event.selection ? toYears(event.selection) : null);
      });
    brushG = g.append("g").attr("class", "brush").call(brush);
    brushG
      .on("pointermove.hover", (event) => {
        const [px] = d3.pointer(event, g.node());
        const year = Math.max(data.firstYear, Math.min(data.lastYear, Math.floor(x.invert(px))));
        dispatch.call("hover", null, { year, event });
      })
      .on("pointerleave.hover", () => dispatch.call("hover", null, null));
  }

  function drawEvents() {
    const ev = g.append("g").attr("class", "events");

    for (const p of PERIODS) {
      const x0 = x(p.from), x1 = x(p.to), yy = y(p.lane);
      ev.append("path")
        .attr("class", "event-bracket")
        .attr("d", `M${x0},${yy + 5}V${yy}H${x1}V${yy + 5}`);
      ev.append("text")
        .attr("class", "event-label halo")
        .attr("x", (x0 + x1) / 2).attr("y", yy - 5)
        .attr("text-anchor", "middle")
        .text(narrow ? p.short : p.label);
    }

    const warmest = data.warmestYear;
    const points = [
      ...POINTS,
      {
        year: warmest.year,
        labelY: 1.84,
        anchor: "end",
        label: `Warmest year: ${warmest.year} (${fmtSigned(warmest.anomaly)}°C)`,
        short: `Warmest: ${warmest.year}`,
      },
    ];
    // On narrow screens only the warmest year keeps a label; the rest live in the tooltip.
    for (const p of narrow ? points.slice(-1) : points) {
      const d = data.byYear.get(p.year);
      const px = x(p.year + 0.5), py = y(d.anomaly), ly = y(p.labelY);
      const above = ly < py;
      ev.append("line")
        .attr("class", "event-leader")
        .attr("x1", px).attr("x2", px)
        .attr("y1", above ? py - 5 : py + 5)
        .attr("y2", above ? ly + 3 : ly - 11);
      ev.append("text")
        .attr("class", "event-label halo")
        .attr("x", p.anchor === "end" ? px + 3 : px)
        .attr("y", ly)
        .attr("text-anchor", p.anchor)
        .text(narrow ? p.short : p.label);
    }
  }

  function toYears([a, b]) {
    const y0 = Math.min(data.lastYear, Math.max(data.firstYear, Math.floor(x.invert(a))));
    const y1 = Math.max(y0, Math.min(data.lastYear, Math.floor(x.invert(b))));
    return [y0, y1];
  }

  function update(state) {
    const active = activeYears(state);
    g.select(".cursor")
      .attr("x1", x(state.year + 0.5))
      .attr("x2", x(state.year + 0.5));

    g.selectAll(".annual-dots circle")
      .attr("opacity", (d) => {
        if (active) return active(d.year) ? 1 : 0.2;
        return d.year <= state.year ? 1 : 0.3;
      })
      .attr("r", (d) => {
        const base = narrow ? 2.6 : 3.4;
        return state.hover === d.year ? base + 2.5 : base;
      });

    // Keep the brush drawn where the state says it is (e.g. after a resize or reset).
    const sel = d3.brushSelection(brushG.node());
    if (!state.range && sel) brushG.call(brush.move, null);
    if (state.range && !sel) brushG.call(brush.move, [x(state.range[0]), x(state.range[1] + 1)]);
  }

  return { render, update };
}

// Which years are "in focus": the hovered year, else the brushed range.
export function activeYears(state) {
  if (state.hover !== null) return (yr) => yr === state.hover;
  if (state.range) return (yr) => yr >= state.range[0] && yr <= state.range[1];
  return null;
}
