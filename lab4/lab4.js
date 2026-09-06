const SENTIMENTS = ["Negative", "Neutral", "Positive"];

const COLORS = {
  Negative: "#c1462f",
  Neutral: "#c9c4bc",
  Positive: "#2a7f62"
};

const MIN_TWEETS_PER_YEAR = 15;

const WIDTH = 900;
const HEIGHT = 470;
const MARGIN = { top: 30, right: 60, bottom: 50, left: 55 };

const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

async function loadData() {
  return await d3.csv(
    "../data/lab4_clean_tweets.csv",
    d => ({
      tweet_id: d.tweet_id,
      year: Number(d.year),
      platform: d.platform,
      text: d.text,
      likes: Number(d.likes),
      retweets: Number(d.retweets),
      sentiment: d.sentiment,
      sentiment_score: Number(d.sentiment_score)
    })
  );
}

function summarize(tweets) {

  const byYear = d3.group(tweets, d => d.year);

  return Array.from(byYear)
    .filter(([, rows]) => rows.length >= MIN_TWEETS_PER_YEAR)
    .map(([year, rows]) => {

      const counts = d3.rollup(rows, v => v.length, d => d.sentiment);

      const row = {
        year: year,
        total: rows.length,
        meanScore: d3.mean(rows, d => d.sentiment_score)
      };

      SENTIMENTS.forEach(sentiment => {
        row[sentiment] = (counts.get(sentiment) ?? 0) / rows.length;
        row[`${sentiment}_count`] = counts.get(sentiment) ?? 0;
      });

      return row;
    })
    .sort((a, b) => d3.ascending(a.year, b.year));
}

const svg = d3.select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

const plot = svg.append("g")
  .attr("transform", `translate(${MARGIN.left}, ${MARGIN.top})`);

const barsLayer = plot.append("g");
const lineLayer = plot.append("g");

const xAxisGroup = plot.append("g")
  .attr("transform", `translate(0, ${innerHeight})`);

const yAxisGroup = plot.append("g");

const scoreAxisGroup = plot.append("g")
  .attr("transform", `translate(${innerWidth}, 0)`);

plot.append("text")
  .attr("x", 0)
  .attr("y", -12)
  .attr("font-weight", "bold")
  .text("Share of tweets by sentiment");

plot.append("text")
  .attr("transform", `translate(${innerWidth + 45}, ${innerHeight / 2}) rotate(90)`)
  .attr("text-anchor", "middle")
  .attr("fill", "#555")
  .text("mean sentiment score");

const x = d3.scaleBand()
  .range([0, innerWidth])
  .padding(0.18);

const y = d3.scaleLinear()
  .domain([0, 1])
  .range([innerHeight, 0]);

const scoreScale = d3.scaleLinear()
  .domain([-0.5, 0.5])
  .range([innerHeight, 0]);

const tooltip = d3.select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

function showTooltip(event, html) {
  tooltip.html(html)
    .style("left", `${event.pageX + 14}px`)
    .style("top", `${event.pageY - 12}px`)
    .transition()
    .duration(100)
    .style("opacity", 1);
}

function hideTooltip() {
  tooltip.transition().duration(150).style("opacity", 0);
}

function draw(summary) {

  x.domain(summary.map(d => d.year));

  const stacked = d3.stack().keys(SENTIMENTS)(summary);

  barsLayer.selectAll("g.series")
    .data(stacked, series => series.key)
    .join("g")
    .attr("class", "series")
    .attr("fill", series => COLORS[series.key])
    .selectAll("rect")
    .data(
      series => series.map(d => ({ ...d, key: series.key })),
      d => d.data.year
    )
    .join(
      enter => enter.append("rect")
        .attr("x", d => x(d.data.year))
        .attr("width", x.bandwidth())
        .attr("y", innerHeight)
        .attr("height", 0),
      update => update
    )
    .on("mousemove", (event, d) => {
      const share = d3.format(".0%")(d.data[d.key]);
      showTooltip(
        event,
        `<strong>${d.data.year}</strong><br>` +
        `${d.key}: ${d.data[`${d.key}_count`]} tweets (${share})<br>` +
        `${d.data.total} tweets that year`
      );
    })
    .on("mouseleave", hideTooltip)
    .transition()
    .duration(600)
    .attr("x", d => x(d.data.year))
    .attr("width", x.bandwidth())
    .attr("y", d => y(d[1]))
    .attr("height", d => y(d[0]) - y(d[1]));

  const line = d3.line()
    .x(d => x(d.year) + x.bandwidth() / 2)
    .y(d => scoreScale(d.meanScore));

  lineLayer.selectAll("path.score-line")
    .data([summary])
    .join("path")
    .attr("class", "score-line")
    .attr("fill", "none")
    .attr("stroke", "#222")
    .attr("stroke-width", 2)
    .transition()
    .duration(600)
    .attr("d", line);

  lineLayer.selectAll("circle.score-dot")
    .data(summary, d => d.year)
    .join("circle")
    .attr("class", "score-dot")
    .attr("r", 4)
    .attr("fill", "#222")
    .on("mousemove", (event, d) => {
      showTooltip(
        event,
        `<strong>${d.year}</strong><br>` +
        `mean sentiment score: ${d3.format("+.3f")(d.meanScore)}`
      );
    })
    .on("mouseleave", hideTooltip)
    .transition()
    .duration(600)
    .attr("cx", d => x(d.year) + x.bandwidth() / 2)
    .attr("cy", d => scoreScale(d.meanScore));

  xAxisGroup.call(d3.axisBottom(x).tickFormat(d3.format("d")));

  yAxisGroup.call(d3.axisLeft(y).tickFormat(d3.format(".0%")));
  scoreAxisGroup.call(d3.axisRight(scoreScale).tickFormat(d3.format("+.1f")));
}

function drawLegend() {

  const legend = d3.select("#legend");

  legend.selectAll("span.key")
    .data(SENTIMENTS)
    .join("span")
    .attr("class", "key")
    .html(d => `<i style="background:${COLORS[d]}"></i>${d}`);

  legend.append("span")
    .attr("class", "key")
    .html('<i class="line-key"></i>Mean sentiment score');
}

async function start() {

  const tweets = await loadData();

  const platforms = Array.from(
    d3.rollup(tweets, v => v.length, d => d.platform)
  )
    .filter(([, count]) => count >= 100)
    .sort((a, b) => d3.descending(a[1], b[1]))
    .map(([platform]) => platform);

  const options = ["All devices", ...platforms];

  let selected = "All devices";

  function update() {
    const filtered = selected === "All devices"
      ? tweets
      : tweets.filter(d => d.platform === selected);

    const summary = summarize(filtered);
    const charted = d3.sum(summary, d => d.total);

    d3.select("#tweet-count")
      .text(
        `${charted} tweets, ${summary[0].year}\u2013` +
        `${summary[summary.length - 1].year}`
      );

    draw(summary);
  }

  d3.select("#controls")
    .selectAll("button")
    .data(options)
    .join("button")
    .attr("class", d => d === selected ? "active" : null)
    .text(d => d)
    .on("click", function(event, d) {
      selected = d;
      d3.select("#controls")
        .selectAll("button")
        .attr("class", option => option === selected ? "active" : null);
      update();
    });

  drawLegend();
  update();
}

start();
