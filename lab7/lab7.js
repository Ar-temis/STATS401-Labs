const SECTORS = [
  "Manufacturing",
  "Logistics",
  "Retail",
  "Food",
  "Technology",
  "Wholesale",
  "Materials"
];

const REGIONS = ["Asia", "Europe", "North America"];

const REGION_SHAPES = {
  Asia: d3.symbolCircle,
  Europe: d3.symbolSquare,
  "North America": d3.symbolDiamond
};

const TRANSACTION_TYPES = [
  "goods",
  "shipping",
  "components",
  "materials",
  "services"
];

const TYPE_COLORS = {
  goods: "#e6a100",
  shipping: "#1b9e77",
  components: "#7570b3",
  materials: "#a6761d",
  services: "#e7298a"
};

const WIDTH = 900;
const HEIGHT = 560;

const OVERVIEW_WIDTH = 900;
const OVERVIEW_HEIGHT = 150;

const DAYS = 60;

const FRAME_MS = 800;

const REGION_ANCHORS = {
  Asia: { x: WIDTH * 0.25, y: HEIGHT * 0.32 },
  Europe: { x: WIDTH * 0.75, y: HEIGHT * 0.32 },
  "North America": { x: WIDTH * 0.5, y: HEIGHT * 0.76 }
};

const tooltip = d3.select("#tooltip");

const sectorColor = d3.scaleOrdinal()
  .domain(SECTORS)
  .range(d3.schemeTableau10);

const typeColor = d3.scaleOrdinal()
  .domain(TRANSACTION_TYPES)
  .range(TRANSACTION_TYPES.map(t => TYPE_COLORS[t]));

const formatDate = d3.timeFormat("%Y-%m-%d");
const formatDollars = d3.format("$,.0f");

let currentDay = 1;
let timer = null;

function linkKey(d) {
  const a = d.source.id ?? d.source;
  const b = d.target.id ?? d.target;
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function shortName(d) {
  return d.company_name.split(" ")[0];
}

function calculateVolume(companyId, currentLinks) {
  return d3.sum(
    currentLinks.filter(
      d => d.source === companyId || d.target === companyId
    ),
    d => d.amount_usd
  );
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
    "../data/lab7_assignment_companies.csv",
    d => ({
      id: d.id,
      company_name: d.company_name,
      sector: d.sector,
      region: d.region
    })
  ),
  d3.csv(
    "../data/lab7_assignment_transactions_60days.csv",
    d => ({
      date: d3.timeParse("%Y-%m-%d")(d.date),
      day: +d.day,
      source: d.source,
      target: d.target,
      amount_usd: +d.amount_usd,
      transaction_type: d.transaction_type,
      transaction_count: +d.transaction_count
    })
  )
])
  .then(([companies, transactions]) => {

    const byId = new Map(companies.map(c => [c.id, c]));

    companies.forEach(c => {
      const mine = transactions.filter(
        d => d.source === c.id || d.target === c.id
      );
      c.totalVolume = d3.sum(mine, d => d.amount_usd);
      c.activeDays = new Set(mine.map(d => d.day)).size;
      c.volume = 0;
      c.partners = [];
    });

    const dateOfDay = new Map(transactions.map(d => [d.day, d.date]));

    const dailyTotals = d3.range(1, DAYS + 1).map(day => {
      const links = transactions.filter(d => d.day === day);
      return {
        day,
        date: dateOfDay.get(day),
        links: links.length,
        value: d3.sum(links, d => d.amount_usd),
        companies: new Set(links.flatMap(d => [d.source, d.target])).size
      };
    });

    const network = drawNetwork(companies, transactions, byId);
    const overview = drawOverview(dailyTotals);

    drawLegend(companies, transactions);

    function showDay(day) {

      currentDay = day;

      const currentLinks = transactions.filter(d => d.day === day);

      network.update(currentLinks);
      overview.update(day);
      updateSummary(day, currentLinks);

      d3.select("#time-slider").property("value", day);
    }

    function updateSummary(day, currentLinks) {

      const totalValue = d3.sum(currentLinks, d => d.amount_usd);

      const activeCompanies = new Set(
        currentLinks.flatMap(d => [d.source, d.target])
      ).size;

      const crossRegion = currentLinks.filter(
        d => byId.get(d.source).region !== byId.get(d.target).region
      ).length;

      d3.select("#summary-day").text(`Day ${day}`);
      d3.select("#summary-date").text(formatDate(dateOfDay.get(day)));
      d3.select("#summary-companies").text(`${activeCompanies} / ${companies.length}`);
      d3.select("#summary-links").text(currentLinks.length);
      d3.select("#summary-cross").text(`${crossRegion} of ${currentLinks.length}`);
      d3.select("#summary-value").text(formatDollars(totalValue));
    }

    function play() {

      if (timer) return;

      if (currentDay >= DAYS) {
        currentDay = 0;
      }

      d3.select("#play").classed("active", true);

      timer = d3.interval(() => {

        currentDay += 1;

        showDay(currentDay);

        if (currentDay >= DAYS) {
          pause();
        }
      }, FRAME_MS);
    }

    function pause() {

      if (timer) {
        timer.stop();
        timer = null;
      }

      d3.select("#play").classed("active", false);
    }

    function reset() {

      pause();

      showDay(1);
    }

    d3.select("#play").on("click", play);
    d3.select("#pause").on("click", pause);
    d3.select("#reset").on("click", reset);

    d3.select("#time-slider")
      .on("input", function() {
        pause();
        showDay(+this.value);
      });

    d3.select("#prev-day").on("click", () => {
      pause();
      showDay(Math.max(1, currentDay - 1));
    });

    d3.select("#next-day").on("click", () => {
      pause();
      showDay(Math.min(DAYS, currentDay + 1));
    });

    overview.onSelect(day => {
      pause();
      showDay(day);
    });

    showDay(1);
  });

