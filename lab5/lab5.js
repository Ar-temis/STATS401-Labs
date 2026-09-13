const DISTRICTS = ["Central", "North", "South", "East", "West"];

const DISTRICT_COLORS = {
  Central: "#1f77b4",
  North: "#2ca02c",
  South: "#d62728",
  East: "#ff7f0e",
  West: "#17becf"
};

const STATION_TYPES = ["Local", "Transfer", "Terminal"];

const STATION_SHAPES = {
  Local: d3.symbolCircle,
  Transfer: d3.symbolDiamond,
  Terminal: d3.symbolSquare
};

const ROUTE_TYPES = ["Metro", "Express", "Shuttle"];

const ROUTE_COLORS = {
  Metro: "#455a64",
  Express: "#e6a100",
  Shuttle: "#7b1fa2"
};

const ROUTE_DASHES = {
  Metro: null,
  Express: "10,6",
  Shuttle: "2,5"
};

const WIDTH = 900;
const HEIGHT = 640;

const tooltip = d3.select("#tooltip");

const districtColor = d3.scaleOrdinal()
  .domain(DISTRICTS)
  .range(DISTRICTS.map(d => DISTRICT_COLORS[d]));

const routeColor = d3.scaleOrdinal()
  .domain(ROUTE_TYPES)
  .range(ROUTE_TYPES.map(d => ROUTE_COLORS[d]));

function stationLabel(d) {
  return d.id.replace(/^s/, "");
}

function stationTooltip(d) {
  return `
    <strong>${d.station_name}</strong> (${d.id})<br>
    District: ${d.district}<br>
    Type: ${d.station_type}<br>
    Daily passengers: ${d3.format(",")(d.daily_passengers)}<br>
    Direct connections: ${d.degree}
  `;
}

function routeTooltip(d) {
  const a = d.source.id ?? d.source;
  const b = d.target.id ?? d.target;
  return `
    <strong>${a} — ${b}</strong><br>
    Route type: ${d.route_type}<br>
    Travel time: ${d.travel_time_min} min
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

Promise.all([
  d3.csv(
    "../data/lab5_assignment_stations.csv",
    d => ({
      id: d.id,
      station_name: d.station_name,
      district: d.district,
      daily_passengers: +d.daily_passengers,
      station_type: d.station_type
    })
  ),
  d3.csv(
    "../data/lab5_assignment_routes.csv",
    d => ({
      source: d.source,
      target: d.target,
      travel_time_min: +d.travel_time_min,
      route_type: d.route_type
    })
  )
])
  .then(([stations, routes]) => {

    const degree = d3.rollup(
      routes.flatMap(r => [r.source, r.target]),
      v => v.length,
      id => id
    );

    stations.forEach(s => {
      s.degree = degree.get(s.id) ?? 0;
    });

    const matrixRoutes = routes.map(r => ({ ...r }));

    drawNetwork(stations, routes);
    drawNetworkLegend(stations, routes);
    drawMatrix(stations, matrixRoutes);
  });

function drawNetwork(stations, routes) {

  const svg = d3.select("#network")
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  const areaScale = d3.scaleLinear()
    .domain(d3.extent(stations, d => d.daily_passengers))
    .range([70, 620]);

  const radiusOf = d => Math.sqrt(areaScale(d.daily_passengers) / Math.PI);

  const symbol = d3.symbol()
    .type(d => STATION_SHAPES[d.station_type])
    .size(d => areaScale(d.daily_passengers));

  const widthScale = d3.scaleLinear()
    .domain(d3.extent(routes, d => d.travel_time_min))
    .range([5, 1.25]);

  const distanceScale = d3.scaleLinear()
    .domain(d3.extent(routes, d => d.travel_time_min))
    .range([35, 105]);

  const link = svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(routes)
    .join("line")
    .attr("stroke", d => routeColor(d.route_type))
    .attr("stroke-width", d => widthScale(d.travel_time_min))
    .attr("stroke-dasharray", d => ROUTE_DASHES[d.route_type])
    .attr("stroke-opacity", 0.75)
    .attr("stroke-linecap", "round");

  const linkHit = svg.append("g")
    .attr("class", "link-hits")
    .selectAll("line")
    .data(routes)
    .join("line")
    .attr("stroke", "transparent")
    .attr("stroke-width", 12);

  const node = svg.append("g")
    .attr("class", "nodes")
    .selectAll("path")
    .data(stations)
    .join("path")
    .attr("d", symbol)
    .attr("fill", d => districtColor(d.district))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .style("cursor", "grab");

  const label = svg.append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(stations)
    .join("text")
    .text(stationLabel)
    .attr("font-size", 10)
    .attr("dy", "0.35em")
    .attr("pointer-events", "none");

  const simulation = d3.forceSimulation(stations)
    .force(
      "link",
      d3.forceLink(routes)
        .id(d => d.id)
        .distance(d => distanceScale(d.travel_time_min))
    )
    .force("charge", d3.forceManyBody().strength(-140))
    .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collision", d3.forceCollide().radius(d => radiusOf(d) + 6))
    .force("x", d3.forceX(WIDTH / 2).strength(0.06))
    .force("y", d3.forceY(HEIGHT / 2).strength(0.06));

  function ticked() {

    stations.forEach(d => {
      const r = radiusOf(d) + 2;
      d.x = Math.max(r, Math.min(WIDTH - r - 18, d.x));
      d.y = Math.max(r, Math.min(HEIGHT - r, d.y));
    });

    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    linkHit
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x}, ${d.y})`);

    label
      .attr("x", d => d.x + radiusOf(d) + 3)
      .attr("y", d => d.y);
  }

  simulation.tick(150);
  ticked();
  simulation.on("tick", ticked);


  node.call(
    d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      })
  );


  const neighbours = new Map(stations.map(d => [d.id, new Set([d.id])]));

  routes.forEach(r => {
    neighbours.get(r.source.id).add(r.target.id);
    neighbours.get(r.target.id).add(r.source.id);
  });

  function focusStation(d) {
    const keep = neighbours.get(d.id);

    node.attr("opacity", o => keep.has(o.id) ? 1 : 0.12);
    label.attr("opacity", o => keep.has(o.id) ? 1 : 0.12);
    link.attr(
      "stroke-opacity",
      l => l.source.id === d.id || l.target.id === d.id ? 1 : 0.06
    );
  }

  function focusRoute(r) {
    const ends = new Set([r.source.id, r.target.id]);

    node.attr("opacity", o => ends.has(o.id) ? 1 : 0.12);
    label.attr("opacity", o => ends.has(o.id) ? 1 : 0.12);
    link.attr("stroke-opacity", l => l === r ? 1 : 0.06);
  }

  function unfocus() {
    node.attr("opacity", 1);
    label.attr("opacity", 1);
    link.attr("stroke-opacity", 0.75);
  }

  node
    .on("mouseover", (event, d) => {
      focusStation(d);
      showTooltip(stationTooltip(d));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      unfocus();
      hideTooltip();
    });

  linkHit
    .on("mouseover", (event, d) => {
      focusRoute(d);
      showTooltip(routeTooltip(d));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      unfocus();
      hideTooltip();
    });
}

