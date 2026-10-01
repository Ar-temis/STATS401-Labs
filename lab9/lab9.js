const WIDTH = 960;
const HEIGHT = 500;

const CARTOGRAM_ITERATIONS = 60;

const NO_DATA_AREA_SHARE = 0.05;

const NO_DATA_FILL = "url(#no-data-hatch)";

const tooltip = d3.select("#tooltip");

const fmtGdp = d =>
  d >= 1000
    ? `$${d3.format(",.2f")(d / 1000)} trillion`
    : `$${d3.format(",.0f")(d)} billion`;

const fmtPct = d3.format(".1%");

const state = {
  hovered: null,
  pinned: null
};

Promise.all([
  d3.json("../data/ne_110m_admin_0_countries.geojson"),

  d3.csv("../data/lab9_gdp_2025_top50.csv", d => ({
    iso3: d.iso3,
    country: d.country,
    gdp: +d.gdp_2025_billion_usd,
    rank: +d.rank
  }))
]).then(([geoData, stats]) => {
  geoData.features = geoData.features.filter(
    f => f.properties.ADM0_A3 !== "ATA"
  );

  geoData.features.forEach(f => {
    const p = f.properties;
    p.iso3 = p.ISO_A3 !== "-99" ? p.ISO_A3 : p.ADM0_A3;
  });

  const statsById = new Map(stats.map(d => [d.iso3, d]));
  const totalGdp = d3.sum(stats, d => d.gdp);

  geoData.features.forEach(feature => {
    const row = statsById.get(feature.properties.iso3);

    feature.properties.value = row ? row.gdp : null;
    feature.properties.rank = row ? row.rank : null;
    feature.properties.label = row ? row.country : feature.properties.NAME;
  });

  const geoIds = new Set(geoData.features.map(f => f.properties.iso3));
  const unmatched = stats.filter(d => !geoIds.has(d.iso3));
  const noData = geoData.features.filter(f => f.properties.value == null);

  d3.select("#join-status").html(
    `<strong>Join check:</strong> ${stats.length - unmatched.length} of ` +
    `${stats.length} GDP rows matched a GeoJSON feature by <code>iso3</code>` +
    (unmatched.length
      ? ` (unmatched: ${unmatched.map(d => d.iso3).join(", ")})`
      : "") +
    `; ${noData.length} of ${geoData.features.length} map features ` +
    `have no GDP value in the dataset and are drawn as missing data.`
  );

  const projection = d3.geoEqualEarth().fitExtent(
    [
      [10, 10],
      [WIDTH - 10, HEIGHT - 10]
    ],
    geoData
  );

  const path = d3.geoPath().projection(projection);

  const [minGdp, maxGdp] = d3.extent(stats, d => d.gdp);

  const colorScale = d3
    .scaleSequentialLog(t => d3.interpolateBlues(0.2 + 0.8 * t))
    .domain([minGdp, maxGdp]);

  const fillFor = d =>
    d.properties.value == null ? NO_DATA_FILL : colorScale(d.properties.value);

  const choropleth = createMapView("#choropleth", {
    title: "2025 nominal GDP by country (color = GDP)"
  });

  const cartogram = createMapView("#cartogram", {
    title: "2025 nominal GDP cartogram (area = GDP)"
  });

  choropleth.countries = choropleth.mapGroup
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(geoData.features, d => d.properties.iso3)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", fillFor);

  attachInteraction(choropleth.countries);
  drawColorLegend(colorScale, minGdp, maxGdp);

  const planarFeatures = geoData.features.map(f => ({
    ...f,
    geometry: projectGeometry(f.geometry, projection)
  }));

  const landArea = f =>
    d3.sum(f.geometry.coordinates, poly => Math.abs(d3.polygonArea(poly[0])));

  const noDataLand = d3.sum(
    planarFeatures.filter(f => f.properties.value == null),
    landArea
  );

  const placeholderFor = f =>
    ((landArea(f) / noDataLand) * totalGdp * NO_DATA_AREA_SHARE) /
    (1 - NO_DATA_AREA_SHARE);

  const planarPath = d3.geoPath();

  cartogram.countries = cartogram.mapGroup
    .append("g")
    .attr("class", "countries")
    .selectAll("path")
    .data(planarFeatures, d => d.properties.iso3)
    .join("path")
    .attr("class", "country")
    .attr("d", planarPath)
    .attr("fill", fillFor);

  attachInteraction(cartogram.countries);

  const labelGroup = cartogram.mapGroup.append("g").attr("class", "map-labels");

  const weightById = new Map(
    planarFeatures.map(f => [f.properties.iso3, f.properties.value ?? placeholderFor(f)])
  );
  const valueFor = f => weightById.get(f.properties.iso3);
  const totalWeight = d3.sum(planarFeatures, valueFor);
  const targetShare = new Map(
    planarFeatures.map(f => [f.properties.iso3, valueFor(f) / totalWeight])
  );

  let areaShares = new Map();
  let economyShares = new Map();
  let timer = null;

  function runCartogram() {
    if (timer) timer.stop();

    const carto = createCartogram(planarFeatures, valueFor);

    d3.select("#replay").property("disabled", true);
    redrawCartogram(planarFeatures, "Starting");

    timer = d3.interval(() => {
      carto.step();
      const done = carto.iteration() >= CARTOGRAM_ITERATIONS;

      redrawCartogram(
        carto.features(),
        done
          ? "Finished"
          : `Iteration ${carto.iteration()} of ${CARTOGRAM_ITERATIONS}`
      );

      if (done) {
        timer.stop();
        timer = null;
        d3.select("#replay").property("disabled", false);
      }
    }, 40);
  }

  function redrawCartogram(moved, phaseLabel) {
    areaShares = areaSharesOf(moved);

    cartogram.countries.data(moved, d => d.properties.iso3).attr("d", planarPath);

    const labelled = moved.filter(
      f =>
        f.properties.value != null &&
        (areaShares.get(f.properties.iso3) ?? 0) > 0.0045
    );

    labelGroup
      .selectAll("text")
      .data(labelled, d => d.properties.iso3)
      .join("text")
      .attr("transform", d => `translate(${largestPartCentroid(d)})`)
      .attr("font-size", d =>
        Math.max(8, Math.min(18, 70 * Math.sqrt(areaShares.get(d.properties.iso3))))
      )
      .text(d => d.properties.iso3);

    const economyArea = d3.sum(areaShares, ([id, share]) =>
      statsById.has(id) ? share : 0
    );
    economyShares = new Map(
      [...areaShares]
        .filter(([id]) => statsById.has(id))
        .map(([id, share]) => [id, share / economyArea])
    );

    const misallocated =
      d3.sum(areaShares, ([id, share]) => Math.abs(share - targetShare.get(id))) / 2;

    d3.select("#cartogram-status").text(
      `${phaseLabel} · area misallocated: ${fmtPct(misallocated)} of the map`
    );

    applyHighlight();
  }

  d3.select("#replay").on("click", runCartogram);

  function attachInteraction(selection) {
    selection
      .on("mouseover", function(event, d) {
        state.hovered = d.properties.iso3;
        applyHighlight();
        showTooltip(event, d);
      })
      .on("mousemove", function(event) {
        moveTooltip(event);
      })
      .on("mouseout", function() {
        state.hovered = null;
        applyHighlight();
        tooltip.style("opacity", 0);
      })
      .on("click", function(event, d) {
        const id = d.properties.iso3;
        setPinned(state.pinned === id ? null : id);
      });
  }

  function applyHighlight() {
    const active = new Set([state.hovered, state.pinned].filter(Boolean));
    const anyActive = active.size > 0;

    [choropleth, cartogram].forEach(view => {
      view.countries
        .classed("highlighted", d => active.has(d.properties.iso3))
        .classed("dimmed", d => anyActive && !active.has(d.properties.iso3))
        .filter(d => active.has(d.properties.iso3))
        .raise();
    });

    updateSelectionPanel();
  }

  function setPinned(id) {
    state.pinned = id;
    d3.select("#country-select").property("value", id ?? "");
    applyHighlight();
  }

  function tooltipHtml(d) {
    const p = d.properties;
    if (p.value == null) {
      return `<strong>${p.label}</strong><br>No GDP value in the top-50 dataset`;
    }
    const share = economyShares.get(p.iso3);
    return (
      `<strong>${p.label}</strong> (rank ${p.rank})<br>` +
      `2025 GDP: ${fmtGdp(p.value)}<br>` +
      `Share of top-50 GDP: ${fmtPct(p.value / totalGdp)}` +
      (share != null ? `<br>Share of top-50 cartogram area: ${fmtPct(share)}` : "")
    );
  }

  function showTooltip(event, d) {
    tooltip.style("opacity", 1).html(tooltipHtml(d));
    moveTooltip(event);
  }

  function moveTooltip(event) {
    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);
  }

  const select = d3.select("#country-select");

  select
    .selectAll("option.country-option")
    .data(stats.filter(d => geoIds.has(d.iso3)))
    .join("option")
    .attr("class", "country-option")
    .attr("value", d => d.iso3)
    .text(d => `${d.rank}. ${d.country}`);

  select.on("change", function() {
    setPinned(this.value || null);
  });

  d3.select("#clear-selection").on("click", () => setPinned(null));

  d3.select("#reset-zoom").on("click", () => {
    [choropleth, cartogram].forEach(view =>
      view.svg.transition().duration(500).call(view.zoom.transform, d3.zoomIdentity)
    );
  });

  function updateSelectionPanel() {
    const id = state.hovered ?? state.pinned;
    const panel = d3.select("#selection-info");

    if (!id) {
      panel.html(
        "Hover over or click a country in either map to highlight it in both."
      );
      return;
    }

    const feature = geoData.features.find(f => f.properties.iso3 === id);
    const p = feature.properties;

    if (p.value == null) {
      panel.html(`<strong>${p.label}</strong>: no GDP value in the dataset.`);
      return;
    }

    const share = economyShares.get(id);
    panel.html(
      `<strong>${p.label}</strong> · rank ${p.rank} · ${fmtGdp(p.value)} · ` +
      `${fmtPct(p.value / totalGdp)} of top-50 GDP` +
      (share != null ? ` · ${fmtPct(share)} of top-50 cartogram area` : "") +
      (state.pinned === id ? " · <em>pinned (click again to release)</em>" : "")
    );
  }

  updateSelectionPanel();
  runCartogram();
});