function drawNetwork(companies, transactions, byId) {

  const svg = d3.select("#network")
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
    .attr("width", WIDTH)
    .attr("height", HEIGHT);

  const zones = svg.append("g").attr("class", "zones");

  REGIONS.forEach(region => {
    const anchor = REGION_ANCHORS[region];
    zones.append("circle")
      .attr("cx", anchor.x)
      .attr("cy", anchor.y)
      .attr("r", 150);
    zones.append("text")
      .attr("x", anchor.x)
      .attr("y", anchor.y - 138)
      .attr("text-anchor", "middle")
      .text(region);
  });

  const linkGroup = svg.append("g").attr("class", "links");
  const hitGroup = svg.append("g").attr("class", "link-hits");
  const nodeGroup = svg.append("g").attr("class", "nodes");
  const labelGroup = svg.append("g").attr("class", "labels");

  const dateLabel = svg.append("text")
    .attr("class", "date-label")
    .attr("x", 20)
    .attr("y", HEIGHT - 20);

  const maxVolume = d3.max(
    d3.range(1, DAYS + 1),
    day => d3.max(
      companies,
      c => calculateVolume(c.id, transactions.filter(d => d.day === day))
    )
  );

  const areaScale = d3.scaleLinear()
    .domain([0, maxVolume])
    .range([120, 1500]);

  const radiusOf = d => Math.sqrt(areaScale(d.volume) / Math.PI);

  const symbol = d3.symbol()
    .type(d => REGION_SHAPES[d.region])
    .size(d => areaScale(d.volume));

  const widthScale = d3.scaleLinear()
    .domain(d3.extent(transactions, d => d.amount_usd))
    .range([1.5, 8]);

  d3.group(companies, d => d.region).forEach((members, region) => {
    const anchor = REGION_ANCHORS[region];
    members.forEach((c, i) => {
      const angle = (i / members.length) * 2 * Math.PI - Math.PI / 4;
      c.homeX = anchor.x + 70 * Math.cos(angle);
      c.homeY = anchor.y + 70 * Math.sin(angle);
      c.x = c.homeX;
      c.y = c.homeY;
    });
  });

  const node = nodeGroup
    .selectAll("path")
    .data(companies)
    .join("path")
    .attr("d", symbol)
    .attr("fill", d => sectorColor(d.sector))
    .style("cursor", "grab");

  const label = labelGroup
    .selectAll("text")
    .data(companies)
    .join("text")
    .text(shortName)
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none");

  let link = linkGroup.selectAll("line");
  let linkHit = hitGroup.selectAll("line");

  const simulation = d3.forceSimulation(companies)
    .force(
      "link",
      d3.forceLink()
        .id(d => d.id)
        .distance(130)
        .strength(0.15)
    )
    .force("charge", d3.forceManyBody().strength(-120))
    .force("collision", d3.forceCollide().radius(d => radiusOf(d) + 10))
    .force("x", d3.forceX(d => d.homeX).strength(0.3))
    .force("y", d3.forceY(d => d.homeY).strength(0.3))
    .on("tick", ticked);

  function ticked() {

    companies.forEach(d => {
      const r = radiusOf(d) + 4;
      d.x = Math.max(r, Math.min(WIDTH - r, d.x));
      d.y = Math.max(r + 10, Math.min(HEIGHT - r - 16, d.y));
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
      .attr("x", d => d.x)
      .attr("y", d => d.y + radiusOf(d) + 13);
  }

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

  function companyTooltip(d) {
    const partners = d.partners.length
      ? d.partners.map(p => byId.get(p).company_name).join(", ")
      : "none";
    return `
      <strong>${d.company_name}</strong> (${d.id})<br>
      Sector: ${d.sector}<br>
      Region: ${d.region}<br>
      <em>Day ${currentDay}</em><br>
      Volume today: ${formatDollars(d.volume)}<br>
      Partners today: ${partners}<br>
      <em>All 60 days</em><br>
      Total volume: ${formatDollars(d.totalVolume)}<br>
      Active on ${d.activeDays} of ${DAYS} days
    `;
  }

  function linkTooltip(d) {
    const a = byId.get(d.source.id);
    const b = byId.get(d.target.id);
    const cross = a.region === b.region ? `within ${a.region}` : `${a.region} ↔ ${b.region}`;
    return `
      <strong>${a.company_name} — ${b.company_name}</strong><br>
      ${formatDate(d.date)} (Day ${d.day})<br>
      Type: ${d.transaction_type}<br>
      Amount: ${formatDollars(d.amount_usd)}<br>
      Transactions: ${d.transaction_count}<br>
      ${cross}
    `;
  }

  node
    .on("mouseover", (event, d) => showTooltip(companyTooltip(d)))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);

  function update(currentLinks) {

    companies.forEach(c => {
      c.volume = calculateVolume(c.id, currentLinks);
      c.active = c.volume > 0;
      c.partners = currentLinks
        .filter(d => d.source === c.id || d.target === c.id)
        .map(d => d.source === c.id ? d.target : d.source);
    });

    const simLinks = currentLinks.map(d => ({ ...d }));

    link = linkGroup
      .selectAll("line")
      .data(simLinks, linkKey)
      .join(
        enter =>
          enter
            .append("line")
            .attr("stroke", d => typeColor(d.transaction_type))
            .attr("stroke-width", d => widthScale(d.amount_usd))
            .attr("stroke-linecap", "round")
            .attr("opacity", 0)
            .call(enter =>
              enter
                .transition()
                .duration(400)
                .attr("opacity", 1)
                .transition()
                .duration(600)
                .attr("opacity", 0.7)
            ),

        update =>
          update
            .call(update =>
              update
                .transition()
                .duration(400)
                .attr("stroke", d => typeColor(d.transaction_type))
                .attr("stroke-width", d => widthScale(d.amount_usd))
            ),

        exit =>
          exit
            .transition()
            .duration(400)
            .attr("opacity", 0)
            .remove()
      );

    linkHit = hitGroup
      .selectAll("line")
      .data(simLinks, linkKey)
      .join("line")
      .attr("stroke", "transparent")
      .attr("stroke-width", 14)
      .on("mouseover", (event, d) => showTooltip(linkTooltip(d)))
      .on("mousemove", moveTooltip)
      .on("mouseout", hideTooltip);

    node
      .classed("active", d => d.active)
      .transition()
      .duration(400)
      .attr("d", symbol);

    label.classed("active", d => d.active);

    dateLabel.text(
      `Day ${currentDay} · ${formatDate(currentLinks[0].date)}`
    );

    simulation.force("link").links(simLinks);

    simulation.force("collision").radius(d => radiusOf(d) + 10);

    simulation
      .nodes(companies)
      .alpha(0.3)
      .restart();
  }

  return { update };
}

function drawOverview(dailyTotals) {

  const margin = { top: 12, right: 20, bottom: 30, left: 60 };

  const svg = d3.select("#overview")
    .append("svg")
    .attr("viewBox", `0 0 ${OVERVIEW_WIDTH} ${OVERVIEW_HEIGHT}`)
    .attr("width", OVERVIEW_WIDTH)
    .attr("height", OVERVIEW_HEIGHT);

  const xScale = d3.scaleBand()
    .domain(d3.range(1, DAYS + 1))
    .range([margin.left, OVERVIEW_WIDTH - margin.right])
    .padding(0.15);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(dailyTotals, d => d.value)])
    .nice()
    .range([OVERVIEW_HEIGHT - margin.bottom, margin.top]);

  svg.append("g")
    .attr("transform", `translate(0,${OVERVIEW_HEIGHT - margin.bottom})`)
    .call(
      d3.axisBottom(xScale)
        .tickValues(d3.range(1, DAYS + 1).filter(d => d === 1 || d % 5 === 0))
        .tickFormat(d => `Day ${d}`)
    );

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3.axisLeft(yScale)
        .ticks(4)
        .tickFormat(d => `$${d / 1000}k`)
    );

  const bar = svg.append("g")
    .attr("class", "bars")
    .selectAll("rect")
    .data(dailyTotals)
    .join("rect")
    .attr("x", d => xScale(d.day))
    .attr("y", d => yScale(d.value))
    .attr("width", xScale.bandwidth())
    .attr("height", d => yScale(0) - yScale(d.value))
    .style("cursor", "pointer");

  let select = () => { };

  bar
    .on("mouseover", (event, d) =>
      showTooltip(`
        <strong>Day ${d.day}</strong> · ${formatDate(d.date)}<br>
        Active links: ${d.links}<br>
        Active companies: ${d.companies}<br>
        Total value: ${formatDollars(d.value)}
      `)
    )
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => select(d.day));

  function update(day) {
    bar.classed("current", d => d.day === day);
  }

  function onSelect(fn) {
    select = fn;
  }

  return { update, onSelect };
}