function drawNetworkLegend(stations, routes) {

  const legend = d3.select("#network-legend");

  const [minP, maxP] = d3.extent(stations, d => d.daily_passengers);
  const [minT, maxT] = d3.extent(routes, d => d.travel_time_min);

  function glyph(parent, w, h, build) {
    const svg = parent.append("svg")
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", `0 0 ${w} ${h}`);
    build(svg);
  }

  function section(title) {
    const block = legend.append("div").attr("class", "legend-block");
    block.append("div").attr("class", "legend-title").text(title);
    return block.append("div").attr("class", "legend");
  }

  const districts = section("District: Node color");

  DISTRICTS.forEach(dist => {
    const key = districts.append("span").attr("class", "key");
    glyph(key, 14, 14, svg =>
      svg.append("circle")
        .attr("cx", 7).attr("cy", 7).attr("r", 6)
        .attr("fill", districtColor(dist))
    );
    key.append("span").text(dist);
  });

  const types = section("Station type: Node shape");

  STATION_TYPES.forEach(type => {
    const key = types.append("span").attr("class", "key");
    glyph(key, 16, 16, svg =>
      svg.append("path")
        .attr("transform", "translate(8, 8)")
        .attr("d", d3.symbol().type(STATION_SHAPES[type]).size(110)())
        .attr("fill", "#777")
    );
    key.append("span").text(type);
  });

  const sizes = section("Daily passengers: Node area");

  [[minP, 70], [(minP + maxP) / 2, 345], [maxP, 620]].forEach(([value, area]) => {
    const key = sizes.append("span").attr("class", "key");
    glyph(key, 30, 30, svg =>
      svg.append("path")
        .attr("transform", "translate(15, 15)")
        .attr("d", d3.symbol().type(d3.symbolCircle).size(area)())
        .attr("fill", "#bbb")
    );
    key.append("span").text(d3.format(",")(Math.round(value)));
  });

  const routeTypes = section("Route type: Link color & dash");

  ROUTE_TYPES.forEach(type => {
    const key = routeTypes.append("span").attr("class", "key");
    glyph(key, 40, 10, svg =>
      svg.append("line")
        .attr("x1", 2).attr("y1", 5).attr("x2", 38).attr("y2", 5)
        .attr("stroke", routeColor(type))
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("stroke-dasharray", ROUTE_DASHES[type])
    );
    key.append("span").text(type);
  });

  const times = section("Travel time: Link width (quick = thick)");

  [[minT, 5], [(minT + maxT) / 2, 3.1], [maxT, 1.25]].forEach(([value, w]) => {
    const key = times.append("span").attr("class", "key");
    glyph(key, 40, 10, svg =>
      svg.append("line")
        .attr("x1", 2).attr("y1", 5).attr("x2", 38).attr("y2", 5)
        .attr("stroke", "#555")
        .attr("stroke-width", w)
        .attr("stroke-linecap", "round")
    );
    key.append("span").text(`${Math.round(value)} min`);
  });
}

