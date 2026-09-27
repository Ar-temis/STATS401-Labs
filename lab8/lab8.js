const PALETTE = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#b6992d",
  "#1f3b73",
  "#8cd17d"
];

const MAP_WIDTH = 620;
const MAP_HEIGHT = 580;
const MAP_MARGIN = 18;

const MATRIX_LABEL_WIDTH = 230;
const MATRIX_CELL = 27;
const MATRIX_ENTROPY_WIDTH = 56;
const MATRIX_HEADER_HEIGHT = 150;

const tooltip = d3.select("#tooltip");

const formatNumber = d3.format(",");
const formatPercent = d3.format(".0%");
const formatScore = d3.format(".2f");

const state = {
  query: "",
  formal: "all",
  topic: "all",
  selected: null,
  colorBy: "topic",
  rowMode: "section",
  valueMode: "count"
};

function chapterNumber(chapter) {
  return +chapter.match(/^Part (\d+)/)[1];
}

function shortChapter(chapter) {
  return chapter.replace(/^Part (\d+): /, "P$1 ");
}

function truncate(text, n) {
  return text.length > n ? text.slice(0, n - 1) + "…" : text;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightQuery(text) {
  const safe = escapeHtml(text);
  if (state.query === "" || /^p\d{4}$/.test(state.query)) return safe;
  const pattern = state.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(pattern, "gi"), m => `<mark>${m}</mark>`);
}

function matchesQuery(d) {
  return (
    state.query === "" ||
    d.passage_id === state.query ||
    d.text.toLowerCase().includes(state.query)
  );
}

function matchesFormal(d) {
  if (state.formal === "all") return true;
  const [level, name] = state.formal.split("::");
  return d[level] === name;
}

function matchesTopic(d) {
  return state.topic === "all" || d.cluster === state.topic;
}

function isActive(d) {
  return matchesQuery(d) && matchesFormal(d) && matchesTopic(d);
}

function showTooltip(html) {
  tooltip.style("opacity", 1).html(html);
}