function drawLegend(companies, transactions) {

  const legend = d3.select("#network-legend");

  const [minA, maxA] = d3.extent(transactions, d => d.amount_usd);

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

  const sectors = section("Sector: Node color");

  SECTORS.forEach(sector => {
    const key = sectors.append("span").attr("class", "key");
    glyph(key, 14, 14, svg =>
      svg.append("circle")
        .attr("cx", 7).attr("cy", 7).attr("r", 6)
        .attr("fill", sectorColor(sector))
    );
    key.append("span").text(sector);
  });

  const regions = section("Region: Node shape & zone");

  REGIONS.forEach(region => {
    const key = regions.append("span").attr("class", "key");
    glyph(key, 16, 16, svg =>
      svg.append("path")
        .attr("transform", "translate(8, 8)")
        .attr("d", d3.symbol().type(REGION_SHAPES[region]).size(110)())
        .attr("fill", "#777")
    );
    key.append("span").text(region);
  });

  const activity = section("Today's transaction volume: Node area (grey outline = no transactions today)");

  [
    ["$0", 120, "inactive"],
    ["$40k", 810, "active"],
    ["$80k", 1500, "active"]
  ].forEach(([text, area, cls]) => {
    const key = activity.append("span").attr("class", "key");
    glyph(key, 46, 46, svg =>
      svg.append("path")
        .attr("class", `legend-node ${cls}`)
        .attr("transform", "translate(23, 23)")
        .attr("d", d3.symbol().type(d3.symbolCircle).size(area)())
        .attr("fill", "#bbb")
    );
    key.append("span").text(text);
  });

  const types = section("Transaction type: Link color");

  TRANSACTION_TYPES.forEach(type => {
    const key = types.append("span").attr("class", "key");
    glyph(key, 40, 10, svg =>
      svg.append("line")
        .attr("x1", 2).attr("y1", 5).attr("x2", 38).attr("y2", 5)
        .attr("stroke", typeColor(type))
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
    );
    key.append("span").text(type);
  });

  const amounts = section("Amount (USD): Link width");

  [[minA, 1.5], [(minA + maxA) / 2, 4.75], [maxA, 8]].forEach(([value, w]) => {
    const key = amounts.append("span").attr("class", "key");
    glyph(key, 40, 12, svg =>
      svg.append("line")
        .attr("x1", 2).attr("y1", 6).attr("x2", 38).attr("y2", 6)
        .attr("stroke", "#555")
        .attr("stroke-width", w)
        .attr("stroke-linecap", "round")
    );
    key.append("span").text(formatDollars(value));
  });

  const changes = section("Change over time");

  [
    ["New link fades in and flashes bright, then settles", 1],
    ["Disappearing link fades out", 0.25]
  ].forEach(([text, opacity]) => {
    const key = changes.append("span").attr("class", "key");
    glyph(key, 40, 10, svg =>
      svg.append("line")
        .attr("x1", 2).attr("y1", 5).attr("x2", 38).attr("y2", 5)
        .attr("stroke", "#555")
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("opacity", opacity)
    );
    key.append("span").text(text);
  });
}