function createMapView(container, { title }) {
  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    .attr("role", "img")
    .attr("aria-label", title);

  svg
    .append("rect")
    .attr("class", "map-background")
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  addHatchPattern(svg);

  const mapGroup = svg.append("g");

  const zoom = d3
    .zoom()
    .scaleExtent([1, 8])
    .translateExtent([
      [0, 0],
      [WIDTH, HEIGHT]
    ])
    .on("zoom", function(event) {
      mapGroup.attr("transform", event.transform);
    });

  svg.call(zoom);

  return { svg, mapGroup, zoom };
}

function addHatchPattern(svg) {
  if (!d3.select("#no-data-hatch").empty()) return;

  const pattern = svg
    .append("defs")
    .append("pattern")
    .attr("id", "no-data-hatch")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", "rotate(45)");

  pattern
    .append("rect")
    .attr("width", 6)
    .attr("height", 6)
    .attr("fill", "#ececec");

  pattern
    .append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", 6)
    .attr("stroke", "#c4c4c4")
    .attr("stroke-width", 1.5);
}

function projectGeometry(geometry, projection) {
  const ring = r => r.map(p => projection(p));
  const polygon = poly => poly.map(ring);
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  return { type: "MultiPolygon", coordinates: polygons.map(polygon) };
}

function areaSharesOf(features) {
  const areas = features.map(f => [
    f.properties.iso3,
    d3.sum(f.geometry.coordinates, poly =>
      poly.reduce(
        (sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(d3.polygonArea(ring)),
        0
      )
    )
  ]);
  const total = d3.sum(areas, d => d[1]);
  return new Map(areas.map(([id, a]) => [id, a / total]));
}

function largestPartCentroid(feature) {
  const parts = feature.geometry.coordinates;
  const biggest = d3.greatest(parts, poly => Math.abs(d3.polygonArea(poly[0])));
  return d3.polygonCentroid(biggest[0]);
}

function drawColorLegend(colorScale, minGdp, maxGdp) {
  const width = 360;
  const height = 54;
  const barHeight = 12;
  const margin = { left: 12, right: 24 };

  const svg = d3
    .select("#choropleth-legend")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3
    .scaleLog()
    .domain([minGdp, maxGdp])
    .range([margin.left, width - margin.right]);

  const gradient = svg
    .append("defs")
    .append("linearGradient")
    .attr("id", "gdp-gradient");

  d3.range(0, 1.0001, 0.1).forEach(t => {
    const value = Math.exp(
      Math.log(minGdp) + t * (Math.log(maxGdp) - Math.log(minGdp))
    );
    gradient
      .append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", colorScale(value));
  });

  svg
    .append("rect")
    .attr("x", margin.left)
    .attr("y", 18)
    .attr("width", width - margin.left - margin.right)
    .attr("height", barHeight)
    .attr("fill", "url(#gdp-gradient)");

  svg
    .append("text")
    .attr("x", margin.left)
    .attr("y", 11)
    .attr("class", "legend-caption")
    .text("2025 GDP, billions of US$ (log scale)");

  svg
    .append("g")
    .attr("transform", `translate(0, ${18 + barHeight})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues([300, 1000, 3000, 10000, 30000])
        .tickFormat(d3.format(","))
        .tickSize(5)
    )
    .call(g => g.select(".domain").remove());
}