function moveTooltip(event) {
  tooltip
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY - 10}px`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function entropy(counts) {
  const total = d3.sum(counts);
  if (total === 0) return 0;
  return -d3.sum(counts, c => (c > 0 ? (c / total) * Math.log2(c / total) : 0));
}

Promise.all([
  d3.csv("../data/lab8_embedding_map.csv", d => ({
    ...d,
    x: +d.x,
    y: +d.y,
    page: +d.page,
    word_count: +d.word_count,
    cluster: +d.cluster,
    section_typicality: d.section_typicality === "" ? null : +d.section_typicality,
    neighbors: d.neighbors.split(";"),
    neighbor_scores: d.neighbor_scores.split(";").map(Number)
  })),
  d3.csv("../data/lab8_topic_section_matrix.csv", d3.autoType),
  d3.csv("../data/lab8_cluster_terms.csv", d3.autoType),
  d3.csv("../data/lab8_top_terms.csv", d3.autoType)
]).then(([passages, matrixRows, clusterTerms, topTerms]) => {
  passages.forEach((d, i) => (d.index = i));

  const chapters = [...new Set(passages.map(d => d.chapter))]
    .sort((a, b) => chapterNumber(a) - chapterNumber(b));

  const topics = d3
    .groups(passages, d => d.cluster)
    .map(([cluster, rows]) => ({
      cluster,
      name: rows[0].cluster_name,
      count: rows.length,
      position: d3.median(rows, d => d.index)
    }))
    .sort((a, b) => a.position - b.position);

  const ctx = {
    passages,
    matrixRows,
    chapters,
    topics,
    byId: new Map(passages.map(d => [d.passage_id, d])),
    topicName: new Map(topics.map(t => [t.cluster, t.name])),
    topicColor: d3.scaleOrdinal().domain(d3.range(PALETTE.length)).range(PALETTE),
    chapterColor: d3.scaleOrdinal().domain(chapters).range(PALETTE)
  };

  ctx.colorOf = d =>
    state.colorBy === "topic" ? ctx.topicColor(d.cluster) : ctx.chapterColor(d.chapter);

  drawCorpusStats(passages);
  drawChapterChart(passages, chapters);
  drawTermsChart(topTerms);
  drawTopicTable(ctx, clusterTerms);

  const map = drawSemanticMap(ctx);
  const matrix = drawMatrix(ctx);
  const detail = drawDetailPanel(ctx);
  const controls = setupControls(ctx);

  ctx.update = () => {
    controls.update();
    map.update();
    matrix.update();
    detail.update();
  };

  ctx.select = passageId => {
    state.selected = passageId;
    ctx.update();
  };

  ctx.setFilters = ({ formal, topic }) => {
    if (formal !== undefined) state.formal = formal;
    if (topic !== undefined) state.topic = topic;
    ctx.update();
  };

  ctx.update();
});


function drawCorpusStats(passages) {
  const stats = [
    [formatNumber(passages.length), "Passages after cleaning (1,484 raw)"],
    [new Set(passages.map(d => d.chapter)).size, "Chapters (bulletin Parts)"],
    [new Set(passages.map(d => d.section)).size, "Formal sections"],
    [d3.format(".1f")(d3.mean(passages, d => d.word_count)), "Mean words per passage"],
    [d3.median(passages, d => d.word_count), "Median words per passage"]
  ];

  const tiles = d3.select("#corpus-stats")
    .selectAll(".stat")
    .data(stats)
    .join("div")
    .attr("class", "stat");

  tiles.append("span").attr("class", "stat-value").text(d => d[0]);
  tiles.append("span").attr("class", "stat-label").text(d => d[1]);
}

function drawChapterChart(passages, chapters) {
  const rows = chapters.map(chapter => {
    const subset = passages.filter(d => d.chapter === chapter);
    return {
      chapter,
      passages: subset.length,
      words: d3.mean(subset, d => d.word_count)
    };
  });

  const width = 900;
  const rowHeight = 24;
  const top = 30;
  const height = top + rows.length * rowHeight + 10;
  const labelWidth = 330;
  const panelGap = 60;
  const panelWidth = (width - labelWidth - panelGap - 50) / 2;

  const svg = d3.select("#chapter-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  const y = d3.scaleBand()
    .domain(chapters)
    .range([top, height - 10])
    .padding(0.2);

  svg.append("g")
    .selectAll("text")
    .data(rows)
    .join("text")
    .attr("x", labelWidth - 10)
    .attr("y", d => y(d.chapter) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .text(d => truncate(d.chapter, 52));

  const panels = [
    { key: "passages", title: "Passages", x0: labelWidth, format: formatNumber, color: "#4e79a7" },
    { key: "words", title: "Mean words per passage", x0: labelWidth + panelWidth + panelGap, format: d3.format(".0f"), color: "#9c755f" }
  ];

  panels.forEach(panel => {
    const x = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d[panel.key])])
      .range([panel.x0, panel.x0 + panelWidth]);

    const g = svg.append("g");

    g.append("text")
      .attr("class", "panel-title")
      .attr("x", panel.x0)
      .attr("y", 14)
      .text(panel.title);

    g.selectAll("rect")
      .data(rows)
      .join("rect")
      .attr("x", panel.x0)
      .attr("y", d => y(d.chapter))
      .attr("width", d => x(d[panel.key]) - panel.x0)
      .attr("height", y.bandwidth())
      .attr("fill", panel.color);

    g.selectAll(".value")
      .data(rows)
      .join("text")
      .attr("class", "value")
      .attr("x", d => x(d[panel.key]) + 5)
      .attr("y", d => y(d.chapter) + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .text(d => panel.format(d[panel.key]));
  });
}

function drawTermsChart(topTerms) {
  const terms = topTerms.slice(0, 20);

  const width = 900;
  const height = 230;
  const margin = { top: 10, right: 10, bottom: 70, left: 50 };

  const svg = d3.select("#terms-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  const x = d3.scaleBand()
    .domain(terms.map(d => d.term))
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(terms, d => d.count)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(y).ticks(5));

  svg.append("g")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-40)")
    .attr("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("dy", "0.3em");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -(height - margin.bottom) / 2)
    .attr("y", 12)
    .attr("text-anchor", "middle")
    .text("Occurrences");

  svg.append("g")
    .selectAll("rect")
    .data(terms)
    .join("rect")
    .attr("x", d => x(d.term))
    .attr("y", d => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.count))
    .attr("fill", "#4e79a7")
    .on("mouseover", (event, d) => showTooltip(`<strong>${d.term}</strong><br>${formatNumber(d.count)} occurrences`))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);
}

function drawTopicTable(ctx, clusterTerms) {
  const byCluster = new Map(clusterTerms.map(d => [d.cluster, d]));
  const rows = ctx.topics.map(t => byCluster.get(t.cluster));

  const tr = d3.select("#topic-table tbody")
    .selectAll("tr")
    .data(rows)
    .join("tr")
    .attr("class", "clickable")
    .on("click", (event, d) => {
      ctx.setFilters({ topic: state.topic === d.cluster ? "all" : d.cluster });
      document.getElementById("search").scrollIntoView({ behavior: "smooth", block: "start" });
    });

  tr.append("td")
    .html(d => `<i class="swatch" style="background:${ctx.topicColor(d.cluster)}"></i>${escapeHtml(d.cluster_name)}`);
  tr.append("td").text(d => d.passages);
  tr.append("td").text(d => d.top_terms);
  tr.append("td").text(d => d.top_sections.split("; ").join(" · "));
}


function drawSemanticMap(ctx) {
  const { passages, byId } = ctx;

  const svg = d3.select("#semantic-map")
    .append("svg")
    .attr("viewBox", `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`)
    .attr("width", MAP_WIDTH)
    .attr("height", MAP_HEIGHT);

  const xScale = d3.scaleLinear()
    .domain(d3.extent(passages, d => d.x))
    .range([MAP_MARGIN, MAP_WIDTH - MAP_MARGIN]);

  const yScale = d3.scaleLinear()
    .domain(d3.extent(passages, d => d.y))
    .range([MAP_HEIGHT - MAP_MARGIN, MAP_MARGIN]);

  const radius = d3.scaleSqrt()
    .domain([0, d3.max(passages, d => d.word_count)])
    .range([0, 7]);

  svg.append("rect")
    .attr("class", "map-background")
    .attr("width", MAP_WIDTH)
    .attr("height", MAP_HEIGHT)
    .on("click", () => ctx.select(null));

  const layer = svg.append("g");
  const linkLayer = layer.append("g").attr("class", "neighbor-links");

  let zoomScale = 1;

  const points = layer.append("g")
    .selectAll(".passage")
    .data(passages, d => d.passage_id)
    .join("circle")
    .attr("class", "passage")
    .attr("cx", d => xScale(d.x))
    .attr("cy", d => yScale(d.y))
    .attr("r", d => radius(d.word_count))
    .on("mouseover", (event, d) => {
      showTooltip(`
        <strong>${d.passage_id}</strong> · p. ${d.page}<br>
        ${escapeHtml(d.section)}<br>
        <em>${escapeHtml(d.cluster_name)}</em><br>
        ${escapeHtml(truncate(d.text, 140))}
      `);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      event.stopPropagation();
      ctx.select(state.selected === d.passage_id ? null : d.passage_id);
    });

  function pointRadius(d) {
    return radius(d.word_count) / Math.sqrt(zoomScale);
  }

  const zoom = d3.zoom()
    .scaleExtent([1, 16])
    .translateExtent([[0, 0], [MAP_WIDTH, MAP_HEIGHT]])
    .on("zoom", event => {
      zoomScale = event.transform.k;
      layer.attr("transform", event.transform);
      points.attr("r", pointRadius);
    });

  svg.call(zoom);

  d3.select("#reset-zoom").on("click", () => {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
  });

  const legend = drawMapLegend(ctx, radius);

  function update() {
    const selected = state.selected ? byId.get(state.selected) : null;
    const neighborIds = new Set(selected ? selected.neighbors : []);

    points
      .attr("fill", ctx.colorOf)
      .classed("selected", d => selected !== null && d.passage_id === selected.passage_id)
      .classed("neighbor", d => neighborIds.has(d.passage_id))
      .classed("inactive", d => !isActive(d) && d !== selected && !neighborIds.has(d.passage_id));

    points.filter(".neighbor").raise();
    points.filter(".selected").raise();

    const links = selected ? selected.neighbors.map(id => byId.get(id)) : [];

    linkLayer.selectAll("line")
      .data(links, d => d.passage_id)
      .join("line")
      .attr("x1", xScale(selected?.x ?? 0))
      .attr("y1", yScale(selected?.y ?? 0))
      .attr("x2", d => xScale(d.x))
      .attr("y2", d => yScale(d.y));

    legend.update();
  }

  return { update };
}

function drawMapLegend(ctx, radius) {
  const container = d3.select("#map-legend");

  const colorBlock = container.append("div").attr("class", "legend-block");
  const colorTitle = colorBlock.append("div").attr("class", "legend-title");
  const colorKeys = colorBlock.append("div").attr("class", "legend");

  const sizeBlock = container.append("div").attr("class", "legend-block");
  sizeBlock.append("div")
    .attr("class", "legend-title")
    .text("Passage length: circle area");
  const sizeKeys = sizeBlock.append("div").attr("class", "legend");

  [20, 80, 240].forEach(words => {
    const key = sizeKeys.append("span").attr("class", "key");
    const r = radius(words);
    key.append("svg")
      .attr("width", 2 * r + 2)
      .attr("height", 2 * r + 2)
      .append("circle")
      .attr("cx", r + 1)
      .attr("cy", r + 1)
      .attr("r", r)
      .attr("fill", "#bbb")
      .attr("stroke", "#fff");
    key.append("span").text(`${words} words`);
  });

  const markBlock = container.append("div").attr("class", "legend-block");
  markBlock.append("div").attr("class", "legend-title").text("Selection");
  markBlock.append("div")
    .attr("class", "legend")
    .html(`
      <span class="key"><i class="mark-selected"></i>Selected passage</span>
      <span class="key"><i class="mark-neighbor"></i>5 nearest semantic neighbours (linked)</span>
      <span class="key"><i class="mark-faded"></i>Filtered out</span>
    `);

  function update() {
    const byTopic = state.colorBy === "topic";

    colorTitle.text(
      byTopic
        ? "Semantic topic: point color (click to filter)"
        : "Bulletin chapter: point color (click to filter)"
    );

    const items = byTopic
      ? ctx.topics.map(t => ({
        label: t.name,
        color: ctx.topicColor(t.cluster),
        active: state.topic === t.cluster,
        onClick: () => ctx.setFilters({ topic: state.topic === t.cluster ? "all" : t.cluster })
      }))
      : ctx.chapters.map(chapter => ({
        label: shortChapter(chapter),
        color: ctx.chapterColor(chapter),
        active: state.formal === `chapter::${chapter}`,
        onClick: () => {
          const value = `chapter::${chapter}`;
          ctx.setFilters({ formal: state.formal === value ? "all" : value });
        }
      }));

    colorKeys.selectAll(".key")
      .data(items, d => d.label)
      .join(enter => {
        const key = enter.append("span").attr("class", "key clickable");
        key.append("i");
        key.append("span");
        return key;
      })
      .classed("active", d => d.active)
      .on("click", (event, d) => d.onClick())
      .call(key => key.select("i").style("background", d => d.color))
      .call(key => key.select("span").text(d => d.label));
  }

  return { update };
}


function drawMatrix(ctx) {
  const { passages, matrixRows, topics, chapters } = ctx;

  const sections = d3
    .groups(passages, d => d.section)
    .map(([section, rows]) => ({
      section,
      chapter: rows[0].chapter,
      first: d3.min(rows, d => d.index)
    }))
    .sort((a, b) => a.first - b.first);

  const columnsX = d3.scaleBand()
    .domain(topics.map(t => t.cluster))
    .range([MATRIX_LABEL_WIDTH, MATRIX_LABEL_WIDTH + topics.length * MATRIX_CELL]);

  const entropyX0 = MATRIX_LABEL_WIDTH + topics.length * MATRIX_CELL + 12;
  const width = entropyX0 + MATRIX_ENTROPY_WIDTH + 30;

  const entropyScale = d3.scaleLinear()
    .domain([0, Math.log2(topics.length)])
    .range([0, MATRIX_ENTROPY_WIDTH]);

  const header = d3.select("#matrix-header")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${MATRIX_HEADER_HEIGHT}`)
    .attr("width", width)
    .attr("height", MATRIX_HEADER_HEIGHT);

  const columnLabels = header.selectAll(".column-label")
    .data(topics)
    .join("g")
    .attr("class", "column-label clickable")
    .attr("transform", t => `translate(${columnsX(t.cluster) + MATRIX_CELL / 2}, ${MATRIX_HEADER_HEIGHT - 6})`)
    .on("click", (event, t) => ctx.setFilters({ topic: state.topic === t.cluster ? "all" : t.cluster }))
    .on("mouseover", (event, t) => showTooltip(`<strong>${escapeHtml(t.name)}</strong><br>${t.count} passages<br>Click to filter the map`))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

  columnLabels.append("rect")
    .attr("x", -MATRIX_CELL / 2 + 3)
    .attr("y", -8)
    .attr("width", MATRIX_CELL - 6)
    .attr("height", 6)
    .attr("fill", t => ctx.topicColor(t.cluster));

  columnLabels.append("text")
    .attr("transform", "translate(2, -14) rotate(-50)")
    .text(t => truncate(t.name, 26));

  header.append("text")
    .attr("class", "panel-title")
    .attr("x", entropyX0)
    .attr("y", MATRIX_HEADER_HEIGHT - 32)
    .text("Topic");
  header.append("text")
    .attr("class", "panel-title")
    .attr("x", entropyX0)
    .attr("y", MATRIX_HEADER_HEIGHT - 18)
    .text("diversity");

  header.append("text")
    .attr("class", "panel-title")
    .attr("x", MATRIX_LABEL_WIDTH - 8)
    .attr("y", MATRIX_HEADER_HEIGHT - 12)
    .attr("text-anchor", "end")
    .text("Formal section ↓   Semantic topic →");

  const body = d3.select("#matrix-body").append("svg");
  const rowLayer = body.append("g");

  const legend = d3.select("#matrix-legend");

  let lastScrolled = null;

  function buildRows() {
    if (state.rowMode === "chapter") {
      return chapters.map(chapter => ({
        type: "row",
        key: `chapter::${chapter}`,
        name: chapter,
        label: truncate(chapter, 40),
        chapter
      }));
    }

    const rows = [];
    let chapter = null;
    sections.forEach(s => {
      if (s.chapter !== chapter) {
        chapter = s.chapter;
        rows.push({ type: "header", key: `header::${chapter}`, label: truncate(chapter, 60), chapter });
      }
      rows.push({
        type: "row",
        key: `section::${s.section}`,
        name: s.section,
        label: truncate(s.section, 36),
        chapter
      });
    });
    return rows;
  }

  function cellCounts() {
    const level = state.rowMode;
    if (state.query === "") {
      return d3.rollup(
        matrixRows,
        v => d3.sum(v, d => d.count),
        d => `${level}::${d[level]}`,
        d => d.cluster
      );
    }
    return d3.rollup(
      passages.filter(matchesQuery),
      v => v.length,
      d => `${level}::${d[level]}`,
      d => d.cluster
    );
  }

  function update() {
    const rows = buildRows();
    const counts = cellCounts();
    const rowHeight = state.rowMode === "chapter" ? 24 : 15;
    const headerHeight = 20;

    let y = 4;
    rows.forEach(r => {
      r.y = y;
      y += r.type === "header" ? headerHeight : rowHeight;
      const rowCounts = counts.get(r.key) ?? new Map();
      r.cells = topics.map(t => ({
        row: r,
        topic: t,
        count: rowCounts.get(t.cluster) ?? 0
      }));
      r.total = d3.sum(r.cells, c => c.count);
      r.entropy = entropy(r.cells.map(c => c.count));
      r.topicsUsed = r.cells.filter(c => c.count > 0).length;
      r.cells.forEach(c => (c.share = r.total ? c.count / r.total : 0));
    });
    const height = y + 6;

    const topicTotals = new Map(topics.map(t => [
      t.cluster,
      d3.sum(rows, r => (r.type === "row" ? r.cells.find(c => c.topic === t).count : 0))
    ]));

    const maxCount = d3.max(rows, r => (r.type === "row" ? d3.max(r.cells, c => c.count) : 0)) || 1;

    const color = state.valueMode === "count"
      ? d3.scaleSequentialSqrt(d3.interpolateBlues).domain([0, maxCount])
      : d3.scaleSequential(d3.interpolateBlues).domain([0, 1]);

    const value = c => (state.valueMode === "count" ? c.count : c.share);
    const [domainMin, domainMax] = color.domain();
    const isDark = c => (value(c) - domainMin) / (domainMax - domainMin) > (state.valueMode === "count" ? 0.3 : 0.55);

    const selected = state.selected ? ctx.byId.get(state.selected) : null;
    const selectedKey = selected ? `${state.rowMode}::${selected[state.rowMode]}` : null;

    body.attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height);

    const rowGroups = rowLayer.selectAll(".matrix-row")
      .data(rows, r => r.key)
      .join(enter => {
        const g = enter.append("g");
        g.append("text").attr("class", "row-label");
        g.append("g").attr("class", "cells");
        g.append("rect").attr("class", "entropy-bar");
        g.append("text").attr("class", "entropy-label");
        return g;
      })
      .attr("class", r => `matrix-row ${r.type}`)
      .attr("transform", r => `translate(0, ${r.y})`);

    rowGroups.select(".row-label")
      .attr("x", r => (r.type === "header" ? 4 : MATRIX_LABEL_WIDTH - 6))
      .attr("y", r => (r.type === "header" ? headerHeight - 6 : rowHeight / 2))
      .attr("dy", r => (r.type === "header" ? 0 : "0.35em"))
      .attr("text-anchor", r => (r.type === "header" ? "start" : "end"))
      .classed("active", r => r.key === state.formal || r.key === selectedKey)
      .classed("clickable", r => r.type === "row")
      .text(r => (r.type === "row" ? `${r.label} (${r.total})` : r.label))
      .on("click", (event, r) => {
        if (r.type !== "row") return;
        ctx.setFilters({ formal: state.formal === r.key ? "all" : r.key, topic: "all" });
      })
      .on("mouseover", (event, r) => {
        if (r.type !== "row") return;
        showTooltip(`
          <strong>${escapeHtml(r.name)}</strong><br>
          ${escapeHtml(r.chapter)}<br>
          ${r.total} passages${state.query ? ` matching “${escapeHtml(state.query)}”` : ""}
          in ${r.topicsUsed} topics<br>
          Topic entropy: ${formatScore(r.entropy)} bits
        `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    rowGroups.select(".cells")
      .selectAll("rect")
      .data(r => (r.type === "row" ? r.cells : []), c => c.topic.cluster)
      .join("rect")
      .attr("x", c => columnsX(c.topic.cluster) + 1)
      .attr("y", 1)
      .attr("width", MATRIX_CELL - 2)
      .attr("height", rowHeight - 2)
      .attr("fill", c => (c.count === 0 ? "#f4f4f4" : color(value(c))))
      .classed("filter-cell", c => c.row.key === state.formal && c.topic.cluster === state.topic)
      .classed("selected-cell", c => c.row.key === selectedKey && selected && c.topic.cluster === selected.cluster)
      .on("click", (event, c) => {
        const same = state.formal === c.row.key && state.topic === c.topic.cluster;
        ctx.setFilters(same ? { formal: "all", topic: "all" } : { formal: c.row.key, topic: c.topic.cluster });
      })
      .on("mouseover", (event, c) => {
        const topicTotal = topicTotals.get(c.topic.cluster);
        showTooltip(`
          <strong>${escapeHtml(c.row.name)}</strong><br>
          Topic: <em>${escapeHtml(c.topic.name)}</em><br>
          ${c.count} passage${c.count === 1 ? "" : "s"}${state.query ? ` matching “${escapeHtml(state.query)}”` : ""}<br>
          ${formatPercent(c.share)} of this ${state.rowMode}'s passages<br>
          ${topicTotal ? formatPercent(c.count / topicTotal) : "0%"} of this topic's passages<br>
          Click to highlight in the map
        `);
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    rowGroups.select(".cells")
      .selectAll("text")
      .data(r => (r.type === "row" ? r.cells.filter(c => c.count > 0) : []), c => c.topic.cluster)
      .join("text")
      .attr("x", c => columnsX(c.topic.cluster) + MATRIX_CELL / 2)
      .attr("y", rowHeight / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("class", c => (isDark(c) ? "cell-value dark" : "cell-value"))
      .text(c => (state.valueMode === "count" ? c.count : Math.round(c.share * 100)));

    rowGroups.select(".entropy-bar")
      .attr("x", entropyX0)
      .attr("y", rowHeight / 2 - 3)
      .attr("width", r => (r.type === "row" ? entropyScale(r.entropy) : 0))
      .attr("height", 6);

    rowGroups.select(".entropy-label")
      .attr("x", r => entropyX0 + entropyScale(r.entropy) + 4)
      .attr("y", rowHeight / 2)
      .attr("dy", "0.35em")
      .text(r => (r.type === "row" && r.total > 0 ? formatScore(r.entropy) : ""));

    drawLegend(color, maxCount);

    if (selectedKey && selectedKey !== lastScrolled) {
      const row = rows.find(r => r.key === selectedKey);
      const box = document.getElementById("matrix-body");
      const scale = box.querySelector("svg").getBoundingClientRect().height / height;
      box.scrollTo({ top: row.y * scale - box.clientHeight / 2, behavior: "smooth" });
    }
    lastScrolled = selectedKey;
  }

  function drawLegend(color, maxCount) {
    legend.html("");
    const block = legend.append("div").attr("class", "legend-block");
    block.append("div")
      .attr("class", "legend-title")
      .text(state.valueMode === "count"
        ? `Cell color: number of passages${state.query ? " matching the search" : ""}`
        : "Cell color: share of the row's passages");

    const values = state.valueMode === "count"
      ? [...new Set([1, 5, 20, 60, maxCount].filter(v => v <= maxCount))]
      : [0.1, 0.25, 0.5, 0.75, 1];

    const keys = block.append("div").attr("class", "legend");
    keys.append("span")
      .attr("class", "key")
      .html(`<i style="background:#f4f4f4; border:1px solid #ddd"></i>0`);
    values.forEach(v => {
      keys.append("span")
        .attr("class", "key")
        .html(`<i style="background:${color(v)}"></i>${state.valueMode === "count" ? v : formatPercent(v)}`);
    });

    const entropyBlock = legend.append("div").attr("class", "legend-block");
    entropyBlock.append("div")
      .attr("class", "legend-title")
      .text(`Topic diversity: entropy of the row's topic mix in bits (0 = one topic, max ${formatScore(Math.log2(topics.length))})`);
  }

  d3.selectAll(".row-mode").on("click", function() {
    state.rowMode = this.dataset.mode;
    d3.selectAll(".row-mode").classed("active", (_, i, nodes) => nodes[i] === this);
    lastScrolled = null;
    ctx.update();
  });

  d3.selectAll(".value-mode").on("click", function() {
    state.valueMode = this.dataset.mode;
    d3.selectAll(".value-mode").classed("active", (_, i, nodes) => nodes[i] === this);
    ctx.update();
  });

  return { update };
}


function drawDetailPanel(ctx) {
  const panel = d3.select("#detail-panel");
  let shown = null;
  let shownQuery = null;

  function update() {
    if (state.selected === shown && state.query === shownQuery) return;
    shown = state.selected;
    shownQuery = state.query;

    if (!shown) {
      panel.html(`<p class="caveat">Click a point in the map to see the passage, where it sits in the bulletin, and its most similar passages.</p>`);
      return;
    }

    const d = ctx.byId.get(shown);
    const typicality = d.section_typicality === null
      ? "n/a (section has fewer than 3 passages)"
      : formatScore(d.section_typicality);

    panel.html(`
      <div class="detail-grid">
        <div>
          <h3>${escapeHtml(d.section)}</h3>
          <dl>
            <dt>Passage</dt><dd>${d.passage_id}</dd>
            <dt>Chapter</dt><dd>${escapeHtml(d.chapter)}</dd>
            <dt>Section</dt><dd>${escapeHtml(d.section)}</dd>
            <dt>Subsection</dt><dd>${escapeHtml(d.subsection || "—")}</dd>
            ${d.heading ? `<dt>Heading</dt><dd>${escapeHtml(d.heading)}</dd>` : ""}
            <dt>Page</dt><dd>${d.page}</dd>
            <dt>Semantic topic</dt><dd><i class="swatch" style="background:${ctx.topicColor(d.cluster)}"></i>${escapeHtml(d.cluster_name)}</dd>
            <dt>Length</dt><dd>${d.word_count} words</dd>
            <dt>Typicality</dt><dd>${typicality} <span class="caveat">(cosine similarity to its section's mean embedding)</span></dd>
          </dl>
          <p class="passage-text">${highlightQuery(d.text)}</p>
        </div>
        <div>
          <h4>5 nearest semantic neighbours</h4>
          <ol class="neighbor-list"></ol>
        </div>
      </div>
    `);

    const neighbors = d.neighbors.map((id, i) => ({
      passage: ctx.byId.get(id),
      score: d.neighbor_scores[i]
    }));

    const items = panel.select(".neighbor-list")
      .selectAll("li")
      .data(neighbors)
      .join("li")
      .attr("class", "clickable")
      .on("click", (event, n) => ctx.select(n.passage.passage_id));

    items.html(n => {
      const p = n.passage;
      const crossSection = p.section !== d.section
        ? `<span class="tag">different section</span>`
        : "";
      return `
        <div class="neighbor-meta">
          <strong>${formatScore(n.score)}</strong>
          <i class="swatch" style="background:${ctx.topicColor(p.cluster)}"></i>
          ${p.passage_id} · ${escapeHtml(p.section)} · p. ${p.page} ${crossSection}
        </div>
        <div class="neighbor-text">${escapeHtml(truncate(p.text, 220))}</div>
      `;
    });
  }

  return { update };
}


function setupControls(ctx) {
  const { passages, chapters, topics } = ctx;

  const search = d3.select("#search");
  const formalSelect = d3.select("#formal-filter");
  const topicSelect = d3.select("#topic-filter");

  formalSelect.append("option").attr("value", "all").text("All formal sections");

  chapters.forEach(chapter => {
    const group = formalSelect.append("optgroup").attr("label", chapter);
    const inChapter = passages.filter(d => d.chapter === chapter);
    group.append("option")
      .attr("value", `chapter::${chapter}`)
      .text(`All of ${shortChapter(chapter)} (${inChapter.length})`);

    d3.groups(inChapter, d => d.section).forEach(([section, rows]) => {
      group.append("option")
        .attr("value", `section::${section}`)
        .text(`  ${truncate(section, 60)} (${rows.length})`);
    });
  });

  topicSelect.append("option").attr("value", "all").text("All semantic topics");
  topics.forEach(t => {
    topicSelect.append("option").attr("value", t.cluster).text(`${t.name} (${t.count})`);
  });

  search.on("input", function() {
    state.query = this.value.toLowerCase().trim();
    ctx.update();
  });

  formalSelect.on("change", function() {
    ctx.setFilters({ formal: this.value });
  });

  topicSelect.on("change", function() {
    ctx.setFilters({ topic: this.value === "all" ? "all" : +this.value });
  });

  d3.selectAll(".quick-search").on("click", function() {
    const term = this.textContent;
    const next = state.query === term ? "" : term;
    search.property("value", next);
    state.query = next;
    ctx.update();
  });

  d3.selectAll(".color-by").on("click", function() {
    state.colorBy = this.dataset.color;
    d3.selectAll(".color-by").classed("active", (_, i, nodes) => nodes[i] === this);
    ctx.update();
  });

  d3.select("#clear-filters").on("click", () => {
    state.query = "";
    state.formal = "all";
    state.topic = "all";
    state.selected = null;
    search.property("value", "");
    ctx.update();
  });

  const status = d3.select("#map-status");

  function update() {
    formalSelect.property("value", state.formal);
    topicSelect.property("value", state.topic);
    d3.selectAll(".quick-search").classed("active", function() {
      return this.textContent === state.query;
    });

    const active = passages.filter(isActive);
    const parts = [];
    if (state.query) parts.push(`text contains “${escapeHtml(state.query)}”`);
    if (state.formal !== "all") parts.push(`${state.formal.split("::")[0]} = ${escapeHtml(state.formal.split("::")[1])}`);
    if (state.topic !== "all") parts.push(`topic = ${escapeHtml(ctx.topicName.get(state.topic))}`);

    const topicsHit = new Set(active.map(d => d.cluster)).size;
    const sectionsHit = new Set(active.map(d => d.section)).size;

    status.html(
      parts.length === 0
        ? `Showing all <strong>${formatNumber(passages.length)}</strong> passages.`
        : `<strong>${formatNumber(active.length)}</strong> of ${formatNumber(passages.length)} passages match
           (${parts.join(", ")}), across ${topicsHit} topic${topicsHit === 1 ? "" : "s"}
           and ${sectionsHit} section${sectionsHit === 1 ? "" : "s"}.`
    );
  }

  return { update };
}