const ORDERINGS = {
  id: {
    label: "Station ID",
    sort: (a, b) => d3.ascending(+a.id.slice(1), +b.id.slice(1)),
    groupBy: null
  },
  district: {
    label: "District",
    sort: (a, b) =>
      d3.ascending(DISTRICTS.indexOf(a.district), DISTRICTS.indexOf(b.district)) ||
      d3.ascending(+a.id.slice(1), +b.id.slice(1)),
    groupBy: d => d.district
  },
  type: {
    label: "Station type",
    sort: (a, b) =>
      d3.ascending(STATION_TYPES.indexOf(a.station_type), STATION_TYPES.indexOf(b.station_type)) ||
      d3.ascending(+a.id.slice(1), +b.id.slice(1)),
    groupBy: d => d.station_type
  },
  passengers: {
    label: "Daily passengers",
    sort: (a, b) => d3.descending(a.daily_passengers, b.daily_passengers),
    groupBy: null
  },
  degree: {
    label: "Connections",
    sort: (a, b) =>
      d3.descending(a.degree, b.degree) ||
      d3.ascending(+a.id.slice(1), +b.id.slice(1)),
    groupBy: null
  }
};

function drawMatrix(stations, routes) {

  const cell = 11;
  const size = cell * stations.length;
  const margin = { top: 64, right: 110, bottom: 10, left: 64 };

  const svg = d3.select("#matrix")
    .append("svg")
    .attr("viewBox", `0 0 ${size + margin.left + margin.right} ${size + margin.top + margin.bottom}`)
    .attr("width", size + margin.left + margin.right)
    .attr("height", size + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const cells = routes.flatMap(r => [
    { row: r.source, col: r.target, route: r },
    { row: r.target, col: r.source, route: r }
  ]);

  const x = d3.scaleBand().range([0, size]).paddingInner(0.12);
  const y = d3.scaleBand().range([0, size]).paddingInner(0.12);

  const opacityScale = d3.scaleLinear()
    .domain(d3.extent(routes, d => d.travel_time_min))
    .range([1, 0.3]);

  const barScale = d3.scaleLinear()
    .domain([0, d3.max(stations, d => d.daily_passengers)])
    .range([0, margin.right - 30]);

  const background = g.append("g").attr("class", "matrix-background");

  const gridRows = background.selectAll("rect")
    .data(stations)
    .join("rect")
    .attr("x", 0)
    .attr("width", size)
    .attr("fill", (d, i) => i % 2 ? "#f5f5f5" : "#fafafa");

  const separators = g.append("g").attr("class", "matrix-separators");

  const rects = g.append("g")
    .attr("class", "matrix-cells")
    .selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("fill", d => routeColor(d.route.route_type))
    .attr("fill-opacity", d => opacityScale(d.route.travel_time_min))
    .attr("rx", 1.5);

  const rowHeads = g.append("g")
    .attr("class", "matrix-rows")
    .selectAll("g")
    .data(stations)
    .join("g");

  rowHeads.append("rect")
    .attr("x", -margin.left)
    .attr("width", 6)
    .attr("fill", d => districtColor(d.district));

  rowHeads.append("path")
    .attr("d", d => d3.symbol().type(STATION_SHAPES[d.station_type]).size(34)())
    .attr("fill", "#666")
    .attr("transform", `translate(${-margin.left + 16}, 0)`);

  rowHeads.append("text")
    .attr("class", "matrix-label")
    .attr("x", -margin.left + 26)
    .attr("dy", "0.35em")
    .attr("font-size", 8.5)
    .text(stationLabel);

  rowHeads.append("rect")
    .attr("class", "passenger-bar")
    .attr("x", size + 8)
    .attr("width", d => barScale(d.daily_passengers))
    .attr("fill", "#c9c4bc");

  const colHeads = g.append("g")
    .attr("class", "matrix-cols")
    .selectAll("g")
    .data(stations)
    .join("g");

  colHeads.append("rect")
    .attr("y", -margin.top)
    .attr("height", 6)
    .attr("fill", d => districtColor(d.district));

  colHeads.append("path")
    .attr("d", d => d3.symbol().type(STATION_SHAPES[d.station_type]).size(34)())
    .attr("fill", "#666")
    .attr("transform", `translate(0, ${-margin.top + 16})`);

  colHeads.append("text")
    .attr("class", "matrix-label")
    .attr("font-size", 8.5)
    .attr("transform", `translate(0, ${-margin.top + 26}) rotate(-90)`)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(stationLabel);

  svg.append("text")
    .attr("x", margin.left + size + 8)
    .attr("y", margin.top - 8)
    .attr("font-size", 9)
    .attr("fill", "#666")
    .text("daily passengers");


  function focusPair(rowId, colId) {
    const hit = id => id === rowId || id === colId;

    rowHeads.selectAll("text").attr("font-weight", d => hit(d.id) ? "bold" : null);
    colHeads.selectAll("text").attr("font-weight", d => hit(d.id) ? "bold" : null);
    gridRows.attr("fill", d => hit(d.id) ? "#e8e8e8" : null);
    rects.attr("stroke", d => d.row === rowId && d.col === colId ? "#000" : null);
  }

  function unfocusPair() {
    rowHeads.selectAll("text").attr("font-weight", null);
    colHeads.selectAll("text").attr("font-weight", null);
    gridRows.attr("fill", (d, i) => i % 2 ? "#f5f5f5" : "#fafafa");
    rects.attr("stroke", null);
  }

  rects
    .on("mouseover", (event, d) => {
      focusPair(d.row, d.col);
      showTooltip(routeTooltip(d.route));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      unfocusPair();
      hideTooltip();
    });

  rowHeads
    .on("mouseover", (event, d) => {
      focusPair(d.id, d.id);
      showTooltip(stationTooltip(d));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      unfocusPair();
      hideTooltip();
    });

  colHeads
    .on("mouseover", (event, d) => {
      focusPair(d.id, d.id);
      showTooltip(stationTooltip(d));
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      unfocusPair();
      hideTooltip();
    });


  function reorder(key) {

    const ordering = ORDERINGS[key];
    const sorted = stations.slice().sort(ordering.sort);
    const ids = sorted.map(d => d.id);

    x.domain(ids);
    y.domain(ids);

    const t = svg.transition().duration(750);

    rects.transition(t)
      .attr("x", d => x(d.col))
      .attr("y", d => y(d.row))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth());

    rowHeads.transition(t)
      .attr("transform", d => `translate(0, ${y(d.id) + y.bandwidth() / 2})`);

    rowHeads.selectAll("rect")
      .attr("y", -y.bandwidth() / 2)
      .attr("height", y.bandwidth());

    colHeads.transition(t)
      .attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2}, 0)`);

    colHeads.selectAll("rect")
      .attr("x", -x.bandwidth() / 2)
      .attr("width", x.bandwidth());

    gridRows.transition(t)
      .attr("y", d => y(d.id) - y.step() * x.paddingInner() / 2)
      .attr("height", y.step());

    const boundaries = [];

    if (ordering.groupBy) {
      sorted.forEach((d, i) => {
        if (i > 0 && ordering.groupBy(d) !== ordering.groupBy(sorted[i - 1])) {
          boundaries.push(i * y.step() - y.step() * y.paddingInner() / 2);
        }
      });
    }

    separators.selectAll("line.h")
      .data(boundaries)
      .join("line")
      .attr("class", "h")
      .attr("x1", 0).attr("x2", size)
      .attr("y1", d => d).attr("y2", d => d)
      .attr("stroke", "#333")
      .attr("stroke-width", 1);

    separators.selectAll("line.v")
      .data(boundaries)
      .join("line")
      .attr("class", "v")
      .attr("y1", 0).attr("y2", size)
      .attr("x1", d => d).attr("x2", d => d)
      .attr("stroke", "#333")
      .attr("stroke-width", 1);
  }

  const controls = d3.select("#matrix-controls");

  controls.selectAll("button")
    .data(Object.keys(ORDERINGS))
    .join("button")
    .text(key => ORDERINGS[key].label)
    .classed("active", key => key === "district")
    .on("click", (event, key) => {
      controls.selectAll("button").classed("active", k => k === key);
      reorder(key);
    });

  reorder("district");
}
