const STATUSES = ["Increase", "Unchanged", "Decrease"];

const STATUS_COLORS = {
  Increase: "#2f9e63",
  Unchanged: "#8c8c8c",
  Decrease: "#d1495b"
};

const STATUS_GLYPHS = {
  Increase: "▲",
  Unchanged: "▬",
  Decrease: "▼"
};

const TILINGS = [
  {
    id: "squarify",
    name: "Squarify",
    tile: d3.treemapSquarify
  },
  {
    id: "slicedice",
    name: "Slice-and-dice",
    tile: d3.treemapSliceDice
  }
];

const WIDTH = 960;
const HEIGHT = 560;

const HEADER_HEIGHT = { 1: 22, 2: 18 };

const PADDING = 3;

const width = d => d.x1 - d.x0;
const height = d => d.y1 - d.y0;

function outerPadding(d) {
  return Math.min(PADDING, width(d) / 8, height(d) / 8);
}

function hasHeader(d) {
  return width(d) > 36 && height(d) > 2 * HEADER_HEIGHT[d.depth];
}

const LEVEL_NAMES = ["World", "Continent", "Area", "Country"];

const tooltip = d3.select("#tooltip");

const statusColor = d3.scaleOrdinal()
  .domain(STATUSES)
  .range(STATUSES.map(s => STATUS_COLORS[s]));

const formatGdp = d3.format(",");
const formatShare = d3.format(".1%");

function gdpLabel(value) {
  return `$${formatGdp(value)} B`;
}

function countryTooltip(d, world) {
  const [continent, area] = d.ancestors().reverse().slice(1, 3);
  return `
    <strong>${d.data.name}</strong><br>
    Continent: ${continent.data.name}<br>
    Area: ${area.data.name}<br>
    GDP: ${gdpLabel(d.value)} (${formatShare(d.value / world)} of world)<br>
    Status: ${STATUS_GLYPHS[d.data.status]} ${d.data.status}
  `;
}

function groupTooltip(d, world) {
  const counts = d3.rollup(d.leaves(), v => v.length, l => l.data.status);
  const breakdown = STATUSES
    .map(s => `${counts.get(s) ?? 0} ${STATUS_GLYPHS[s]}`)
    .join(" / ");

  return `
    <strong>${d.data.name}</strong> (${LEVEL_NAMES[d.depth].toLowerCase()})<br>
    ${d.depth === 2 ? `Continent: ${d.parent.data.name}<br>` : ""}
    Total GDP: ${gdpLabel(d.value)} (${formatShare(d.value / world)} of world)<br>
    ${d.leaves().length} countries: ${breakdown}
  `;
}

function showTooltip(html) {
  tooltip.style("opacity", 1).html(html);
}

function moveTooltip(event) {
  tooltip
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

d3.json("../data/lab6_assignment_gdp.json")
  .then(data => {
    TILINGS.forEach(tiling => drawTreemap(data, tiling));
    drawLegend();
  });

function drawTreemap(data, tiling) {

  const root = d3.hierarchy(data)
    .sum(d => d.gdp || 0)
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(tiling.tile)
    .size([WIDTH, HEIGHT])
    .paddingOuter(outerPadding)
    .paddingTop(d => hasHeader(d) ? HEADER_HEIGHT[d.depth] : outerPadding(d))
    .paddingInner(d => Math.min(d.depth === 1 ? 3 : 2, outerPadding(d)))
    (root);

  const world = root.value;

  const svg = d3.select(`#treemap-${tiling.id}`)
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  const group = svg.append("g")
    .attr("class", "groups")
    .selectAll("g")
    .data(root.descendants().filter(d => d.depth === 1 || d.depth === 2))
    .join("g")
    .attr("class", d => d.depth === 1 ? "continent" : "area")
    .attr("transform", d => `translate(${d.x0}, ${d.y0})`);

  group.append("rect")
    .attr("width", width)
    .attr("height", height);

  group.filter(hasHeader)
    .append("text")
    .attr("x", 5)
    .attr("y", d => HEADER_HEIGHT[d.depth] - 6)
    .text(d => d.data.name)
    .each(function(d) {
      if (!fits(this, d)) this.remove();
    });

  const cell = svg.append("g")
    .attr("class", "countries")
    .selectAll("g")
    .data(root.leaves())
    .join("g")
    .attr("class", "country")
    .attr("transform", d => `translate(${d.x0}, ${d.y0})`);

  cell.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", d => statusColor(d.data.status));

  cell.each(function(d) {
    const g = d3.select(this);

    const name = g.append("text")
      .attr("class", "name")
      .attr("x", 5)
      .attr("y", 15)
      .text(`${STATUS_GLYPHS[d.data.status]} ${d.data.name}`);

    if (!fits(name.node(), d)) {
      if (fitsRotated(name.node(), d)) {
        name.attr("transform", "rotate(90)").attr("x", 6).attr("y", -6);
      } else {
        name.remove();
      }
      return;
    }

    const gdp = g.append("text")
      .attr("class", "gdp")
      .attr("x", 5)
      .attr("y", 29)
      .text(gdpLabel(d.value));

    if (!fits(gdp.node(), d)) gdp.remove();
  });

  function fits(text, d) {
    return text.getComputedTextLength() <= width(d) - 8
      && +text.getAttribute("y") <= height(d) - 3;
  }

  function fitsRotated(text, d) {
    return text.getComputedTextLength() <= height(d) - 10 && width(d) >= 18;
  }

  group
    .on("mouseover", (event, d) => showTooltip(groupTooltip(d, world)))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

  cell
    .on("mouseover", (event, d) => showTooltip(countryTooltip(d, world)))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);
}

function drawLegend() {

  const legend = d3.select("#status-legend");

  const statuses = legend.append("div").attr("class", "legend");

  STATUSES.forEach(status => {
    const key = statuses.append("span").attr("class", "key");
    key.append("i").style("background", statusColor(status));
    key.append("span").text(`${STATUS_GLYPHS[status]} ${status}`);
  });

  const structure = legend.append("div").attr("class", "legend");

  [
    ["continent", "Thick outline: Continent"],
    ["area", "Grey box: Area"],
    ["country", "Colored cell: Country (area = GDP)"]
  ].forEach(([cls, label]) => {
    const key = structure.append("span").attr("class", "key");
    key.append("i").attr("class", `swatch-${cls}`);
    key.append("span").text(label);
  });
}
